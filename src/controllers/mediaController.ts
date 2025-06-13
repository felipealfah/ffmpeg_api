import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AppError } from '../middleware/errorHandler';
import * as mediaService from '../services/mediaService';
import { JobStatus, RenderRequest } from '../types/media';
import * as queueService from '../services/queueService';
import fs from 'fs';
import path from 'path';

// Create a new render job
export const createRenderJob = async (req: Request, res: Response) => {
  try {
    console.info('Recebendo requisição para criar job de renderização');
    
    const renderRequest = req.body as RenderRequest;
    console.debug('Corpo da requisição:', { request: renderRequest });
    
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
    
    return res.status(201).json({
      data: {
        jobId,
        status: JobStatus.QUEUED
      }
    });
  } catch (error) {
    console.error('Erro ao criar job de renderização:', { error: (error as Error).message, stack: (error as Error).stack });
    throw error;
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
      output: job.output
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