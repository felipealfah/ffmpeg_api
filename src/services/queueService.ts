import Queue from 'bull';
import config from '../config';
import { RenderJob, JobStatus } from '../types/media';
import * as mediaService from './mediaService';
import path from 'path';
import { cleanupDirectory } from '../utils/file';

// In-memory storage for jobs (in production, use a database)
const jobsMap = new Map<string, RenderJob>();

// Configuração Redis simplificada
const redisConfig = {
  host: 'localhost',
  port: 6379
};

console.log('Iniciando serviço de fila');
console.log('Configuração Redis:', redisConfig);

// Create render queue with explicit Redis configuration
const renderQueue = new Queue('video-render', {
  redis: redisConfig
});

// Log FFmpeg paths
console.log('Caminhos do FFmpeg em queueService:', {
  ffmpegPath: config?.ffmpegPath,
  ffprobePath: config?.ffprobePath
});

// Log Redis connection status
renderQueue.on('error', (error) => {
  console.error('Bull queue error', { error: error.message, stack: error.stack });
});

renderQueue.on('ready', () => {
  console.log('Bull queue is ready');
});

// Process jobs
renderQueue.process(async (job) => {
  const renderJob = job.data as RenderJob;
  
  try {
    console.info(`Processing job ${renderJob.id}`, { jobId: renderJob.id });
    
    // Update job status
    updateJob(renderJob.id, { 
      status: JobStatus.PROCESSING,
      updatedAt: new Date()
    });
    
    // Usar caminhos absolutos
    const tempDir = path.join(process.cwd(), 'storage/temp', renderJob.id);
    const outputDir = path.join(process.cwd(), 'storage/output', renderJob.id);
    
    console.debug('Diretórios para processamento:', { tempDir, outputDir });
    
    // Process the job
    const outputPath = await mediaService.renderVideo(renderJob, (progress) => {
      // Update job progress
      updateJob(renderJob.id, { 
        progress,
        updatedAt: new Date()
      });
      
      // Update Bull job progress
      job.progress(progress);
      
      if (progress % 10 === 0) {
        console.debug(`Job ${renderJob.id} progress: ${progress}%`);
      }
    });
    
    // Update job status to completed
    updateJob(renderJob.id, { 
      status: JobStatus.COMPLETED,
      output: outputPath,
      updatedAt: new Date(),
      completedAt: new Date()
    });
    
    console.info(`Job ${renderJob.id} completed`, { 
      jobId: renderJob.id, 
      outputPath 
    });
    
    return { success: true, outputPath };
  } catch (error) {
    console.error(`Error processing job ${renderJob.id}`, { 
      jobId: renderJob.id, 
      error: (error as Error).message,
      stack: (error as Error).stack
    });
    
    // Update job status to failed
    updateJob(renderJob.id, { 
      status: JobStatus.FAILED,
      error: (error as Error).message || 'Unknown error occurred',
      updatedAt: new Date(),
      completedAt: new Date()
    });
    
    throw error;
  }
});

// Handle completed jobs
renderQueue.on('completed', (job) => {
  const jobId = job.data.id;
  console.info(`Job ${jobId} completed successfully`);
  
  // Clean up temp files if needed
  const tempDir = path.join(config.tempPath, jobId);
  cleanupDirectory(tempDir)
    .catch(err => console.error(`Error removing temp directory ${tempDir}`, { error: err }));
});

// Handle failed jobs
renderQueue.on('failed', (job, error) => {
  console.error(`Job ${job.data.id} failed`, { 
    jobId: job.data.id, 
    error: error.message,
    stack: error.stack
  });
});

// Add a render job to the queue
export const addRenderJob = async (job: RenderJob) => {
  try {
    // Store job in memory map
    jobsMap.set(job.id, job);
    
    console.info(`Adding job ${job.id} to queue`);
    
    // Add job to Bull queue
    const queueJob = await renderQueue.add(job, {
      timeout: config.defaultTimeout,
      removeOnComplete: false,
      removeOnFail: false,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000
      }
    });
    
    console.info(`Job ${job.id} added to queue successfully`, { queueJobId: queueJob.id });
    
    return job;
  } catch (error) {
    console.error(`Error adding job to queue: ${(error as Error).message}`, { 
      jobId: job.id,
      stack: (error as Error).stack
    });
    throw error;
  }
};

// Get a job by ID
export const getRenderJob = async (jobId: string): Promise<RenderJob | null> => {
  return jobsMap.get(jobId) || null;
};

// Update a job
export const updateJob = (jobId: string, updates: Partial<RenderJob>) => {
  const job = jobsMap.get(jobId);
  
  if (job) {
    const updatedJob = { ...job, ...updates };
    jobsMap.set(jobId, updatedJob);
    return updatedJob;
  }
  
  return null;
}; 