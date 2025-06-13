import ffmpeg from 'fluent-ffmpeg';
import config from '../config';
import path from 'path';
import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import { Readable } from 'stream';
import { finished } from 'stream/promises';
import { RenderJob, Clip, Track, Timeline, MediaType, AssetSource } from '../types/media';
import axios from 'axios';
import { downloadFile, ensureDirectory } from '../utils/file';

// Configurar FFmpeg com caminhos explícitos
ffmpeg.setFfmpegPath('/opt/homebrew/bin/ffmpeg');
ffmpeg.setFfprobePath('/opt/homebrew/bin/ffprobe');

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
    if (asset.type === MediaType.IMAGE || asset.type === MediaType.VIDEO || asset.type === MediaType.AUDIO) {
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
        
        // Add filter complex for compositing
        let filterComplex = '';
        let currentInput = 0;
        
        // Get timeline duration
        const timelineDuration = timeline.duration || 
          Math.max(...timeline.tracks.flatMap(t => 
            t.clips.map(c => c.start + c.length)
          ));
        
        console.log('Duração da timeline:', timelineDuration);
        
        // Process each track and its clips
        preparedClips.forEach(({ track, clipInfo }, trackIndex) => {
          clipInfo.forEach(({ clip }, clipIndex) => {
            const inputIndex = currentInput++;
            const outputLabel = `v${trackIndex}_${clipIndex}`;
            
            // Scale and position the clip if position is specified
            if (clip.position) {
              const { x, y, width, height } = clip.position;
              const scale = width ? `:scale=${width}*iw/100:${height || -1}*ih/100` : '';
              const position = `overlay=${x}*W/100:${y}*H/100:enable='between(t,${clip.start},${clip.start + clip.length})'`;
              
              filterComplex += `[${inputIndex}]trim=duration=${clip.length},setpts=PTS-STARTPTS${scale}[${outputLabel}];`;
              
              if (trackIndex === 0 && clipIndex === 0) {
                filterComplex += `[${outputLabel}]${position}[out];`;
              } else {
                filterComplex += `[out][${outputLabel}]${position}[out];`;
              }
            }
          });
        });
        
        console.log('Filter complex gerado:', filterComplex);
        
        // Verificar se o filtro complexo está vazio
        if (!filterComplex) {
          console.log('Filtro complexo vazio, usando abordagem simplificada');
          
          // Usar uma abordagem simplificada quando não há posicionamento
          if (flattenedClips.length > 0) {
            // Usar o primeiro clip como base
            const outputOptions = [
              `-c:v ${output.format === 'gif' ? 'gif' : 'libx264'}`,
              `-preset ${output.quality === 'low' ? 'ultrafast' : output.quality === 'high' ? 'slow' : 'medium'}`,
              `-r ${output.fps || 30}`,
              `-s ${output.resolution || '1280x720'}`,
              `-b:v ${output.bitrate || '2000k'}`,
            ];
            
            console.log('Opções de saída simplificadas:', outputOptions);
            command = command.outputOptions(outputOptions);
          } else {
            throw new Error('Nenhum clip disponível para processamento');
          }
        } else {
          // Set output options based on request with filter complex
          const outputOptions = [
            `-filter_complex "${filterComplex}"`,
            '-map [out]',
            // Audio mapping would go here
            `-c:v ${output.format === 'gif' ? 'gif' : 'libx264'}`,
            `-preset ${output.quality === 'low' ? 'ultrafast' : output.quality === 'high' ? 'slow' : 'medium'}`,
            `-r ${output.fps || 30}`,
            `-s ${output.resolution || '1280x720'}`,
            `-b:v ${output.bitrate || '2000k'}`,
          ];
          
          console.log('Opções de saída com filtro complexo:', outputOptions);
          command = command.outputOptions(outputOptions);
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
            progressCallback(percent);
          })
          .on('end', () => {
            console.log('Renderização concluída com sucesso:', outputPath);
            resolve(outputPath);
          })
          .on('error', (err) => {
            console.error('Erro na renderização:', err);
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