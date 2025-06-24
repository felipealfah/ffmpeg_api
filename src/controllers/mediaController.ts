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