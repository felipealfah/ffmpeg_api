import { RenderJob, RenderRequest, JobStatus, Timeline, StorageInfo } from '../types/media';
import { v4 as uuidv4 } from 'uuid';
import { calculateTimelineDuration } from './mediaService';
import Queue from 'bull';
import config from '../config/index';
import path from 'path';
import { cleanupDirectory } from '../utils/file';
import fs from 'fs/promises';
import { getConcurrencyControl } from './concurrencyControl';
import { 
  updateJobMetrics, 
  updateStorageMetrics, 
  recordJobStart, 
  recordJobComplete, 
  recordJobFail,
  recordCleanup,
  ffmpegJobsActive,
  ffmpegSigkillJobs,
  ffmpegMemoryUsage,
  ffmpegConcurrencyLimit,
  updateCostMetrics,
  updateHourlyCost,
  determineComplexity,
  calculateVideoCost
} from '../middleware/metrics';

// In-memory storage for jobs (in production, use a database)
const jobsMap = new Map<string, RenderJob>();

// Controle de jobs ativos
let activeJobsCount = 0;

// Função para obter contagem de jobs ativos
const getActiveJobsCount = (): number => {
  return activeJobsCount;
};

// Função para atualizar métricas de jobs ativos
const updateActiveJobsMetrics = (): void => {
  ffmpegJobsActive.set({ status: 'processing' }, activeJobsCount);
};

// Função para verificar recursos do sistema
const checkSystemResources = async (): Promise<void> => {
  try {
    // Verificar memória disponível (Node.js)
    const memUsage = process.memoryUsage();
    const memUsageMB = {
      rss: Math.round(memUsage.rss / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024)
    };
    
    console.log('📊 Uso de memória:', memUsageMB);
    
    // Alertar se uso de memória estiver alto
    if (memUsageMB.heapUsed > 1024) { // > 1GB
      console.warn('⚠️  Alto uso de memória detectado:', memUsageMB);
      
      // Forçar garbage collection se possível
      if (global.gc) {
        console.log('🧹 Executando garbage collection...');
        global.gc();
      }
    }
    
    // Verificar se há muitos jobs ativos
    if (activeJobsCount >= MAX_CONCURRENT_JOBS) {
      throw new Error(`Limite de jobs simultâneos atingido: ${activeJobsCount}/${MAX_CONCURRENT_JOBS}`);
    }
    
  } catch (error) {
    console.error('❌ Erro ao verificar recursos do sistema:', error);
    throw error;
  }
};

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
  redis: redisConfig,
  defaultJobOptions: {
    removeOnComplete: 5,
    removeOnFail: 3,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    timeout: 600000, // 10 minutos (aumentado de 5 para 10)
  }
});

// LIMITAR CONCORRÊNCIA PARA EVITAR SOBRECARGA DE RECURSOS
const MAX_CONCURRENT_JOBS = config.maxConcurrentJobs;

console.log(`🚀 Configurando fila com máximo ${MAX_CONCURRENT_JOBS} jobs simultâneos`);

// Configurar métrica de limite de concorrência
ffmpegConcurrencyLimit.set(MAX_CONCURRENT_JOBS);

// Log FFmpeg paths
console.log('Caminhos do FFmpeg em queueService:', {
  ffmpegPath: config?.ffmpegPath,
  ffprobePath: config?.ffprobePath,
  maxConcurrentJobs: MAX_CONCURRENT_JOBS
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

// Controle de concorrência
const concurrencyControl = getConcurrencyControl();

/**
 * Processa um job de renderização
 */
const processRenderJob = async (renderJob: RenderJob): Promise<string> => {
  const startTime = Date.now();
  
  try {
    // Usar caminhos absolutos
    const tempDir = path.join(process.cwd(), 'storage/temp', renderJob.id);
    const outputDir = path.join(process.cwd(), 'storage/output', renderJob.id);
    
    console.debug('Diretórios para processamento:', { tempDir, outputDir });
    
    // Processar o vídeo
    const mediaService = await import('./mediaService.js');
    const outputPath = await mediaService.renderVideo(renderJob.request, (progress: number) => {
      // Atualizar progresso do job
      updateJob(renderJob.id, { 
        progress,
        updatedAt: new Date()
      });
    });
    
    // Determinar tipo de storage baseado na configuração
    const storageType = config.googleCloud?.enabled ? 'gcs' : 'local';
    
    // Atualizar job com resultado
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
    
    console.info(`✅ Job ${renderJob.id} concluído com sucesso em ${Date.now() - startTime}ms`);
    
    return outputPath;
  } catch (error) {
    console.error(`❌ Erro ao processar job ${renderJob.id}:`, error);
    throw error;
  }
};

// Função para processar um job
const processJob = async (job: Queue.Job<RenderJob>): Promise<void> => {
  const jobData = job.data;
  const jobId = jobData.id;
  const complexity = determineComplexity(jobData.request);
  const startTime = Date.now();
  
  try {
    // Registrar início do job
    recordJobStart(jobId);
    
    // Processar o job
    const outputPath = await processRenderJob(jobData);
    
    // Calcular duração
    const durationMs = Date.now() - startTime;
    
    // Registrar sucesso
    recordJobComplete(jobId, durationMs);
    
    // Atualizar métricas de custo
    const duration = calculateTimelineDuration(jobData.request.timeline);
    updateCostMetrics(duration, complexity, 'completed');
    
  } catch (error) {
    // Calcular duração
    const durationMs = Date.now() - startTime;
    
    // Registrar falha
    recordJobFail(jobId, durationMs);
    throw error;
  }
};

// Processar jobs da fila
renderQueue.process('video-render', async (job) => {
  const renderJob = job.data as RenderJob;
  console.log(`🎬 Iniciando processamento do job ${renderJob.id}`);

  try {
    // Renderizar vídeo
    const outputPath = await processRenderJob(renderJob);
    return { outputPath };
  } catch (error) {
    console.error(`❌ Job ${renderJob.id} falhou:`, error);
    throw error;
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

// Exportar instância da fila
export const getQueueService = (): Queue.Queue => {
  return renderQueue;
};