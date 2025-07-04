import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AppError } from '../middleware/errorHandler';
import * as mediaService from '../services/mediaService';
import { JobStatus, RenderRequest } from '../types/media';
import * as queueService from '../services/queueService';
import fs from 'fs';
import path from 'path';
import config from '../config';

// Validate render request without processing
export const validateRenderRequest = async (req: Request, res: Response) => {
  try {
    console.info('Validando requisição de renderização');
    
    const renderRequest = req.body as RenderRequest;
    console.debug('Requisição válida:', { 
      timelineTracks: renderRequest.timeline.tracks.length,
      outputFormat: renderRequest.output.format,
      hasWebhook: !!renderRequest.webhook 
    });
    
    return res.status(200).json({
      data: {
        valid: true,
        message: 'Requisição de renderização é válida',
        summary: {
          tracks: renderRequest.timeline.tracks.length,
          totalClips: renderRequest.timeline.tracks.reduce((acc, track) => acc + track.clips.length, 0),
          format: renderRequest.output.format,
          resolution: renderRequest.output.resolution,
          hasWebhook: !!renderRequest.webhook
        }
      }
    });
  } catch (error) {
    console.error('Erro na validação:', { error: (error as Error).message });
    throw error;
  }
};

// Create a new render job
export const createRenderJob = async (req: Request, res: Response) => {
  try {
    console.info('=== INÍCIO createRenderJob ===');
    console.info('Recebendo requisição para criar job de renderização');
    
    const renderRequest = req.body as RenderRequest;
    console.debug('Corpo da requisição:', { 
      timelineTracks: renderRequest.timeline?.tracks?.length,
      outputFormat: renderRequest.output?.format,
      hasWebhook: !!renderRequest.webhook
    });
    
    // Generate job ID and create job
    const jobId = uuidv4();
    console.info(`Job ID gerado: ${jobId}`);
    
    // Add job to queue
    try {
      console.info('Adicionando job à fila...');
      await queueService.addRenderJob({
        id: jobId,
        status: JobStatus.QUEUED,
        request: renderRequest,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.info('Job adicionado à fila com sucesso');
    } catch (error) {
      console.error('Erro ao adicionar job à fila:', { error: (error as Error).message });
      throw error;
    }
    
    const response = {
      data: {
        jobId,
        status: JobStatus.QUEUED,
        timestamp: new Date().toISOString()
      }
    };
    
    console.info('=== ENVIANDO RESPOSTA 201 ===', response);
    
    // Ensure no double response
    if (res.headersSent) {
      console.error('Headers already sent! Cannot send response.');
      return;
    }
    
    res.status(201).json(response);
    console.info('=== RESPOSTA ENVIADA COM SUCESSO ===');
    
  } catch (error) {
    console.error('=== ERRO NO createRenderJob ===', { 
      error: (error as Error).message, 
      stack: (error as Error).stack 
    });
    
    if (!res.headersSent) {
      throw error; // Let error handler deal with it
    }
  }
};

// Get job status
export const getRenderJobStatus = async (req: Request, res: Response) => {
  const { jobId } = req.params;
  
  const job = await queueService.getRenderJob(jobId);
  
  if (!job) {
    throw new AppError(`Job com ID ${jobId} não encontrado`, 404);
  }
  
  return res.status(200).json({
    data: {
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      storage: job.storage,
      error: job.error
    }
  });
};

// Get job result
export const getRenderJobResult = async (req: Request, res: Response) => {
  const { jobId } = req.params;
  
  const job = await queueService.getRenderJob(jobId);
  
  if (!job) {
    throw new AppError(`Job com ID ${jobId} não encontrado`, 404);
  }
  
  if (job.status !== JobStatus.COMPLETED) {
    throw new AppError(`Job com ID ${jobId} ainda não foi concluído`, 400);
  }
  
  if (!job.output) {
    throw new AppError(`Job com ID ${jobId} não possui arquivo de saída disponível`, 500);
  }
  
  // Return the result or redirect to the output file
  return res.status(200).json({
    data: {
      jobId: job.id,
      status: job.status,
      output: job.output,
      storage: job.storage
    }
  });
};

// Get job output file
export const getRenderJobFile = async (req: Request, res: Response) => {
  const { jobId } = req.params;
  
  const job = await queueService.getRenderJob(jobId);
  
  if (!job) {
    throw new AppError(`Job com ID ${jobId} não encontrado`, 404);
  }
  
  if (job.status !== JobStatus.COMPLETED) {
    throw new AppError(`Job com ID ${jobId} ainda não foi concluído`, 400);
  }
  
  if (!job.output) {
    throw new AppError(`Job com ID ${jobId} não possui arquivo de saída disponível`, 500);
  }
  
  // Se o arquivo está no Google Cloud Storage, redirecionar para a URL pública
  if (job.storage?.type === 'gcs' && job.storage.url) {
    return res.redirect(job.storage.url);
  }
  
  // Check if file exists
  if (!fs.existsSync(job.output)) {
    throw new AppError(`Arquivo de saída não encontrado: ${job.output}`, 404);
  }
  
  // Get file extension and set content type
  const ext = path.extname(job.output).toLowerCase();
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
  
  // Stream the file
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="output${ext}"`);
  
  const fileStream = fs.createReadStream(job.output);
  fileStream.pipe(res);
};

// Get media information
export const getMediaInfo = async (req: Request, res: Response) => {
  const { url } = req.body;
  
  const mediaInfo = await mediaService.getMediaInfo(url);
  
  return res.status(200).json({
    data: mediaInfo
  });
};

// 🔍 NOVA FUNÇÃO: Validar vídeo para clips específicos
export const validateVideoForClips = async (req: Request, res: Response) => {
  try {
    const { url, clips } = req.body;
    
    if (!url) {
      throw new AppError('URL do vídeo é obrigatória', 400);
    }
    
    if (!clips || !Array.isArray(clips)) {
      throw new AppError('Lista de clips é obrigatória', 400);
    }
    
    console.log('🔍 Iniciando validação de vídeo para clips:', { url, clipCount: clips.length });
    
    // Baixar vídeo temporariamente para análise
    const tempDir = path.join(process.cwd(), 'storage/temp/validation');
    const tempFile = path.join(tempDir, `validation_${Date.now()}.mp4`);
    
    try {
      // Ensure temp directory exists
      await fs.promises.mkdir(tempDir, { recursive: true });
      
      // Download video
      const axios = require('axios');
      const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'stream'
      });
      
      const writer = fs.createWriteStream(tempFile);
      response.data.pipe(writer);
      
      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });
      
      console.log('✅ Vídeo baixado para análise:', tempFile);
      
      // Validate video with clips (usando a função que criamos)
      const ffmpeg = require('fluent-ffmpeg');
      
      const metadata = await new Promise<any>((resolve, reject) => {
        ffmpeg.ffprobe(tempFile, (err: any, metadata: any) => {
          if (err) reject(err);
          else resolve(metadata);
        });
      });
      
      const duration = metadata.format.duration;
      const issues: string[] = [];
      const suggestions: string[] = [];
      let isValid = true;
      
      console.log('🔍 DIAGNÓSTICO COMPLETO DO VÍDEO:');
      console.log(`   📹 Arquivo: ${tempFile.split('/').pop()}`);
      console.log(`   ⏱️  Duração total: ${duration}s`);
      console.log(`   📊 Resolução: ${metadata.streams[0].width}x${metadata.streams[0].height}`);
      console.log(`   🎬 FPS: ${eval(metadata.streams[0].r_frame_rate) || 'N/A'}`);
      console.log(`   💾 Tamanho: ${(metadata.format.size / 1024 / 1024).toFixed(2)}MB`);
      
      // Verificar cada clip solicitado
      clips.forEach((clip: any, index: number) => {
        const clipEnd = clip.start + clip.length;
        
        if (clip.start >= duration) {
          issues.push(`Clip ${index + 1}: start time (${clip.start}s) maior que duração do vídeo (${duration}s)`);
          suggestions.push(`Clip ${index + 1}: usar start: 0 - ${Math.floor(duration)}s`);
          isValid = false;
        } else if (clipEnd > duration) {
          issues.push(`Clip ${index + 1}: end time (${clipEnd}s) excede duração do vídeo (${duration}s)`);
          suggestions.push(`Clip ${index + 1}: ajustar length para ${(duration - clip.start).toFixed(1)}s`);
          isValid = false;
        } else {
          console.log(`   ✅ Clip ${index + 1}: ${clip.start}s-${clipEnd}s (OK)`);
        }
      });
      
      // Sugestões de configuração ideal
      if (duration < 30) {
        suggestions.push(`Vídeo curto (${duration}s): considere clips menores ou sequenciais`);
      }
      
      if (duration >= 60) {
        suggestions.push(`Vídeo longo (${duration}s): ótimo para múltiplos clips ou sequências longas`);
      }
      
      // Clean up temp file
      try {
        await fs.promises.unlink(tempFile);
        console.log('🗑️  Arquivo temporário removido');
      } catch (cleanupError) {
        console.warn('⚠️  Erro ao remover arquivo temporário:', cleanupError);
      }
      
      return res.status(200).json({
        data: {
          url,
          duration,
          isValid,
          issues,
          suggestions,
          videoInfo: {
            durationSeconds: duration,
            durationFormatted: `${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, '0')}`,
            resolution: `${metadata.streams[0].width}x${metadata.streams[0].height}`,
            fps: eval(metadata.streams[0].r_frame_rate) || null,
            sizeMB: (metadata.format.size / 1024 / 1024).toFixed(2),
            isShort: duration < 30,
            isLong: duration >= 60
          },
          recommendations: {
            maxClipLength: Math.floor(duration),
            exampleValidClip: {
              start: 0,
              length: Math.min(10, Math.floor(duration))
            },
            maxSequentialClips: Math.floor(duration / 10),
            suggestedConfigs: [
              {
                name: "Clip único",
                config: { start: 0, length: Math.min(10, Math.floor(duration)) }
              },
              {
                name: "Sequência de 3 clips",
                config: [
                  { start: 0, length: Math.min(10, Math.floor(duration / 3)) },
                  { start: Math.min(10, Math.floor(duration / 3)), length: Math.min(10, Math.floor(duration / 3)) },
                  { start: Math.min(20, Math.floor(2 * duration / 3)), length: Math.min(10, Math.floor(duration / 3)) }
                ]
              }
            ]
          }
        }
      });
      
    } catch (downloadError) {
      console.error('❌ Erro ao baixar vídeo:', downloadError);
      throw new AppError(`Erro ao baixar vídeo: ${(downloadError as Error).message}`, 400);
    }
    
  } catch (error) {
    console.error('❌ Erro na validação do vídeo:', error);
    throw new AppError(`Erro na validação: ${(error as Error).message}`, 500);
  }
}; 