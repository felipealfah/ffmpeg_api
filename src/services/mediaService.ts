import ffmpeg from 'fluent-ffmpeg';
import config from '../config/index';
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
import { getQueueService } from './queueService';
import {
  ffmpegMemoryUsage,
  ffmpegSigkillJobs,
  ffmpegOrphanedProcesses,
  activeRenderJobs,
  processMemoryUsage,
  ffmpegProcessMemory,
  memoryAlerts
} from '../middleware/metrics';
import { getConcurrencyControl } from '../services/concurrencyControl';

// Função para calcular duração da timeline
export const calculateTimelineDuration = (timeline: Timeline): number => {
  if (!timeline || !timeline.tracks) return 0;
  
  // Calcular a duração máxima entre todas as tracks
  let maxDuration = 0;
  
  for (const track of timeline.tracks) {
    let trackDuration = 0;
    
    for (const clip of track.clips) {
      const clipLength = typeof clip.length === 'number' ? clip.length : 0;
      trackDuration = Math.max(trackDuration, clip.start + clipLength);
    }
    
    maxDuration = Math.max(maxDuration, trackDuration);
  }
  
  return maxDuration;
};

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

// Aplicar configurações em cada comando FFmpeg
const applyFfmpegOptions = (command: ffmpeg.FfmpegCommand): void => {
  const options = config.ffmpegOptions;
  
  // Aplicar opções diretamente como argumentos do FFmpeg
  command
    .addOption('-threads', options.threads.toString())
    .addOption('-preset', options.preset)
    .addOption('-max_muxing_queue_size', '1024');
};

if (config?.ffprobePath) {
  ffmpeg.setFfprobePath(config.ffprobePath);
  console.log('FFprobe path configurado:', config.ffprobePath);
} else {
  console.warn('FFprobe path não encontrado no config, usando padrão do sistema');
}

// Função para adquirir o semáforo de renderização
const acquireRenderSemaphore = async (jobId: string): Promise<boolean> => {
  const concurrencyControl = await getConcurrencyControl();
  const acquired = await concurrencyControl.acquireSlot(jobId);
  
  if (acquired) {
    // Atualizar métrica do Prometheus
    const activeJobs = await concurrencyControl.getActiveJobs();
    activeRenderJobs.set(activeJobs.length);
    console.log(`🔒 Job ${jobId} adquiriu semáforo (${activeJobs.length} slots ativos)`);
    return true;
  }
  
  console.log(`⏳ Job ${jobId} aguardando slot de renderização`);
  return false;
};

// Função para liberar o semáforo de renderização
const releaseRenderSemaphore = async (jobId: string): Promise<void> => {
  const concurrencyControl = await getConcurrencyControl();
  await concurrencyControl.releaseSlot(jobId);
  
  const activeJobs = await concurrencyControl.getActiveJobs();
  activeRenderJobs.set(activeJobs.length);
  
  console.log(`🔓 Job ${jobId} liberou semáforo (${activeJobs.length} slots ativos)`);
};

// Função para aguardar slot de renderização disponível
const waitForRenderSlot = async (jobId: string): Promise<void> => {
  const maxAttempts = 60; // 5 minutos (5s * 60)
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    if (await acquireRenderSemaphore(jobId)) {
      return;
    }
    
    await new Promise(resolve => setTimeout(resolve, 5000)); // Espera 5s
    attempts++;
  }
  
  throw new Error('Timeout aguardando slot de renderização disponível');
};

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

// Função para limpar processos FFmpeg órfãos
const cleanupOrphanedProcesses = async (): Promise<void> => {
  try {
    const { exec } = require('child_process');
    const util = require('util');
    const execAsync = util.promisify(exec);
    
    // Encontrar processos FFmpeg órfãos (apenas em sistemas Unix)
    if (process.platform !== 'win32') {
      const { stdout } = await execAsync('pgrep -f ffmpeg || true');
      const ffmpegPids = stdout.trim().split('\n').filter((pid: string) => pid && pid !== '');
      
      if (ffmpegPids.length > 0) {
        console.log(`🧹 Encontrados ${ffmpegPids.length} processos FFmpeg órfãos, limpando...`);
        
        // Incrementar métrica de processos órfãos
        ffmpegOrphanedProcesses.inc(ffmpegPids.length);
        
        for (const pid of ffmpegPids) {
          try {
            await execAsync(`kill -TERM ${pid}`);
            console.log(`✅ Processo FFmpeg ${pid} terminado`);
          } catch (error) {
            console.warn(`⚠️  Não foi possível terminar processo FFmpeg ${pid}:`, error);
          }
        }
      }
    }
  } catch (error) {
    console.warn('⚠️  Erro ao limpar processos órfãos:', error);
  }
};

// Função para monitorar uso de recursos durante renderização
const monitorResourceUsage = (command: any, jobId: string): NodeJS.Timeout => {
  const startTime = Date.now();
  let lastMemoryCheck = Date.now();
  let warningCount = 0;
  const maxWarnings = 5; // Aumentado de 3 para 5
  const memoryLimit = config.ffmpegOptions.memoryLimitMB;
  let consecutiveHighMemory = 0;
  
  const memoryCheckInterval = setInterval(() => {
    // Atualizar métricas do processo Node.js
    const memoryUsage = process.memoryUsage();
    processMemoryUsage.set({ type: 'heap_used' }, memoryUsage.heapUsed);
    
    // Verificar uso de memória do FFmpeg
    if (command && command.ffmpegProc) {
      try {
        const usage = process.memoryUsage();
        const ffmpegMemoryMB = Math.round(usage.heapUsed / 1024 / 1024);
        
        // Atualizar métricas do Prometheus
        ffmpegProcessMemory.set(ffmpegMemoryMB);
        
        // Verificar limite de memória
        if (ffmpegMemoryMB > memoryLimit) {
          consecutiveHighMemory++;
          warningCount++;
          console.warn(`⚠️  Job ${jobId} - Alto uso de memória detectado: ${ffmpegMemoryMB}MB (Aviso ${warningCount}/${maxWarnings})`);
          memoryAlerts.inc();
          
          // Só mata o processo se tivermos 3 leituras consecutivas acima do limite
          if (warningCount >= maxWarnings && consecutiveHighMemory >= 3) {
            console.error(`❌ Job ${jobId} - Limite de memória excedido (${ffmpegMemoryMB}MB > ${memoryLimit}MB) por 3 verificações consecutivas`);
            command.kill();
            clearInterval(memoryCheckInterval);
            ffmpegSigkillJobs.inc();
          }
        } else {
          // Resetar contador de memória alta consecutiva se voltar ao normal
          consecutiveHighMemory = 0;
        }
      } catch (error) {
        console.error(`❌ Job ${jobId} - Erro ao monitorar memória:`, error);
        clearInterval(memoryCheckInterval);
      }
    }
  }, 10000); // Aumentado de 5s para 10s
  
  return memoryCheckInterval;
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
    const prevClipLength = typeof prevClip.length === 'number' ? prevClip.length : 0;
    if (
      'src' in clip.asset &&
      currentSource &&
      clip.asset.src === currentSource &&
      clip.start === prevClip.start + prevClipLength
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

// Função para resolver length "auto" para um valor numérico
const resolveClipLength = async (clip: Clip, filePath: string): Promise<number> => {
  if (clip.length === "auto") {
    // Obter a duração do vídeo
    const metadata = await new Promise<any>((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) reject(err);
        else resolve(metadata);
      });
    });
    
    const videoDuration = metadata.format.duration;
    const availableDuration = Math.max(0, videoDuration - clip.start);
    
    console.log(`🔄 Resolvendo length "auto": ${availableDuration}s (duração total: ${videoDuration}s, start: ${clip.start}s)`);
    
    return availableDuration;
  }
  
  return clip.length as number;
};

// Função para criar um clip otimizado a partir de um grupo de clips
const createOptimizedClip = (clips: Clip[]): Clip => {
  const firstClip = clips[0];
  const lastClip = clips[clips.length - 1];
  
  // Para clips otimizados, assumir que length já foi resolvido para número
  const lastClipLength = typeof lastClip.length === 'number' ? lastClip.length : 0;
  
  // Calcular a duração real baseada no start do primeiro clip e o end do último clip
  const realLength = (lastClip.start + lastClipLength) - firstClip.start;
  
  return {
    ...firstClip,
    length: realLength,
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
  
  // Se não há vídeos, criar um vídeo preto base
  if (videoClips.length === 0) {
    return `color=c=black:s=${output.width}x${output.height}:r=${output.fps || 30}:d=1[outv]`;
  }
  
  // Create filter parts for each video clip
  videoClips.forEach(({clip}, index) => {
    if (clip.asset.type === 'image') {
      // Para imagens: usar loop e configurar duração
      filterParts.push(`[${index}:v]loop=loop=-1:size=1:start=0,scale=${output.width}:${output.height},setpts=PTS-STARTPTS[v${index}]`);
    } else {
      // Para vídeos: escalar e processar áudio
      filterParts.push(`[${index}:v]scale=${output.width}:${output.height},setpts=PTS-STARTPTS[v${index}]`);
    }
  });
  
  // Concatenate all video segments
  const videoInputs = videoClips.map((_, index) => `[v${index}]`).join('');
  if (videoInputs) {
    filterParts.push(`${videoInputs}concat=n=${videoClips.length}:v=1:a=0[outv]`);
  }
  
  return filterParts.join(';');
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
  
  // Mapear vídeo do filtergraph
  outputOptions.push('-map [outv]');
  
  // Codec settings
  outputOptions.push(
    `-c:v ${output.format === 'gif' ? 'gif' : 'libx264'}`,
    `-preset ${output.quality === 'low' ? 'veryfast' : output.quality === 'high' ? 'medium' : 'faster'}`,
    `-b:v ${output.bitrate || '3000k'}`,
    '-movflags +faststart',
    '-pix_fmt yuv420p',
    '-avoid_negative_ts make_zero',
    '-fflags +genpts'
  );
  
  return outputOptions;
};

// Função para preparar o output
const prepareOutput = (renderRequest: RenderRequest): string => {
  if (renderRequest.output?.path) {
    return renderRequest.output.path;
  }

  // Gerar nome de arquivo único
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const format = renderRequest.output?.format || 'mp4';
  const fileName = `${timestamp}_output.${format}`;
  
  // Retornar path completo no diretório de saída
  return path.join(config.outputPath, fileName);
};

// Process timeline and categorize clips
const processTimeline = (timeline: any, preparedClips: any[]) => {
  const videoClips = preparedClips.filter(({clip}) => 
    clip.asset.type === 'video' || clip.asset.type === 'image'
  );
  const audioClips = preparedClips.filter(({clip}) => 
    clip.asset.type === 'audio' || (clip.asset.type === 'video' && clip.asset.hasAudio)
  );
  const subtitleClips = preparedClips.filter(({clip}) => 
    clip.asset.type === 'subtitle'
  );

  return {
    videoClips,
    audioClips,
    subtitleClips
  };
};

// Render the video from the timeline
export const renderVideo = async (
  jobId: string,
  request: RenderRequest,
  storage: any
): Promise<string> => {
  console.log(`🎯 Job ${jobId} iniciou processamento`);
  const { timeline, output } = request;
  const { tempDir, outputDir, fileName } = storage;

  try {
    // Criar diretórios se não existirem
    await fs.mkdir(tempDir, { recursive: true });
    await fs.mkdir(outputDir, { recursive: true });
    console.log('Diretórios para processamento:', { tempDir, outputDir });

    // Preparar todos os clips da timeline
    console.log('📥 Iniciando preparação dos assets...');
    const preparedClips: any[] = [];
    let inputIndex = 0;

    if (timeline?.tracks) {
      for (const track of timeline.tracks) {
        for (const clip of track.clips) {
          try {
            const assetInfo = 'src' in clip.asset ? clip.asset.src : 
                            'text' in clip.asset ? clip.asset.text : 
                            'asset sem identificação';
            console.log(`Preparando asset: ${clip.asset.type} - ${assetInfo}`);
            const localPath = await prepareClip(clip, tempDir);
            
            preparedClips.push({
              clip: {
                ...clip,
                _inputIndex: inputIndex,
                _localPath: localPath
              }
            });
            
            inputIndex++;
            console.log(`✅ Asset preparado: ${localPath}`);
          } catch (error) {
            console.error(`❌ Erro preparando asset:`, error);
            throw new Error(`Erro preparando asset: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
          }
        }
      }
    }

    if (preparedClips.length === 0) {
      throw new Error('Nenhum clip válido encontrado na timeline');
    }

    console.log(`📊 ${preparedClips.length} clips preparados. Iniciando renderização...`);

    // Processar timeline e extrair clips
    const { videoClips, audioClips, subtitleClips } = processTimeline(timeline, preparedClips);
    console.log(`📊 Timeline processada: ${videoClips.length} vídeos, ${audioClips.length} áudios, ${subtitleClips.length} legendas`);

    // Calcular duração total
    const timelineDuration = calculateTimelineDuration(timeline);
    console.log(`⏱️  Duração total: ${timelineDuration}s`);

    // Criar path de saída
    const outputPath = path.join(outputDir, fileName);
    console.log(`📁 Arquivo de saída: ${outputPath}`);

    // Renderizar usando FFmpeg
    return new Promise<string>((resolve, reject) => {
      try {
        let command = ffmpeg();

        // Adicionar inputs baseado nos clips preparados
        preparedClips.forEach(({ clip }) => {
          if (clip._localPath) {
            command = command.addInput(clip._localPath);
            console.log(`📎 Input adicionado: ${clip._localPath}`);
          }
        });

        // Criar filtergraph
        const complexFilter = createComplexFilterForMedia(videoClips, audioClips, subtitleClips, output);
        console.log(`🎛️  Filter complex: ${complexFilter}`);
        
        if (complexFilter) {
          command = command.complexFilter(complexFilter);
        }

        // Adicionar opções de saída
        const outputOptions = buildOutputOptions(videoClips, audioClips, subtitleClips, output, timelineDuration);
        console.log(`⚙️  Output options: ${outputOptions.join(' ')}`);
        
        outputOptions.forEach((option) => {
          if (option.startsWith('-threads ')) {
            const threads = option.split(' ')[1];
            command = command.addOption('-threads', threads);
          } else {
            command.addOption(option);
          }
        });

        // Configurar output e eventos
        command = command
          .output(outputPath)
          .addOption('-y') // Sobrescrever arquivo se existir
          .on('start', (commandLine) => {
            console.log('🚀 Comando FFmpeg iniciado:', commandLine);
            
            // Iniciar monitoramento de recursos
            monitorResourceUsage(command, jobId);
          })
          .on('progress', (progress) => {
            const percent = Math.round((progress.percent || 0) * 100) / 100;
            console.log(`📊 Progresso: ${percent}% completo`);
          })
          .on('end', async () => {
            console.log('✅ Renderização concluída com sucesso:', outputPath);
            
            // Verificar se deve fazer upload para Google Cloud Storage
            let finalOutputPath = outputPath;
            try {
              if (config.googleCloud?.enabled) {
                console.log('☁️ Iniciando upload para Google Cloud Storage...');
                const { getStorageService } = await import('./storageService');
                const storageService = getStorageService();
                
                const uploadResult = await storageService.uploadFile(outputPath, {
                  destination: `videos/${jobId}/${fileName}`,
                  public: true,
                  metadata: {
                    jobId: jobId,
                    uploadedAt: new Date().toISOString(),
                    originalFileName: fileName
                  }
                });
                
                console.log('✅ Upload concluído para GCS:', {
                  publicUrl: uploadResult.publicUrl,
                  gsUrl: uploadResult.gsUrl,
                  size: uploadResult.size
                });
                
                // Usar URL pública como output final
                finalOutputPath = uploadResult.publicUrl;
                
                // Opcional: Remover arquivo local após upload bem-sucedido
                // (descomente se quiser economizar espaço em disco)
                // await fs.unlink(outputPath);
                // console.log('🗑️ Arquivo local removido após upload para GCS');
              }
            } catch (uploadError) {
              console.warn('⚠️ Erro no upload para Google Cloud Storage:', uploadError);
              console.log('📁 Mantendo arquivo local como fallback');
              // Continuar com arquivo local em caso de erro de upload
            }
            
            // Limpar arquivos temporários
            try {
              await cleanupTempFiles(tempDir);
              console.log(`Diretório temporário removido: ${tempDir}`);
            } catch (cleanupError) {
              console.warn('Erro ao limpar arquivos temporários:', cleanupError);
            }
            
            resolve(finalOutputPath);
          })
          .on('error', async (err) => {
            console.error(`❌ Erro na renderização:`, err);
            
            // Limpar em caso de erro
            try {
              await cleanupTempFiles(tempDir);
            } catch (cleanupError) {
              console.warn('Erro ao limpar diretório temporário:', cleanupError);
            }
            
            reject(err);
          });
        
        // Executar comando
        console.log('Iniciando processo de renderização...');
        command.run();
        
      } catch (err) {
        console.error('Erro ao configurar FFmpeg:', err);
        reject(err);
      }
    });

  } catch (error) {
    console.error(`❌ Erro no processamento do job ${jobId}:`, error);
    throw error;
  } finally {
    // Cleanup já é feito no evento 'end' e 'error' do FFmpeg
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