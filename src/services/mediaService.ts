import ffmpeg from 'fluent-ffmpeg';
import config from '../config';
import path from 'path';
import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import { Readable } from 'stream';
import { finished } from 'stream/promises';
import { RenderJob, Clip, Track, Timeline, MediaType, AssetSource } from '../types/media';
import axios from 'axios';
import { downloadFile, ensureDirectory, cleanupDirectory } from '../utils/file';
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
const calculateTimelineDuration = (timeline: Timeline): number => {
  let totalDuration = 0;
  
  // Para cada track, calcular a duração baseada nos clips
  timeline.tracks.forEach((track, trackIndex) => {
    let trackDuration = 0;
    
    if (track.clips.length === 0) {
      trackDuration = 0;
    } else if (track.clips.length === 1) {
      // Se há apenas um clip, usar sua duração
      trackDuration = track.clips[0].start + track.clips[0].length;
    } else {
      // Para múltiplos clips na mesma track:
      // - Se são do mesmo tipo (ex: múltiplos áudios), eles são mixados (paralelos)
      // - Se são tipos diferentes ou imagens sequenciais, são sequenciais
      
      const hasMultipleAudios = track.clips.filter(clip => clip.asset.type === 'audio').length > 1;
      const hasMultipleImages = track.clips.filter(clip => clip.asset.type === 'image').length > 1;
      
      if (hasMultipleAudios && !hasMultipleImages) {
        // Múltiplos áudios na mesma track = mixagem (paralelo)
        // A duração é a maior duração entre os áudios
        trackDuration = Math.max(...track.clips.map(clip => clip.start + clip.length));
      } else {
        // Clips sequenciais (imagens ou mix de tipos)
        trackDuration = Math.max(...track.clips.map(clip => clip.start + clip.length));
      }
    }
    
    console.log(`Track ${trackIndex} duração:`, trackDuration);
    
    // A duração total é a maior duração entre todas as tracks
    // (pois tracks rodam em paralelo)
    totalDuration = Math.max(totalDuration, trackDuration);
  });
  
  console.log('Duração total calculada:', totalDuration);
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

// Prepare a clip for the timeline
const prepareClip = async (clip: Clip, tempDir: string): Promise<string> => {
  try {
    const { asset } = clip;
    console.log('Preparando asset:', { 
      type: asset.type,
      source: 'source' in asset ? asset.source : 'text'
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
          await downloadFile(asset.src, localPath);
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

// Helper function to create complex filter for multiple images
const createComplexFilterForImages = (
  videoClips: any[], 
  audioClips: any[], 
  subtitleClips: any[], 
  output: any
): string => {
  const filterParts: string[] = [];
  
  // Create filter parts for each video clip
  videoClips.forEach((_, index) => {
    const clip = videoClips[index].clip;
    filterParts.push(`[${index}:v]loop=loop=-1:size=1:start=0,scale=${output.resolution || '1280x720'},setpts=PTS-STARTPTS,fps=${output.fps || 30}[v${index}]`);
  });
  
  // Create concatenation filter with specific durations
  let concatFilter = '';
  videoClips.forEach((_, index) => {
    const clip = videoClips[index].clip;
    const duration = clip.length;
    concatFilter += `[v${index}]trim=duration=${duration}[v${index}t];`;
  });
  
  // Concatenate all segments
  const concatInputs = videoClips.map((_, index) => `[v${index}t]`).join('');
  concatFilter += `${concatInputs}concat=n=${videoClips.length}:v=1:a=0[video_concat]`;
  
  // Apply subtitles if available
  if (subtitleClips.length > 0) {
    const subtitleFilter = createSubtitleFilter(subtitleClips[0]);
    concatFilter += `;[video_concat]${subtitleFilter}[outv]`;
  } else {
    concatFilter += `;[video_concat]copy[outv]`;
  }
  
  return filterParts.join(';') + ';' + concatFilter;
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
  
  // Set total video duration
  outputOptions.push(`-t ${timelineDuration}`);
  
  // Handle video mapping based on scenario
  if (videoClips.length === 1 && videoClips[0].clip.asset.type === 'image') {
    // Simple case: single image
    outputOptions.push(`-r ${output.fps || 30}`);
    
    if (audioClips.length > 1) {
      outputOptions.push('-map 0:v', '-map [aout]');
    }
  } else if (videoClips.length > 1) {
    // Complex case: multiple images with complex filter
    outputOptions.push('-map [outv]');
    
    if (audioClips.length > 1) {
      outputOptions.push('-map [aout]');
    } else if (audioClips.length === 1) {
      const audioIndex = videoClips.length;
      outputOptions.push(`-map ${audioIndex}:a`);
    }
  }
  
  // Codec settings
  outputOptions.push(
    `-c:v ${output.format === 'gif' ? 'gif' : 'libx264'}`,
    `-preset ${output.quality === 'low' ? 'ultrafast' : output.quality === 'high' ? 'slow' : 'medium'}`,
    `-b:v ${output.bitrate || '2000k'}`
  );
  
  if (audioClips.length > 0) {
    outputOptions.push('-c:a aac', '-b:a 128k');
  }
  
  return outputOptions;
};

// Render the video from the timeline
export const renderVideo = async (
  job: RenderJob, 
  progressCallback: (progress: number) => void
): Promise<string> => {
  try {
    const { request } = job;
    const { timeline, output } = request;
    
    console.log('Iniciando renderização do vídeo para o job:', { 
      jobId: job.id,
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
    const tempDir = path.join(process.cwd(), 'storage/temp', job.id);
    const outputDir = path.join(process.cwd(), 'storage/output', job.id);
    
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
        
        for (const clip of track.clips) {
          console.log('Preparando clip:', { 
            type: clip.asset.type, 
            start: clip.start, 
            length: clip.length 
          });
          
          const localPath = await prepareClip(clip, tempDir);
          console.log('Clip preparado:', { localPath });
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
            command = command.addInput(path).inputOptions(['-loop 1']);
          } else {
            command = command.addInput(path);
          }
        });
        
        // 2. Adicionar inputs de áudio
        audioClips.forEach(({ path }, index) => {
          console.log(`Adicionando input de áudio ${index}:`, path);
          command = command.addInput(path);
        });
        
        // Determinar a lógica de processamento baseada nos tipos de clips
        if (videoClips.length === 1 && videoClips[0].clip.asset.type === 'image') {
          // Caso simples: uma imagem com duração específica
          console.log('Processando caso simples: uma imagem');
          
          // Aplicar legendas se disponível
          if (subtitleClips.length > 0) {
            console.log('Aplicando legendas ao caso simples');
            const subtitleFilter = createSubtitleFilter(subtitleClips[0]);
            command = command.videoFilters(subtitleFilter);
          }
          
        } else if (videoClips.length > 1 && videoClips.every(({ clip }) => clip.asset.type === 'image')) {
          // Caso complexo: múltiplas imagens
          console.log('Processando caso complexo: múltiplas imagens');
          const complexFilter = createComplexFilterForImages(videoClips, audioClips, subtitleClips, output);
          console.log('Filtro complexo criado:', complexFilter);
          command = command.complexFilter(complexFilter);
          
        } else {
          // Caso fallback: múltiplas imagens ou vídeos
          console.log('Processando caso fallback');
          // Para casos mais complexos, pode ser necessário lógica adicional
        }
        
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
        
        // Configurar opções de saída
        const outputOptions = buildOutputOptions(videoClips, audioClips, subtitleClips, output, timelineDuration);
        console.log('Opções de saída:', outputOptions);
        command = command.outputOptions(outputOptions);
        
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
                const fileName = `renders/${job.id}/${timestamp}_${path.basename(outputPath)}`;
                
                const uploadResult = await storageService.uploadFile(outputPath, {
                  destination: fileName,
                  public: true,
                  metadata: {
                    jobId: job.id,
                    format: output.format,
                    resolution: output.resolution,
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
            if (job.request.webhook) {
              console.log('🔔 Disparando webhook:', job.request.webhook);
              try {
                const webhookPayload = {
                  jobId: job.id,
                  status: 'completed',
                  outputUrl: finalOutputUrl,
                  metadata: {
                    format: output.format,
                    resolution: output.resolution,
                    quality: output.quality || 'medium',
                    fps: output.fps || 30,
                    storageType: config.googleCloud.enabled ? 'gcs' : 'local'
                  },
                  completedAt: new Date().toISOString()
                };

                const response = await axios.post(job.request.webhook, webhookPayload, {
                  timeout: 10000, // 10 segundos de timeout
                  headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'FFmpeg-API-Webhook/1.0'
                  }
                });

                console.log('✅ Webhook disparado com sucesso:', {
                  url: job.request.webhook,
                  status: response.status,
                  jobId: job.id
                });
              } catch (webhookError) {
                console.error('❌ Erro ao disparar webhook:', {
                  url: job.request.webhook,
                  error: webhookError instanceof Error ? webhookError.message : 'Unknown error',
                  jobId: job.id
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
            if (job.request.webhook) {
              console.log('🔔 Disparando webhook de erro:', job.request.webhook);
              try {
                const webhookPayload = {
                  jobId: job.id,
                  status: 'failed',
                  error: err.message || 'Unknown error during video processing',
                  failedAt: new Date().toISOString()
                };

                await axios.post(job.request.webhook, webhookPayload, {
                  timeout: 10000,
                  headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'FFmpeg-API-Webhook/1.0'
                  }
                });

                console.log('✅ Webhook de erro disparado com sucesso:', {
                  url: job.request.webhook,
                  jobId: job.id
                });
              } catch (webhookError) {
                console.error('❌ Erro ao disparar webhook de erro:', {
                  url: job.request.webhook,
                  error: webhookError instanceof Error ? webhookError.message : 'Unknown error',
                  jobId: job.id
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