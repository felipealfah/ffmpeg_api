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
    .addOption('-memory_limit', options.memoryLimitMB.toString())
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
  const maxWarnings = 3;
  const memoryLimit = config.ffmpegOptions.memoryLimitMB;
  
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
          warningCount++;
          console.warn(`⚠️  Job ${jobId} - Alto uso de memória detectado: ${ffmpegMemoryMB}MB`);
          memoryAlerts.inc();
          
          if (warningCount >= maxWarnings) {
            console.error(`❌ Job ${jobId} - Limite de memória excedido (${ffmpegMemoryMB}MB > ${memoryLimit}MB)`);
            command.kill();
            clearInterval(memoryCheckInterval);
            ffmpegSigkillJobs.inc();
          }
        }
      } catch (error) {
        console.error(`❌ Job ${jobId} - Erro ao monitorar memória:`, error);
        clearInterval(memoryCheckInterval);
      }
    }
  }, 5000); // Verificar a cada 5 segundos
  
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
    `-preset ${output.quality === 'low' ? 'veryfast' : output.quality === 'high' ? 'medium' : 'faster'}`,
    `-threads 5`,
    `-b:v ${output.bitrate || '3000k'}`, // Bitrate moderado
    '-movflags +faststart',
    '-max_muxing_queue_size 1024',
    '-pix_fmt yuv420p',
    '-avoid_negative_ts make_zero',
    '-fflags +genpts',
    // Otimizações balanceadas para os recursos disponíveis
    '-tile-columns 4',
    '-frame-parallel 1',
    '-cpu-used 3', // Valor médio entre desempenho e qualidade
    '-row-mt 1',
    '-bufsize 4000k',
    '-maxrate 4000k'
  );

  // Configurações de áudio
  if (audioClips.length > 0 || videoClips.some(({clip}) => clip.asset.type === 'video')) {
    outputOptions.push(
      '-c:a aac',
      '-b:a 128k',  // Qualidade de áudio moderada
      '-ar 44100',  // Sample rate padrão
      '-ac 2',
      '-shortest',
      '-async 1'
    );
  }
  
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

// Render the video from the timeline
export const renderVideo = async (
  renderRequest: RenderRequest, 
  progressCallback: (progress: number) => void = () => {}
): Promise<string> => {
  const jobId = renderRequest.jobId || uuidv4();
  const tempDir = path.join(config.tempPath, jobId);
  const outputPath = prepareOutput(renderRequest);

  // Tentar adquirir slot para renderização
  const concurrencyControl = getConcurrencyControl();
  const slotAcquired = await concurrencyControl.acquireSlot(jobId);
  
  if (!slotAcquired) {
    throw new Error('Failed to acquire render semaphore');
  }

  try {
    // Criar diretório temporário
    await fs.mkdir(tempDir, { recursive: true });

    return new Promise<string>((resolve, reject) => {
      try {
        // Configurar comando FFmpeg
        let command = ffmpeg();
        
        // Aplicar configurações globais
        applyFfmpegOptions(command);
        
        // Validar outputPath
        if (!outputPath) {
          reject(new Error('Output path is required'));
          return;
        }

        // Adicionar input do vídeo ou input padrão
        if (renderRequest.input?.url) {
          command = command.input(renderRequest.input.url);
        } else {
          // Criar input padrão (imagem preta)
          command = command
            .input('color=c=black:s=1280x720:r=30')
            .inputFormat('lavfi')
            .inputOptions(['-t', '1']);
        }
        
        // Set output file and handlers
        const outputOptions = buildOutputOptions(
          renderRequest.timeline?.tracks?.[0]?.clips || [],
          renderRequest.timeline?.tracks?.[1]?.clips || [],
          renderRequest.timeline?.tracks?.[2]?.clips || [],
          renderRequest.output,
          calculateTimelineDuration(renderRequest.timeline)
        );

        // Aplicar opções de FFmpeg
        applyFfmpegOptions(command);

        // Aplicar opções de saída diretamente
        outputOptions.forEach(option => {
          if (option.includes(' ')) {
            const [key, value] = option.split(' ');
            command.addOption(key, value);
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
            
            // Limpar processos órfãos antes de iniciar
            cleanupOrphanedProcesses();
          })
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
            console.log('✅ Renderização concluída com sucesso:', outputPath);
            
            let finalOutputUrl = outputPath;
            
            // Upload para Google Cloud Storage se habilitado
            if (config.googleCloud.enabled && renderRequest.webhook) {
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
                    format: renderRequest.output.format || 'mp4',
                    width: String(renderRequest.output.width || 1280),
                    height: String(renderRequest.output.height || 720),
                    quality: renderRequest.output.quality || 'medium',
                    createdAt: new Date().toISOString()
                  }
                });
                
                if (!uploadResult.publicUrl) {
                  throw new Error('Upload failed: no public URL returned');
                }
                
                console.log('Upload para GCS concluído:', {
                  fileName: uploadResult.fileName,
                  size: uploadResult.size,
                  publicUrl: uploadResult.publicUrl
                });
                
                // Usar a URL pública do GCS como resultado final
                finalOutputUrl = uploadResult.publicUrl;
                
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
                    format: renderRequest.output.format || 'mp4',
                    width: renderRequest.output.width || 1280,
                    height: renderRequest.output.height || 720,
                    quality: renderRequest.output.quality || 'medium',
                    fps: renderRequest.output.fps || 30,
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
            console.error('❌ Erro na renderização:', err);
            
            // Verificar se foi SIGKILL e registrar métrica
            if (err.message && err.message.includes('SIGKILL')) {
              ffmpegSigkillJobs.inc({ reason: 'memory_limit' });
              console.error(`💀 FFmpeg foi terminado com SIGKILL - possível falta de memória`);
            }
            
            // Limpar processos órfãos em caso de erro
            await cleanupOrphanedProcesses();
            
            // Limpar arquivos temporários após erro
            try {
              console.log('🧹 Limpando arquivos temporários após erro...');
              await cleanupTempFiles(tempDir);
              console.log('✅ Arquivos temporários removidos após erro');
            } catch (cleanupError) {
              console.warn('⚠️  Erro ao limpar arquivos temporários:', cleanupError);
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
    console.error(`❌ Erro na renderização:`, error);
    await cleanupTempFiles(tempDir);
    await concurrencyControl.releaseSlot(jobId);
    throw error;
  } finally {
    // Limpar arquivos temporários
    await cleanupTempFiles(tempDir);
    // Liberar slot após conclusão
    await concurrencyControl.releaseSlot(jobId);
  }
  
  return outputPath!;
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