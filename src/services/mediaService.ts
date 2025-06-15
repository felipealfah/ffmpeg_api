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
        const extension = path.extname(asset.src) || (asset.type === MediaType.IMAGE ? '.jpg' : '.mp4');
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
        // Start with an empty FFmpeg command
        let command = ffmpeg();
        
        // Add inputs for all clips
        const flattenedClips = preparedClips.flatMap(p => p.clipInfo);
        console.log('Adicionando inputs ao FFmpeg:', { clipCount: flattenedClips.length });
        
        flattenedClips.forEach(({ path }, index) => {
          console.log(`Adicionando input ${index}:`, path);
          command = command.addInput(path);
        });
        
        // Calcular duração total baseada nos clips
        const timelineDuration = calculateTimelineDuration(timeline);
        
        console.log('Duração calculada da timeline:', timelineDuration);
        
        console.log('Duração da timeline:', timelineDuration);
        
        // Separate video and audio tracks
        const videoTracks = preparedClips.filter(({ track }) => 
          track.clips.some(clip => clip.asset.type === 'image' || clip.asset.type === 'video')
        );
        const audioTracks = preparedClips.filter(({ track }) => 
          track.clips.some(clip => clip.asset.type === 'audio')
        );
        
        console.log('Tracks separadas:', { 
          videoTracks: videoTracks.length, 
          audioTracks: audioTracks.length 
        });
        
        // Processar clips baseado na duração calculada
        console.log('Processando clips com duração calculada automaticamente');
        
        // Separar clips de vídeo/imagem, áudio e legendas
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
        
        // Recriar comando FFmpeg com as opções corretas
        command = ffmpeg();
        
        if (videoClips.length === 1 && videoClips[0].clip.asset.type === 'image') {
          // Caso simples: uma imagem com duração específica
          command = command
            .addInput(videoClips[0].path)
            .inputOptions(['-loop 1']);
        } else if (videoClips.length > 1 && videoClips.every(({ clip }) => clip.asset.type === 'image')) {
          // Caso de múltiplas imagens: criar filtro complexo para concatenação
          console.log('Criando filtro complexo para múltiplas imagens');
          
          // Adicionar todas as imagens como inputs
          videoClips.forEach(({ path }) => {
            command = command.addInput(path);
          });
          
          // Criar filtro complexo para concatenar as imagens com suas durações
          const filterParts: string[] = [];
          videoClips.forEach((_, index) => {
            const clip = videoClips[index].clip;
            const duration = clip.length;
            filterParts.push(`[${index}:v]loop=loop=-1:size=1:start=0,scale=${output.resolution || '1280x720'},setpts=PTS-STARTPTS,fps=${output.fps || 30}[v${index}]`);
          });
          
          // Criar filtro de concatenação com durações específicas
          let concatFilter = '';
          videoClips.forEach((_, index) => {
            const clip = videoClips[index].clip;
            const duration = clip.length;
            concatFilter += `[v${index}]trim=duration=${duration}[v${index}t];`;
          });
          
          // Concatenar todos os segmentos
          const concatInputs = videoClips.map((_, index) => `[v${index}t]`).join('');
          concatFilter += `${concatInputs}concat=n=${videoClips.length}:v=1:a=0[outv]`;
          
          const fullFilter = filterParts.join(';') + ';' + concatFilter;
          console.log('Filtro complexo criado:', fullFilter);
          
          command = command.complexFilter(fullFilter);
        } else {
          // Caso complexo: múltiplas imagens ou vídeos (fallback)
          videoClips.forEach(({ path }) => {
            command = command.addInput(path);
          });
        }
        
        // Adicionar áudio se disponível
        if (audioClips.length > 0) {
          audioClips.forEach(({ path }) => {
            command = command.addInput(path);
          });
          
          // Se há múltiplos áudios, criar filtro de mixagem
          if (audioClips.length > 1) {
            console.log(`Criando filtro de mixagem para ${audioClips.length} áudios`);
            
            // Criar filtro de mixagem para múltiplos áudios
            const audioInputs = audioClips.map((_, index) => `[${videoClips.length + index}:a]`).join('');
            const mixFilter = `${audioInputs}amix=inputs=${audioClips.length}:duration=first:dropout_transition=2[aout]`;
            
            // Sempre criar um novo filtro complexo para áudio
            // Se já existe filtro para vídeo, será combinado nas opções de saída
            command = command.complexFilter(mixFilter);
          }
        }
        
        // Configurar opções de saída
        const outputOptions = [];
        
        // Definir duração total do vídeo
        outputOptions.push(`-t ${timelineDuration}`);
        
        // Preparar filtro de legendas se disponível
        let subtitleFilter = '';
        if (subtitleClips.length > 0) {
          console.log(`Preparando ${subtitleClips.length} arquivo(s) de legenda`);
          
          const subtitleClip = subtitleClips[0]; // Por enquanto, apenas a primeira legenda
          const { clip, path } = subtitleClip;
          const asset = clip.asset as any; // SubtitleAsset
          
          // Configurar estilo das legendas
          const style = asset.style || {};
          const fontFamily = style.fontFamily || 'DejaVu Serif';
          const fontSize = style.fontSize || 42;
          const fontColor = style.fontColor || '#FFFFFF';
          const outlineColor = style.outlineColor || '#404040';
          const outline = style.outline || 3;
          const shadow = style.shadow || 1;
          const bold = style.bold ? 1 : 0;
          const marginV = style.marginV || 100;
          const alignment = style.alignment === 'left' ? 1 : style.alignment === 'right' ? 3 : 2;
          
          // Converter cores para formato BGR do FFmpeg (inverter RGB)
          const convertColor = (hexColor: string) => {
            const hex = hexColor.replace('#', '');
            if (hex.length === 6) {
              const r = hex.substring(0, 2);
              const g = hex.substring(2, 4);
              const b = hex.substring(4, 6);
              return `${b}${g}${r}`; // BGR format
            }
            return 'FFFFFF'; // fallback to white
          };
          
          // Criar string de estilo para FFmpeg (simplificado)
          const forceStyle = [
            `FontName=${fontFamily}`,
            `FontSize=${fontSize}`,
            `PrimaryColour=&HFFFFFF&`,
            `OutlineColour=&H000000&`,
            `BorderStyle=1`,
            `Outline=3`,
            `Shadow=1`,
            `Bold=1`,
            `Alignment=2`,
            `MarginV=100`
          ].join(',');
          
          console.log('Preparando filtro de legenda:', {
            arquivo: path,
            estilo: forceStyle
          });
          
          // Criar filtro de legenda (escapar aspas para FFmpeg)
          const escapedPath = path.replace(/'/g, "\\'");
          const escapedStyle = forceStyle.replace(/'/g, "\\'");
          subtitleFilter = `subtitles='${escapedPath}':charenc=UTF-8:force_style='${escapedStyle}'`;
          
          if (subtitleClips.length > 1) {
            console.warn('Múltiplas legendas não são totalmente suportadas ainda. Usando apenas a primeira.');
          }
        }
        
        if (videoClips.length === 1 && videoClips[0].clip.asset.type === 'image') {
          // Para uma imagem, definir framerate
          outputOptions.push(`-r ${output.fps || 30}`);
          
          // Aplicar legendas se disponível usando fluent-ffmpeg
          if (subtitleFilter) {
            command = command.videoFilters(subtitleFilter);
          }
          
          if (audioClips.length > 1) {
            outputOptions.push('-map 0:v', '-map [aout]'); // Mapear vídeo e áudio mixado
          }
        } else if (videoClips.length > 1 && videoClips.every(({ clip }) => clip.asset.type === 'image')) {
          // Para múltiplas imagens com filtro complexo, mapear o output do filtro
          // Se há legendas, precisamos modificar o filtro complexo
          if (subtitleFilter) {
            console.log('Aplicando legendas ao filtro complexo de múltiplas imagens');
            
            // Recriar o filtro complexo incluindo legendas
            const filterParts: string[] = [];
            videoClips.forEach((_, index) => {
              const clip = videoClips[index].clip;
              const duration = clip.length;
              filterParts.push(`[${index}:v]loop=loop=-1:size=1:start=0,scale=${output.resolution || '1280x720'},setpts=PTS-STARTPTS,fps=${output.fps || 30}[v${index}]`);
            });
            
            // Criar filtro de concatenação com durações específicas
            let concatFilter = '';
            videoClips.forEach((_, index) => {
              const clip = videoClips[index].clip;
              const duration = clip.length;
              concatFilter += `[v${index}]trim=duration=${duration}[v${index}t];`;
            });
            
            // Concatenar todos os segmentos
            const concatInputs = videoClips.map((_, index) => `[v${index}t]`).join('');
            concatFilter += `${concatInputs}concat=n=${videoClips.length}:v=1:a=0[video_concat];`;
            
            // Aplicar legendas ao vídeo concatenado
            concatFilter += `[video_concat]${subtitleFilter}[outv]`;
            
            const fullFilter = filterParts.join(';') + ';' + concatFilter;
            console.log('Filtro complexo com legendas:', fullFilter);
            
            // Recriar comando com novo filtro incluindo todos os inputs
            command = ffmpeg();
            
            // Adicionar inputs de vídeo/imagem
            videoClips.forEach(({ path }) => {
              command = command.addInput(path);
            });
            
            // Adicionar inputs de áudio
            audioClips.forEach(({ path }) => {
              command = command.addInput(path);
            });
            
            command = command.complexFilter(fullFilter);
          }
          
          outputOptions.push('-map [outv]');
          if (audioClips.length > 1) {
            outputOptions.push('-map [aout]'); // Mapear áudio mixado
          } else if (audioClips.length === 1) {
            // Quando há legendas e filtro complexo, o áudio está no índice correto
            const audioIndex = subtitleFilter ? videoClips.length : videoClips.length;
            outputOptions.push(`-map ${audioIndex}:a`); // Mapear áudio único
          }
        }
        
        // Configurações de codec
        outputOptions.push(
          `-c:v ${output.format === 'gif' ? 'gif' : 'libx264'}`,
          `-preset ${output.quality === 'low' ? 'ultrafast' : output.quality === 'high' ? 'slow' : 'medium'}`,
          `-b:v ${output.bitrate || '2000k'}`
        );
        
        if (audioClips.length > 0) {
          outputOptions.push('-c:a aac', '-b:a 128k');
        }
        
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
            
            // Limpar arquivos temporários após sucesso
            try {
              console.log('Limpando arquivos temporários...');
              await cleanupTempFiles(tempDir);
              console.log('Arquivos temporários removidos com sucesso');
            } catch (cleanupError) {
              console.warn('Erro ao limpar arquivos temporários:', cleanupError);
              // Não falhar o job por causa da limpeza
            }
            
            resolve(outputPath);
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