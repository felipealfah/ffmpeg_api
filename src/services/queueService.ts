import { RenderJob, RenderRequest, JobStatus, Timeline, StorageInfo } from '../types/media';
import { v4 as uuidv4 } from 'uuid';
import { calculateTimelineDuration } from './mediaService';
import Queue from 'bull';
import config from '../config';
import path from 'path';
import { cleanupDirectory } from '../utils/file';
import fs from 'fs/promises';
import { 
  updateJobMetrics, 
  updateStorageMetrics, 
  recordJobStart, 
  recordJobComplete, 
  recordCleanup,
  queueSize,
  updateCostMetrics,
  updateHourlyCost,
  determineComplexity,
  calculateVideoCost
} from '../middleware/metrics';

// In-memory storage for jobs (in production, use a database)
const jobsMap = new Map<string, RenderJob>();

// Configuração Redis com autenticação
const redisConfig = {
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  db: config.redis.db || 0
};

console.log('Iniciando serviço de fila');
console.log('Configuração Redis:', {
  host: redisConfig.host,
  port: redisConfig.port,
  password: redisConfig.password ? '***' : 'NOT SET',
  db: redisConfig.db
});

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
  
  // Iniciar limpeza periódica após a fila estar pronta
  startPeriodicCleanup();
});

/**
 * Limpa jobs em memória mais antigos que X horas
 */
const cleanupOldJobs = async (maxAgeHours: number = 24): Promise<number> => {
  try {
    const now = new Date();
    const maxAge = maxAgeHours * 60 * 60 * 1000; // Converter para millisegundos
    let removedCount = 0;
    
    for (const [jobId, job] of jobsMap.entries()) {
      const jobAge = now.getTime() - job.createdAt.getTime();
      
      // Remover jobs mais antigos que maxAge e que estejam completos ou falhados
      if (jobAge > maxAge && (job.status === JobStatus.COMPLETED || job.status === JobStatus.FAILED)) {
        jobsMap.delete(jobId);
        removedCount++;
      }
    }
    
    if (removedCount > 0) {
      console.log(`🧹 Limpeza automática: ${removedCount} jobs antigos removidos da memória`);
      recordCleanup('automatic', removedCount);
    }
    
    // Atualizar métricas de jobs
    updateJobMetrics(jobsMap);
    return removedCount;
  } catch (error) {
    console.error('Erro na limpeza de jobs antigos:', error);
    return 0;
  }
};

/**
 * Limpa diretórios órfãos no storage que não têm jobs correspondentes
 */
const cleanupOrphanedDirectories = async (): Promise<void> => {
  try {
    const outputPath = config.outputPath;
    const tempPath = config.tempPath;
    
    // Limpar diretórios órfãos no output
    await cleanupOrphanedDirs(outputPath, 'output');
    
    // Limpar diretórios órfãos no temp (não deveria ter, mas por segurança)
    await cleanupOrphanedDirs(tempPath, 'temp');
    
  } catch (error) {
    console.error('Erro na limpeza de diretórios órfãos:', error);
  }
};

/**
 * Helper para limpar diretórios órfãos em um caminho específico
 */
const cleanupOrphanedDirs = async (basePath: string, type: 'output' | 'temp'): Promise<void> => {
  try {
    const entries = await fs.readdir(basePath, { withFileTypes: true });
    let removedCount = 0;
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const jobId = entry.name;
        const job = jobsMap.get(jobId);
        const dirPath = path.join(basePath, jobId);
        
        // Remover diretório se:
        // 1. Não existe job correspondente OU
        // 2. Job está completo há mais de 1 hora (para temp) ou 24 horas (para output)
        const shouldRemove = !job || 
          (job.status === JobStatus.COMPLETED && job.completedAt) &&
          (type === 'temp' || 
           (type === 'output' && job.storage?.type === 'gcs' && 
            new Date().getTime() - job.completedAt.getTime() > 24 * 60 * 60 * 1000));
        
        if (shouldRemove) {
          await cleanupDirectory(dirPath);
          removedCount++;
        }
      }
    }
    
    if (removedCount > 0) {
      console.log(`🧹 Limpeza automática: ${removedCount} diretórios órfãos removidos de ${type}`);
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code !== 'ENOENT') {
      console.error(`Erro ao limpar diretórios ${type}:`, error);
    }
  }
};

/**
 * Inicia limpeza periódica
 */
const startPeriodicCleanup = (): void => {
  // Limpeza a cada 1 hora
  setInterval(async () => {
    console.log('🧹 Iniciando limpeza automática...');
    await cleanupOldJobs(24); // Jobs mais antigos que 24 horas
    await cleanupOrphanedDirectories();
    console.log('🧹 Limpeza automática concluída');
  }, 60 * 60 * 1000); // 1 hora
  
  console.log('✅ Limpeza periódica configurada (a cada 1 hora)');
};

// Process jobs
renderQueue.process(async (job) => {
  const renderJob = job.data as RenderJob;
  const startTime = Date.now();
  
  try {
    console.info(`Processing job ${renderJob.id}`, { jobId: renderJob.id });
    
    // Análise de custo do job
    await analyzeJobCost(renderJob);
    
    // Registrar início do job
    recordJobStart(renderJob.id);
    
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
    const mediaService = await import('./mediaService.js');
    const outputPath = await mediaService.renderVideo(renderJob.request, (progress: number) => {
      // Update job progress
      updateJob(renderJob.id, { 
        progress,
        updatedAt: new Date()
      });
    });
    
    // Determinar tipo de storage baseado na configuração
    const storageType = config.googleCloud?.enabled ? 'gcs' : 'local';
    
    // Update job with result
    updateJob(renderJob.id, {
      status: JobStatus.COMPLETED,
      output: outputPath,
      progress: 100,
      completedAt: new Date(),
      updatedAt: new Date(),
      storage: {
        type: storageType,
        tempDir,
        outputDir,
        url: storageType === 'gcs' ? outputPath : undefined,
        fileName: path.basename(outputPath)
      }
    });
    
    // Registrar conclusão do job
    recordJobComplete(renderJob.id, Date.now() - startTime);
    
    console.info(`Job ${renderJob.id} completed successfully`);
    
  } catch (error) {
    console.error(`Job ${renderJob.id} failed:`, error);
    
    updateJob(renderJob.id, {
      status: JobStatus.FAILED,
      error: error instanceof Error ? error.message : 'Unknown error',
      updatedAt: new Date()
    });
  }
});

// Handle completed jobs
renderQueue.on('completed', (job) => {
  const jobId = job.data?.id;
  console.info(`Job ${jobId} completed successfully`);
  
  // Limpeza de arquivos temporários agora é feita no mediaService
  // para garantir que aconteça após o processamento completo
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
      removeOnComplete: 5,     // Manter apenas os 5 jobs mais recentes completos
      removeOnFail: 3,         // Manter apenas os 3 jobs falhados mais recentes
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

// Create a new job
export const createJob = (jobId: string, request: RenderRequest): RenderJob => {
  const now = new Date();
  
  // Criar diretórios para o job
  const storage: StorageInfo = {
    type: 'local',
    tempDir: `/app/storage/temp/${jobId}`,
    outputDir: `/app/storage/output/${jobId}`,
    fileName: `${now.toISOString().replace(/[:.]/g, '-')}_output.mp4`,
    url: undefined
  };

  const job: RenderJob = {
    id: jobId,
    status: JobStatus.QUEUED,
    request,
    storage,
    createdAt: now,
    updatedAt: now
  };

  // Store job in memory
  jobsMap.set(jobId, job);
  
  return job;
};

// Get a job by ID
export const getJob = (jobId: string): RenderJob | null => {
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

// Manual cleanup function
export const performManualCleanup = async (maxAgeHours: number = 24) => {
  try {
    console.log(`🧹 Iniciando limpeza manual (jobs mais antigos que ${maxAgeHours}h)...`);
    
    const removedJobs = await cleanupOldJobs(maxAgeHours);
    await cleanupOrphanedDirectories();
    
    const results = {
      removedJobs,
      message: `Limpeza concluída: ${removedJobs} jobs removidos`
    };
    
    console.log(`🧹 Limpeza manual concluída:`, results);
    
    // Registrar limpeza manual
    if (removedJobs > 0) {
      recordCleanup('manual', removedJobs);
    }
    
    return results;
  } catch (error) {
    console.error('Erro na limpeza manual:', error);
    throw error;
  }
};

/**
 * Obtém estatísticas de storage e jobs
 */
export const getStorageStatistics = async () => {
  try {
    const now = new Date();
    const stats = {
      jobs: {
        total: jobsMap.size,
        queued: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        byAge: {
          last1h: 0,
          last24h: 0,
          older: 0
        }
      },
      directories: {
        temp: 0,
        output: 0
      }
    };
    
    // Atualizar métricas antes de calcular estatísticas
    updateJobMetrics(jobsMap);
    
    // Analisar jobs em memória
    for (const job of jobsMap.values()) {
      // Contar por status
      const status = job.status.toLowerCase() as keyof typeof stats.jobs;
      if (status in stats.jobs && typeof stats.jobs[status] === 'number') {
        (stats.jobs[status] as number)++;
      }
      
      // Contar por idade
      const ageHours = (now.getTime() - job.createdAt.getTime()) / (1000 * 60 * 60);
      if (ageHours < 1) {
        stats.jobs.byAge.last1h++;
      } else if (ageHours < 24) {
        stats.jobs.byAge.last24h++;
      } else {
        stats.jobs.byAge.older++;
      }
    }
    
    // Contar diretórios
    try {
      const tempEntries = await fs.readdir(config.tempPath, { withFileTypes: true });
      stats.directories.temp = tempEntries.filter(e => e.isDirectory()).length;
    } catch (error) {
      // Diretório não existe ou sem permissão
      stats.directories.temp = 0;
    }
    
    try {
      const outputEntries = await fs.readdir(config.outputPath, { withFileTypes: true });
      stats.directories.output = outputEntries.filter(e => e.isDirectory()).length;
    } catch (error) {
      // Diretório não existe ou sem permissão
      stats.directories.output = 0;
    }
    
    // Atualizar métricas de storage
    await updateStorageMetrics(stats);
    
    return stats;
  } catch (error) {
    console.error('Erro ao obter estatísticas:', error);
    throw error;
  }
};

// Funções auxiliares para análise de custo
export const analyzeJobCost = async (renderJob: RenderJob): Promise<void> => {
  try {
    // Determinar complexidade baseado na timeline do job
    const complexity = determineComplexity(renderJob.request || {});
    
    // Estimar duração do vídeo (baseado na timeline ou output)
    const estimatedDuration = renderJob.request?.timeline?.duration || 60; // Default 60s
    
    // Calcular custo estimado
    const estimatedCost = calculateVideoCost(estimatedDuration, complexity);
    
    console.log(`💰 Job ${renderJob.id} cost analysis:`, {
      complexity,
      estimatedDuration,
      estimatedCost: `$${estimatedCost.toFixed(6)}`
    });
    
    // Atualizar métricas de custo
    updateCostMetrics(estimatedDuration, complexity, 'started');
    
    // Atualizar custo por hora baseado em jobs ativos
    const activeJobsCount = jobsMap.size;
    updateHourlyCost(activeJobsCount);
    
  } catch (error) {
    console.error('Erro na análise de custo:', error);
  }
};