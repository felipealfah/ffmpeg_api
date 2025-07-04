import ffmpeg from 'fluent-ffmpeg';
import config from '../config';
import path from 'path';
import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import { Readable } from 'stream';
import { finished } from 'stream/promises';
import { v4 as uuidv4 } from 'uuid';
import { RenderJob, RenderRequest, Clip, Track, Timeline, MediaType, AssetSource } from '../types/media';
import axios from 'axios';
import { downloadFile as downloadFileUtil, ensureDirectory, cleanupDirectory } from '../utils/file';
import { getStorageService } from './storageService';
import { logger } from '../utils/logger';

// Debug do config
console.log('Config no mediaService:', {
  ffmpegPath: config?.ffmpegPath,
  ffprobePath: config?.ffprobePath,
  configType: typeof config,
  configKeys: config ? Object.keys(config) : 'config is null/undefined'
});

// Configurar FFmpeg com caminhos explícitos
if (config?.ffmpegPath) {
  ffmpeg.setFfmpegPath(config.ffmpegPath);
  console.log('FFmpeg path configurado:', config.ffmpegPath);
} else {
  console.warn('FFmpeg path não encontrado no config, usando padrão do sistema');
}

if (config?.ffprobePath) {
  ffmpeg.setFfprobePath(config.ffprobePath);
  console.log('FFprobe path configurado:', config.ffprobePath);
} else {
  console.warn('FFprobe path não encontrado no config, usando padrão do sistema');
}

// Função para limpar arquivos temporários
const cleanupTempFiles = async (tempDir: string): Promise<void> => {
  try {
    await cleanupDirectory(tempDir);
    console.log(`Diretório temporário removido: ${tempDir}`);
  } catch (error) {
    console.error(`Erro ao remover diretório temporário ${tempDir}:`, error);
    throw error;
  }
};

// Função para calcular a duração total da timeline baseada nos clips
export const calculateTimelineDuration = (timeline: Timeline): number => {
  let totalDuration = 0;
  
  // Para cada track, calcular a duração baseada nos clips
  timeline.tracks.forEach((track, trackIndex) => {
    let trackDuration = 0;
    
    if (track.clips.length === 0) {
      trackDuration = 0;
    } else {
      // Verificar se há clips otimizados
      const optimizedClips = optimizeSequentialClips(track.clips);
      
      if (optimizedClips.length === 1 && optimizedClips[0]._optimized) {
        // Se temos um clip otimizado, usar sua duração total
        const optimizedClip = optimizedClips[0];
        trackDuration = optimizedClip.length;
        console.log(`Track ${trackIndex} otimizada:`, {
          originalClips: track.clips.length,
          duracaoTotal: trackDuration
        });
      } else {
        // Calcular duração baseada no último clip
        const lastClip = track.clips[track.clips.length - 1];
        trackDuration = lastClip.start + lastClip.length;
      }
    }
    
    // Atualizar duração total se esta track for mais longa
    totalDuration = Math.max(totalDuration, trackDuration);
  });
  
  return totalDuration;
};

// Get media information
export const getMediaInfo = async (url: string): Promise<any> => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(url, (err, metadata) => {
      if (err) {
        return reject(err);
      }
      resolve(metadata);
    });
  });
};

// Create a text image using FFmpeg
const createTextImage = async (
  text: string, 
  outputPath: string, 
  options: { 
    fontFamily?: string, 
    fontSize?: number, 
    fontColor?: string, 
    backgroundColor?: string,
    width?: number,
    height?: number,
    alignment?: 'left' | 'center' | 'right'
  } = {}
): Promise<string> => {
  const {
    fontFamily = 'Arial',
    fontSize = 24,
    fontColor = 'white',
    backgroundColor = 'black',
    width = 1280,
    height = 720,
    alignment = 'center'
  } = options;
  
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input('color=c=black:s=1280x720:d=5') // Create a black background
      .outputOptions([
        `-vf drawtext=text='${text}':fontfile='${fontFamily}':fontsize=${fontSize}:fontcolor=${fontColor}:box=1:boxcolor=${backgroundColor}:boxborderw=10:x=(w-text_w)/2:y=(h-text_h)/2`
      ])
      .output(outputPath)
      .on('end', () => {
        resolve(outputPath);
      })
      .on('error', (err) => {
        reject(err);
      })
      .run();
  });
};

// Função para otimizar clips sequenciais do mesmo vídeo
const optimizeSequentialClips = (clips: Clip[]): Clip[] => {
  if (clips.length <= 1) return clips;
  
  const optimizedClips: Clip[] = [];
  let currentGroup: Clip[] = [clips[0]];
  let currentSource = 'src' in clips[0].asset ? clips[0].asset.src : null;
  
  for (let i = 1; i < clips.length; i++) {
    const clip = clips[i];
    const prevClip = currentGroup[currentGroup.length - 1];
    
    // Verificar se é o mesmo vídeo e se é sequencial
    if (
      'src' in clip.asset &&
      currentSource &&
      clip.asset.src === currentSource &&
      clip.start === prevClip.start + prevClip.length
    ) {
      currentGroup.push(clip);
    } else {
      // Finalizar grupo atual
      if (currentGroup.length > 1) {
        optimizedClips.push(createOptimizedClip(currentGroup));
      } else {
        optimizedClips.push(currentGroup[0]);
      }
      
      // Iniciar novo grupo
      currentGroup = [clip];
      currentSource = 'src' in clip.asset ? clip.asset.src : null;
    }
  }
  
  // Processar último grupo
  if (currentGroup.length > 1) {
    optimizedClips.push(createOptimizedClip(currentGroup));
  } else {
    optimizedClips.push(currentGroup[0]);
  }
  
  return optimizedClips;
};

// Função para criar um clip otimizado a partir de um grupo de clips
const createOptimizedClip = (clips: Clip[]): Clip => {
  const firstClip = clips[0];
  const totalLength = clips.reduce((sum: number, clip: Clip) => sum + clip.length, 0);
  
  return {
    ...firstClip,
    length: totalLength,
    _optimized: true
  };
};

// Prepare a clip for the timeline
const prepareClip = async (clip: Clip, tempDir: string): Promise<string> => {
  try {
    const { asset } = clip;
    console.log('Preparando asset:', { 
      type: asset.type,
      source: 'src' in asset ? asset.src : 'text'
    });
    
    // Handle different asset types
    if (asset.type === MediaType.IMAGE || asset.type === MediaType.VIDEO || asset.type === MediaType.AUDIO || asset.type === MediaType.SUBTITLE) {
      if (asset.source === AssetSource.URL) {
        // Download from URL
        const extension = path.extname(asset.src) ||
          (asset.type === MediaType.IMAGE ? '.jpg' :
           asset.type === MediaType.AUDIO ? '.mp3' :
           asset.type === MediaType.SUBTITLE ? '.srt' : '.mp4');
        const localPath = path.join(tempDir, `asset_${Date.now()}${extension}`);
        
        console.log('Baixando arquivo de URL:', { 
          url: asset.src,
          localPath
        });
        
        try {
          await downloadFileUtil(asset.src, localPath);
          console.log('Arquivo baixado com sucesso:', localPath);
          return localPath;
        } catch (err) {
          console.error('Erro ao baixar arquivo:', err);
          throw err;
        }
      } else {
        // For local files, just return the path
        console.log('Usando arquivo local:', asset.src);
        return asset.src;
      }
    } else if (asset.type === MediaType.TEXT) {
      // Create text image
      const outputPath = path.join(tempDir, `text_${Date.now()}.png`);
      
      console.log('Criando imagem de texto:', { 
        text: asset.text,
        outputPath
      });
      
      try {
        await createTextImage(asset.text, outputPath, asset.style);
        console.log('Imagem de texto criada com sucesso:', outputPath);
        return outputPath;
      } catch (err) {
        console.error('Erro ao criar imagem de texto:', err);
        throw err;
      }
    }
    
    throw new Error("Unsupported asset type");
  } catch (error) {
    console.error('Erro no prepareClip:', error);
    throw error;
  }
};

// Função para validar e diagnosticar vídeos
const validateAndDiagnoseVideo = async (filePath: string, requestedClips: Clip[]): Promise<{
  duration: number;
  isValid: boolean;
  issues: string[];
  suggestions: string[];
  adjustedClips?: Clip[];
}> => {
  try {
    const metadata = await new Promise<any>((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) reject(err);
        else resolve(metadata);
      });
    });
    
    const duration = metadata.format.duration;
    const issues: string[] = [];
    const suggestions: string[] = [];
    let isValid = true;
    
    console.log('🔍 DIAGNÓSTICO COMPLETO DO VÍDEO:');
    console.log(`   📹 Arquivo: ${filePath.split('/').pop()}`);
    console.log(`   ⏱️  Duração total: ${duration}s`);
    
    // Validações...
    
    return {
      duration,
      isValid,
      issues,
      suggestions,
      adjustedClips: undefined
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido ao validar vídeo';
    console.error('Erro ao validar vídeo:', errorMessage);
    throw new Error(errorMessage);
  }
};

// Helper function to create subtitle filter
const createSubtitleFilter = (subtitleClip: any): string => {
  const { clip, path } = subtitleClip;
  const asset = clip.asset as any;
  const style = asset.style || {};
  
  const forceStyle = [
    `FontName=${style.fontFamily || 'DejaVu Serif'}`,
    `FontSize=${style.fontSize || 42}`,
    `PrimaryColour=&HFFFFFF&`,
    `OutlineColour=&H000000&`,
    `BorderStyle=1`,
    `Outline=3`,
    `Shadow=1`,
    `Bold=1`,
    `Alignment=2`,
    `MarginV=100`
  ].join(',');
  
  const escapedPath = path.replace(/'/g, "\\'");
  const escapedStyle = forceStyle.replace(/'/g, "\\'");
  return `subtitles='${escapedPath}':charenc=UTF-8:force_style='${escapedStyle}'`;
};

// Helper function to create complex filter for multiple media clips
const createComplexFilterForMedia = (
  videoClips: any[], 
  audioClips: any[], 
  subtitleClips: any[], 
  output: any
): string => {
  const filterParts: string[] = [];
  
  // Verificar se são imagens ou vídeos
  const hasImages = videoClips.some(({clip}) => clip.asset.type === 'image');
  const hasVideos = videoClips.some(({clip}) => clip.asset.type === 'video');
  
  console.log('🎬 Tipo de mídia detectado:', { hasImages, hasVideos });
  
  // Create filter parts for each video clip
  videoClips.forEach((_, index) => {
    const clip = videoClips[index].clip;
    const duration = clip.length || 5; // Default 5 seconds se não especificado
    
    if (clip.asset.type === 'image') {
      // Para imagens: usar loop e configurar duração
      filterParts.push(`[${index}:v]loop=loop=-1:size=1:start=0,scale=${output.resolution || '1280x720'},setpts=PTS-STARTPTS,fps=${output.fps || 30}[v${index}]`);
    } else {
      // Para vídeos: escalar vídeo e processar áudio
      filterParts.push(`[${index}:v]scale=${output.resolution || '1280x720'},fps=${output.fps || 30}[v${index}]`);
      filterParts.push(`[${index}:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[a${index}]`);
    }
  });
  
  // Create concatenation filter with specific durations
  let concatFilter = '';
  videoClips.forEach((_, index) => {
    const clip = videoClips[index].clip;
    const duration = clip.length || 5; // Default 5 seconds se não especificado
    
    if (clip.asset.type === 'image') {
      concatFilter += `[v${index}]trim=duration=${duration}[v${index}t];`;
    } else {
      // Para vídeos: usar trim start e end baseado no tempo para vídeo e áudio
      const startTime = clip.start || 0;
      const endTime = startTime + duration;
      concatFilter += `[v${index}]trim=start=${startTime}:end=${endTime}[v${index}t];`;
      concatFilter += `[a${index}]atrim=start=${startTime}:end=${endTime}[a${index}t];`;
    }
  });
  
  // Concatenate all video segments
  const videoInputs = videoClips.map((_, index) => `[v${index}t]`).join('');
  concatFilter += `${videoInputs}concat=n=${videoClips.length}:v=1:a=0[video_concat];`;
  
  // Concatenate all audio segments (apenas para vídeos)
  const audioInputs = videoClips
    .filter(({clip}) => clip.asset.type === 'video')
    .map((_, index) => `[a${index}t]`).join('');
  
  if (audioInputs) {
    const audioCount = videoClips.filter(({clip}) => clip.asset.type === 'video').length;
    concatFilter += `${audioInputs}concat=n=${audioCount}:v=0:a=1[audio_concat];`;
  }
  
  // Apply subtitles if available
  if (subtitleClips.length > 0) {
    const subtitleFilter = createSubtitleFilter(subtitleClips[0]);
    concatFilter += `[video_concat]${subtitleFilter}[outv]`;
  } else {
    concatFilter += `[video_concat]copy[outv]`;
  }
  
  const finalFilter = filterParts.join(';') + ';' + concatFilter;
  
  // Log do filtro para depuração
  console.log('🔧 Filtro complexo criado:', finalFilter);
  
  return finalFilter;
};

// Helper function to detect if audio filename suggests it's background music
const isBackgroundAudio = (audioSrc: string): boolean => {
  const bgKeywords = ['background', 'bg', 'fundo', 'ambient'];
  const filename = audioSrc.toLowerCase().split('/').pop() || '';
  return bgKeywords.some(keyword => filename.includes(keyword));
};

// Helper function to process audio clips and match video duration
const processAudioClips = (audioClips: any[], videoDuration: number): string => {
  const filterParts: string[] = [];
  
  console.log('🎵 Processando clips de áudio:', {
    numClips: audioClips.length,
    videoDuration
  });
  
  // Separar áudios de fundo dos principais
  const backgroundClips = audioClips.filter(({clip}) => 
    clip.asset.src && isBackgroundAudio(clip.asset.src)
  );
  const mainClips = audioClips.filter(({clip}) => 
    !clip.asset.src || !isBackgroundAudio(clip.asset.src)
  );
  
  console.log('🎵 Classificação de áudios:', {
    total: audioClips.length,
    background: backgroundClips.length,
    main: mainClips.length
  });
  
  // Processar áudios de fundo primeiro
  backgroundClips.forEach(({clip}, index) => {
    const inputLabel = `[${clip._inputIndex}:a]`;
    const bgIndex = `bg${index}`;
    
    // Normalizar e ajustar volume do áudio de fundo (mais baixo)
    filterParts.push(`${inputLabel}aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[norm${bgIndex}];`);
    filterParts.push(`[norm${bgIndex}]volume=0.3[vol${bgIndex}];`); // Volume 30% para background
    
    // Aplicar delay se especificado
    if (clip.start > 0) {
      filterParts.push(`[vol${bgIndex}]adelay=${clip.start * 1000}|${clip.start * 1000}[delay${bgIndex}];`);
    }
    
    // Garantir que cobre toda a duração com loop se necessário
    filterParts.push(`[${clip.start > 0 ? 'delay' : 'vol'}${bgIndex}]aloop=loop=-1:size=2s:start=0[loop${bgIndex}];`);
    filterParts.push(`[loop${bgIndex}]apad=whole_dur=${videoDuration}[pad${bgIndex}];`);
  });
  
  // Processar áudios principais
  mainClips.forEach(({clip}, index) => {
    const inputLabel = `[${clip._inputIndex}:a]`;
    const mainIndex = `main${index}`;
    
    // Normalizar e manter volume do áudio principal mais alto
    filterParts.push(`${inputLabel}aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[norm${mainIndex}];`);
    filterParts.push(`[norm${mainIndex}]volume=0.8[vol${mainIndex}];`); // Volume 80% para áudio principal
    
    // Aplicar delay se especificado
    if (clip.start > 0) {
      filterParts.push(`[vol${mainIndex}]adelay=${clip.start * 1000}|${clip.start * 1000}[delay${mainIndex}];`);
    }
    
    // Garantir duração adequada
    filterParts.push(`[${clip.start > 0 ? 'delay' : 'vol'}${mainIndex}]apad=whole_dur=${videoDuration}[pad${mainIndex}];`);
  });
  
  // Mixar áudios de fundo primeiro (se houver)
  if (backgroundClips.length > 0) {
    const bgInputs = backgroundClips.map((_, i) => `[pad${'bg' + i}]`).join('');
    if (backgroundClips.length > 1) {
      filterParts.push(`${bgInputs}amix=inputs=${backgroundClips.length}:duration=first:dropout_transition=3[bgmix];`);
    } else {
      filterParts.push(`${bgInputs}acopy[bgmix];`);
    }
  }
  
  // Mixar áudios principais (se houver)
  if (mainClips.length > 0) {
    const mainInputs = mainClips.map((_, i) => `[pad${'main' + i}]`).join('');
    if (mainClips.length > 1) {
      filterParts.push(`${mainInputs}amix=inputs=${mainClips.length}:duration=first:dropout_transition=3[mainmix];`);
    } else {
      filterParts.push(`${mainInputs}acopy[mainmix];`);
    }
  }
  
  // Mix final entre background e principais
  if (backgroundClips.length > 0 && mainClips.length > 0) {
    // Mixar background com principais com volumes balanceados
    filterParts.push('[bgmix][mainmix]amix=inputs=2:duration=first:weights=0.3 0.7[aout]');
  } else if (backgroundClips.length > 0) {
    filterParts.push('[bgmix]acopy[aout]');
  } else if (mainClips.length > 0) {
    filterParts.push('[mainmix]acopy[aout]');
  }
  
  const finalFilter = filterParts.join('');
  console.log('🔧 Filtro de áudio gerado:', finalFilter);
  
  return finalFilter;
};

// Helper function to build output options
const buildOutputOptions = (
  videoClips: any[], 
  audioClips: any[], 
  subtitleClips: any[], 
  output: any, 
  timelineDuration: number
): string[] => {
  const outputOptions = [];
  
  // Handle video mapping based on scenario
  if (videoClips.length === 1 && videoClips[0].clip._optimized) {
    // Caso OTIMIZADO: trim simples aplicado nas opções de saída
    const optimizedClip = videoClips[0].clip;
    console.log('🚀 Opções de saída otimizadas: trim simples');
    console.log(`   🎬 Aplicando trim: -ss ${optimizedClip.start} -t ${optimizedClip.length}`);
    
    // Aplicar trim nas opções de saída
    outputOptions.push(`-ss ${optimizedClip.start}`);
    outputOptions.push(`-t ${optimizedClip.length}`);
    
    // Mapear streams diretamente
    outputOptions.push('-map 0:v');
    
    // Se temos áudios, usar o áudio processado
    if (audioClips.length > 0) {
      outputOptions.push('-map [aout]');
    } else {
      outputOptions.push('-map 0:a');
    }
    
  } else if (videoClips.length === 1 && videoClips[0].clip.asset.type === 'image') {
    // Simple case: single image
    outputOptions.push(`-t ${timelineDuration}`);
    outputOptions.push(`-r ${output.fps || 30}`);
    
    if (audioClips.length > 0) {
      outputOptions.push('-map 0:v', '-map [aout]');
    }
  } else if (videoClips.length > 1) {
    // Complex case: multiple clips with complex filter
    outputOptions.push('-map [outv]');
    
    // Se temos áudios, usar o áudio processado
    if (audioClips.length > 0) {
      outputOptions.push('-map [aout]');
    } else {
      // Verificar se há vídeos com áudio para mapear
      const hasVideoAudio = videoClips.some(({clip}) => clip.asset.type === 'video');
      if (hasVideoAudio) {
        outputOptions.push('-map [audio_concat]');
      }
    }
  }
  
  // Codec settings
  outputOptions.push(
    `-c:v ${output.format === 'gif' ? 'gif' : 'libx264'}`,
    `-preset ${output.quality === 'low' ? 'ultrafast' : output.quality === 'high' ? 'slow' : 'medium'}`,
    `-b:v ${output.bitrate || '4000k'}`,  // Aumentar bitrate padrão
    '-movflags +faststart',  // Otimizar para streaming
    '-max_muxing_queue_size 9999',  // Aumentar fila de muxing
    '-thread_queue_size 4096',  // Aumentar fila de threads
    '-pix_fmt yuv420p'  // Garantir compatibilidade
  );

  // Configurações de áudio
  if (audioClips.length > 0 || videoClips.some(({clip}) => clip.asset.type === 'video')) {
    outputOptions.push(
      '-c:a aac',
      '-b:a 192k',  // Aumentar qualidade do áudio
      '-ar 48000',  // Aumentar sample rate
      '-ac 2'  // Forçar stereo
    );
  }
  
  return outputOptions;
};

// Função para preparar o output
const prepareOutput = (outputPath: string | undefined): string => {
  if (!outputPath || outputPath.trim() === '') {
    throw new Error('Output path é obrigatório');
  }
  return outputPath;
};

// Render the video from the timeline
export const renderVideo = async (
  renderRequest: RenderRequest, 
  progressCallback: (progress: number) => void = () => {}
): Promise<string> => {
  try {
    const { timeline, output } = renderRequest;
    
    console.log('Iniciando renderização do vídeo:', { 
      timelineTracks: timeline?.tracks?.length || 0,
      outputFormat: output?.format
    });
    
    // Verificar se os dados necessários estão presentes
    if (!timeline || !timeline.tracks || timeline.tracks.length === 0) {
      throw new Error('Timeline inválida: deve conter pelo menos uma trilha');
    }
    
    if (!output || !output.format) {
      throw new Error('Configuração de saída inválida: formato não especificado');
    }
    
    // Usar caminhos absolutos
    const jobId = uuidv4();
    const tempDir = path.join(process.cwd(), 'storage/temp', jobId);
    const outputDir = path.join(process.cwd(), 'storage/output', jobId);
    
    console.log('Diretórios para processamento:', { tempDir, outputDir });
    
    // Ensure directories exist
    try {
      await ensureDirectory(tempDir);
      await ensureDirectory(outputDir);
      console.log('Diretórios criados com sucesso');
    } catch (err) {
      console.error('Erro ao criar diretórios:', err);
      throw err;
    }
    
    // Prepare all clips
    console.log('Preparando clips...');
    const preparedClips: { track: Track; clipInfo: { path: string; clip: Clip }[] }[] = [];
    
    try {
      for (const track of timeline.tracks) {
        const clipInfo = [];
        
        // 🚀 APLICAR OTIMIZAÇÃO SEQUENCIAL ANTES DO PREPARO
        console.log('🔍 Verificando otimizações sequenciais...');
        const optimizedClips = optimizeSequentialClips(track.clips);
        
        if (optimizedClips.length !== track.clips.length) {
          console.log(`✅ OTIMIZAÇÃO APLICADA! ${track.clips.length} clips → ${optimizedClips.length} clips`);
        }
        
        for (const clip of optimizedClips) {
          console.log('Preparando clip:', { 
            type: clip.asset.type, 
            start: clip.start, 
            length: clip.length,
            optimized: clip._optimized || false
          });
          
          const localPath = await prepareClip(clip, tempDir);
          console.log('Clip preparado:', { localPath });
          
          // 🔍 VALIDAÇÃO E DIAGNÓSTICO COMPLETO DO VÍDEO
          if (clip.asset.type === 'video') {
            try {
              // Usar a função de diagnóstico completo
              const diagnosis = await validateAndDiagnoseVideo(localPath, [clip]);
              
              if (!diagnosis.isValid) {
                console.log('🚨 PROBLEMAS DETECTADOS:');
                diagnosis.issues.forEach((issue, index) => {
                  console.log(`   ${index + 1}. ${issue}`);
                });
                
                console.log('💡 SUGESTÕES:');
                diagnosis.suggestions.forEach((suggestion, index) => {
                  console.log(`   ${index + 1}. ${suggestion}`);
                });
                
                // 🔧 AUTO-AJUSTE INTELIGENTE
                const availableDuration = Math.max(0, diagnosis.duration - clip.start);
                
                if (availableDuration > 0) {
                  const originalLength = clip.length;
                  clip.length = Math.min(clip.length, availableDuration);
                  
                  console.log('🔧 AUTO-AJUSTE APLICADO:');
                  console.log(`   ✂️  Clip ajustado: ${clip.start}s - ${clip.start + clip.length}s`);
                  console.log(`   📏 Duração ajustada: ${originalLength}s → ${clip.length}s`);
                  console.log(`   ✅ Utilizando: ${((clip.length / originalLength) * 100).toFixed(1)}% do clip original`);
                } else {
                  console.log('❌ ERRO CRÍTICO: Start time maior que duração do vídeo!');
                  
                  // Ajustar para usar o máximo disponível
                  clip.start = 0;
                  clip.length = Math.min(clip.length, diagnosis.duration);
                  console.log(`   🔧 Ajuste automático aplicado: start=0, length=${clip.length}s`);
                }
              } else {
                console.log('✅ VÍDEO VÁLIDO: Todas as configurações estão corretas');
              }
            } catch (error) {
              console.warn('⚠️  Não foi possível validar o vídeo:', error instanceof Error ? error.message : String(error));
            }
          }
          
          clipInfo.push({ path: localPath, clip });
        }
        
        preparedClips.push({ track, clipInfo });
      }
      
      console.log('Clips preparados com sucesso:', { 
        trackCount: preparedClips.length,
        clipCount: preparedClips.reduce((acc, t) => acc + t.clipInfo.length, 0)
      });
    } catch (err) {
      console.error('Erro ao preparar clips:', err);
      throw err;
    }
    
    // Create output file path
    const outputFilename = `output.${output.format}`;
    const outputPath = path.join(outputDir, outputFilename);
    
    console.log('Caminho do arquivo de saída:', outputPath);
    
    // Build FFmpeg command based on timeline structure
    return new Promise((resolve, reject) => {
      try {
        // Calcular duração total baseada nos clips
        const timelineDuration = calculateTimelineDuration(timeline);
        console.log('Duração calculada da timeline:', timelineDuration);
        
        // Separar clips de vídeo/imagem, áudio e legendas ANTES de criar o comando
        const videoClips = preparedClips
          .flatMap(p => p.clipInfo)
          .filter(({ clip }) => clip.asset.type === 'image' || clip.asset.type === 'video');
        
        const audioClips = preparedClips
          .flatMap(p => p.clipInfo)
          .filter(({ clip }) => clip.asset.type === 'audio');
        
        const subtitleClips = preparedClips
          .flatMap(p => p.clipInfo)
          .filter(({ clip }) => clip.asset.type === 'subtitle');
        
        if (videoClips.length === 0) {
          throw new Error('Nenhum clipe de vídeo ou imagem encontrado');
        }
        
        console.log(`Processando ${videoClips.length} clips de vídeo/imagem, ${audioClips.length} clips de áudio e ${subtitleClips.length} clips de legenda`);
        
        // CRIAR O COMANDO FFMPEG APENAS UMA VEZ
        let command = ffmpeg();
        
        // Adicionar TODOS os inputs de uma só vez
        console.log('Adicionando inputs ao FFmpeg:', { 
          videoClips: videoClips.length,
          audioClips: audioClips.length,
          subtitleClips: subtitleClips.length
        });
        
        // 1. Adicionar inputs de vídeo/imagem
        videoClips.forEach(({ path }, index) => {
          console.log(`Adicionando input de vídeo ${index}:`, path);
          if (videoClips[index].clip.asset.type === 'image') {
            // Para imagens, adicionar com opção de loop
            command = command.addInput(path).inputOptions([
              '-loop 1',
              '-hwaccel auto',  // Habilitar aceleração de hardware
              '-analyzeduration 100M',  // Aumentar tempo de análise
              '-probesize 100M'  // Aumentar tamanho de probe
            ]);
          } else {
            command = command.addInput(path).inputOptions([
              '-hwaccel auto',  // Habilitar aceleração de hardware
              '-analyzeduration 100M',  // Aumentar tempo de análise
              '-probesize 100M'  // Aumentar tamanho de probe
            ]);
          }
        });
        
        // 2. Adicionar inputs de áudio
        audioClips.forEach((clipInfo, index) => {
          clipInfo.clip._inputIndex = videoClips.length + index;
          const path = clipInfo.path;
          console.log(`Adicionando input de áudio ${index}:`, path);
          command = command.addInput(path).inputOptions([
            '-analyzeduration 100M',  // Aumentar tempo de análise
            '-probesize 100M'  // Aumentar tamanho de probe
          ]);
        });
        
        // Determinar a lógica de processamento baseada nos tipos de clips
        if (videoClips.length === 1 && videoClips[0].clip._optimized) {
          // Caso OTIMIZADO: clip único de um vídeo sequencial - usar trim simples
          const optimizedClip = videoClips[0].clip;
          console.log('🚀 Processando caso OTIMIZADO: trim simples');
          console.log(`   ⏱️  Trim: ${optimizedClip.start}s - ${optimizedClip.start + optimizedClip.length}s`);
          
          // Aplicar legendas se disponível
          if (subtitleClips.length > 0) {
            console.log('Aplicando legendas ao caso otimizado');
            const subtitleFilter = createSubtitleFilter(subtitleClips[0]);
            command = command.videoFilters(subtitleFilter);
          }
          
        } else if (videoClips.length === 1 && videoClips[0].clip.asset.type === 'image') {
          // Caso simples: uma imagem com duração específica
          console.log('Processando caso simples: uma imagem');
          
          // Aplicar legendas se disponível
          if (subtitleClips.length > 0) {
            console.log('Aplicando legendas ao caso simples');
            const subtitleFilter = createSubtitleFilter(subtitleClips[0]);
            command = command.videoFilters(subtitleFilter);
          }
          
        } else if (videoClips.length > 1) {
          // Caso complexo: múltiplas imagens ou vídeos
          console.log('Processando caso complexo: múltiplos clips');
          const complexFilter = createComplexFilterForMedia(videoClips, audioClips, subtitleClips, output);
          console.log('Filtro complexo criado:', complexFilter);
          command = command.complexFilter(complexFilter);
          
        } else {
          // Caso fallback: apenas um clip
          console.log('Processando caso fallback: um clip');
          // Para casos mais simples, pode ser necessário lógica adicional
        }
        
        // Configurar opções de saída
        const outputOptions = buildOutputOptions(videoClips, audioClips, subtitleClips, output, timelineDuration);
        console.log('Opções de saída:', outputOptions);
        command = command.outputOptions(outputOptions);
        
        // Configurar filtro de mixagem de áudio se necessário
        if (audioClips.length > 1) {
          console.log(`Criando filtro de mixagem para ${audioClips.length} áudios`);
          const audioInputs = audioClips.map((_, index) => `[${videoClips.length + index}:a]`).join('');
          const mixFilter = `${audioInputs}amix=inputs=${audioClips.length}:duration=first:dropout_transition=2[aout]`;
          
          // Se já existe um filtro complexo, precisamos combiná-los
          // Por simplicidade, vamos aplicar o filtro de áudio separadamente se necessário
          if (videoClips.length === 1) {
            command = command.complexFilter(mixFilter);
          }
        }

        if (audioClips.length > 0) {
          console.log('Processando áudios para corresponder à duração do vídeo...');
          const audioFilter = processAudioClips(audioClips, timelineDuration);
          
          // Se já existe um filtro complexo para vídeo, combinar com o filtro de áudio
          if (videoClips.length > 1) {
            const videoFilter = createComplexFilterForMedia(videoClips, [], subtitleClips, output);
            command = command.complexFilter(videoFilter + ';' + audioFilter);
          } else {
            // Se não há filtro complexo de vídeo, aplicar apenas o filtro de áudio
            command = command.complexFilter(audioFilter);
          }
        }
        
        // Set output format specific options
        if (output.format === 'hls') {
          command = command.outputOptions([
            '-hls_time 10',
            '-hls_list_size 0',
            '-f hls'
          ]);
        }
        
        // Set output file and handlers
        command = command
          .output(outputPath)
          .on('progress', (progress) => {
            const percent = Math.round((progress.percent || 0) * 100) / 100;
            console.log(`📊 Progresso: ${percent}% completo`, {
              frames: progress.frames,
              fps: progress.currentFps,
              kbps: progress.currentKbps,
              time: progress.timemark
            });
            progressCallback(percent);
          })
          .on('end', async () => {
            console.log('Renderização concluída com sucesso:', outputPath);
            
            let finalOutputUrl = outputPath;
            
            // Upload para Google Cloud Storage se habilitado
            if (config.googleCloud.enabled) {
              try {
                console.log('Fazendo upload para Google Cloud Storage...');
                const storageService = getStorageService();
                
                // Gerar nome único para o arquivo no GCS
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const fileName = `renders/${jobId}/${timestamp}_${path.basename(outputPath)}`;
                
                const uploadResult = await storageService.uploadFile(outputPath, {
                  destination: fileName,
                  public: true,
                  metadata: {
                    jobId: jobId,
                    format: output.format,
                    resolution: output.resolution || '1280x720',
                    quality: output.quality || 'medium',
                    createdAt: new Date().toISOString()
                  }
                });
                
                console.log('Upload para GCS concluído:', {
                  fileName: uploadResult.fileName,
                  size: uploadResult.size,
                  publicUrl: uploadResult.publicUrl
                });
                
                // Usar a URL pública do GCS como resultado final
                finalOutputUrl = uploadResult.publicUrl || outputPath;
                
                // Remover arquivo local após upload bem-sucedido
                try {
                  await fs.unlink(outputPath);
                  console.log('Arquivo local removido após upload para GCS');
                } catch (unlinkError) {
                  console.warn('Erro ao remover arquivo local:', unlinkError);
                }
                
              } catch (uploadError) {
                console.error('Erro no upload para GCS:', uploadError);
                console.log('Mantendo arquivo local como fallback');
                // Continuar com o arquivo local se o upload falhar
              }
            }
            
            // Limpar arquivos temporários após sucesso
            try {
              console.log('Limpando arquivos temporários...');
              await cleanupTempFiles(tempDir);
              console.log('Arquivos temporários removidos com sucesso');
            } catch (cleanupError) {
              console.warn('Erro ao limpar arquivos temporários:', cleanupError);
              // Não falhar o job por causa da limpeza
            }

            // Disparar webhook se fornecido
            if (renderRequest.webhook) {
              console.log('🔔 Disparando webhook:', renderRequest.webhook);
              try {
                const webhookPayload = {
                  jobId: jobId,
                  status: 'completed',
                  outputUrl: finalOutputUrl,
                  metadata: {
                    format: output.format,
                    resolution: output.resolution || '1280x720',
                    quality: output.quality || 'medium',
                    fps: output.fps || 30,
                    storageType: config.googleCloud.enabled ? 'gcs' : 'local'
                  },
                  completedAt: new Date().toISOString()
                };

                const response = await axios.post(renderRequest.webhook, webhookPayload, {
                  timeout: 10000, // 10 segundos de timeout
                  headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'FFmpeg-API-Webhook/1.0'
                  }
                });

                console.log('✅ Webhook disparado com sucesso:', {
                  url: renderRequest.webhook,
                  status: response.status,
                  jobId: jobId
                });
              } catch (webhookError) {
                console.error('❌ Erro ao disparar webhook:', {
                  url: renderRequest.webhook,
                  error: webhookError instanceof Error ? webhookError.message : 'Unknown error',
                  jobId: jobId
                });
                // Não falhar o job principal por causa do webhook
              }
            }
            
            resolve(finalOutputUrl);
          })
          .on('error', async (err) => {
            console.error('Erro na renderização:', err);
            
            // Limpar arquivos temporários mesmo em caso de erro
            try {
              console.log('Limpando arquivos temporários após erro...');
              await cleanupTempFiles(tempDir);
            } catch (cleanupError) {
              console.warn('Erro ao limpar arquivos temporários após falha:', cleanupError);
            }

            // Disparar webhook em caso de erro (se fornecido)
            if (renderRequest.webhook) {
              console.log('🔔 Disparando webhook de erro:', renderRequest.webhook);
              try {
                const webhookPayload = {
                  jobId: jobId,
                  status: 'failed',
                  error: err.message || 'Unknown error during video processing',
                  failedAt: new Date().toISOString()
                };

                await axios.post(renderRequest.webhook, webhookPayload, {
                  timeout: 10000,
                  headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'FFmpeg-API-Webhook/1.0'
                  }
                });

                console.log('✅ Webhook de erro disparado com sucesso:', {
                  url: renderRequest.webhook,
                  jobId: jobId
                });
              } catch (webhookError) {
                console.error('❌ Erro ao disparar webhook de erro:', {
                  url: renderRequest.webhook,
                  error: webhookError instanceof Error ? webhookError.message : 'Unknown error',
                  jobId: jobId
                });
              }
            }
            
            reject(err);
          });
        
        // Run the command
        console.log('Iniciando processo de renderização...');
        command.run();
        
      } catch (err) {
        console.error('Erro ao configurar FFmpeg:', err);
        reject(err);
      }
    });
  } catch (error) {
    console.error('Erro no renderVideo:', error);
    throw error;
  }
};

// Generate a thumbnail from a video
export const generateThumbnail = async (
  videoPath: string, 
  outputPath: string, 
  timestamp = '00:00:01'
): Promise<string> => {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .screenshots({
        timestamps: [timestamp],
        folder: path.dirname(outputPath),
        filename: path.basename(outputPath),
        size: '320x180'
      })
      .on('end', () => {
        resolve(outputPath);
      })
      .on('error', (err) => {
        reject(err);
      });
  });
}; 

// Download file function for Express response
export const downloadFile = async (filePath: string, res: any): Promise<void> => {
  try {
    const fs = await import('fs');
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error('File not found');
    }
    
    // Get file extension and set content type
    const ext = path.extname(filePath).toLowerCase();
    let contentType = 'application/octet-stream';
    
    if (ext === '.mp4') {
      contentType = 'video/mp4';
    } else if (ext === '.mov') {
      contentType = 'video/quicktime';
    } else if (ext === '.gif') {
      contentType = 'image/gif';
    } else if (ext === '.m3u8') {
      contentType = 'application/x-mpegURL';
    }
    
    // Set headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
    
    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
  } catch (error) {
    console.error('Error downloading file:', error);
    throw error;
  }
}; 