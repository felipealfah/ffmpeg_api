import promClient from 'prom-client';
import { Request, Response, NextFunction } from 'express';
import { Registry } from 'prom-client';
import { v4 as uuidv4 } from 'uuid';

// Configurar coleta de métricas padrão do Node.js
promClient.collectDefaultMetrics({
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
});

export const register = new Registry();

// ==== MÉTRICAS DE JOBS ====

// Gauge de jobs por status
export const ffmpegJobsActive = new promClient.Gauge({
  name: 'ffmpeg_jobs_active',
  help: 'Number of active FFmpeg jobs by status',
  labelNames: ['status'],
  registers: [register]
});

// Contador de jobs totais
export const ffmpegJobsTotal = new promClient.Counter({
  name: 'ffmpeg_jobs_total',
  help: 'Total number of FFmpeg jobs processed',
  labelNames: ['status', 'complexity'],
  registers: [register]
});

// Histograma de duração de jobs
export const ffmpegJobDuration = new promClient.Histogram({
  name: 'ffmpeg_job_duration_seconds',
  help: 'Duration of FFmpeg job processing in seconds',
  labelNames: ['complexity', 'status'],
  buckets: [1, 5, 10, 30, 60, 300, 600, 1800],
  registers: [register]
});

// Contador de jobs terminados com SIGKILL
export const ffmpegSigkillJobs = new promClient.Counter({
  name: 'ffmpeg_sigkill_jobs_total',
  help: 'Total number of FFmpeg jobs killed with SIGKILL',
  labelNames: ['reason'],
  registers: [register]
});

// Gauge para uso de memória por job
export const ffmpegMemoryUsage = new promClient.Gauge({
  name: 'ffmpeg_memory_usage_bytes',
  help: 'Memory usage per FFmpeg job in bytes',
  labelNames: ['job_id'],
  registers: [register]
});

// Contador de processos órfãos limpos
export const ffmpegOrphanedProcesses = new promClient.Counter({
  name: 'ffmpeg_orphaned_processes_total',
  help: 'Total number of orphaned FFmpeg processes cleaned up',
  registers: [register]
});

// ==== MÉTRICAS HTTP ====

// Contador de requests HTTP
export const httpRequestsTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register]
});

// Histograma de duração de requests HTTP
export const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register]
});

// Gauge de requests ativas
export const httpRequestsActive = new promClient.Gauge({
  name: 'http_requests_active',
  help: 'Number of active HTTP requests',
  registers: [register]
});

// ==== MÉTRICAS DE MEMÓRIA ====

// Gauge para uso total de memória do processo
export const processMemoryUsage = new promClient.Gauge({
  name: 'process_memory_usage_bytes',
  help: 'Uso total de memória do processo Node.js em bytes',
  labelNames: ['type'], // heap_used, heap_total, rss, external
  registers: [register]
});

// Gauge para uso de memória do FFmpeg
export const ffmpegProcessMemory = new promClient.Gauge({
  name: 'ffmpeg_process_memory_bytes',
  help: 'Uso de memória do processo FFmpeg em bytes',
  labelNames: ['job_id', 'type'], // rss, vsz
  registers: [register]
});

// Gauge para alertas de memória
export const memoryAlerts = new promClient.Gauge({
  name: 'memory_alerts',
  help: 'Alertas de uso de memória',
  labelNames: ['severity', 'type'], // warning, critical | process, ffmpeg
  registers: [register]
});

// ==== MIDDLEWARE HTTP ====

export const metricsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  
  // Incrementar requests ativas
  httpRequestsActive.inc();
  
  // Hook para capturar quando a resposta termina
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route?.path || req.path || 'unknown';
    const statusCode = res.statusCode.toString();
    
    // Decrementar requests ativas
    httpRequestsActive.dec();
    
    // Registrar métricas
    httpRequestsTotal.inc({
      method: req.method,
      route,
      status_code: statusCode,
    });
    
    httpRequestDuration.observe(
      {
        method: req.method,
        route,
        status_code: statusCode,
      },
      duration
    );
  });
  
  next();
};

// ==== FUNÇÕES AUXILIARES ====

/**
 * Atualiza métricas de jobs baseado no status atual
 */
export const updateJobMetrics = (jobs: Map<string, any>) => {
  const counts = {
    queued: 0,
    processing: 0,
    completed: 0,
    failed: 0,
  };
  
  const ageCounts = {
    last1h: 0,
    last24h: 0,
    older: 0,
  };
  
  const now = new Date();
  
  for (const job of jobs.values()) {
    // Contar por status
    const status = job.status?.toLowerCase();
    if (status in counts) {
      counts[status as keyof typeof counts]++;
    }
    
    // Contar por idade
    const ageHours = (now.getTime() - job.createdAt.getTime()) / (1000 * 60 * 60);
    if (ageHours < 1) {
      ageCounts.last1h++;
    } else if (ageHours < 24) {
      ageCounts.last24h++;
    } else {
      ageCounts.older++;
    }
  }
  
  // Atualizar gauges
  Object.entries(counts).forEach(([status, count]) => {
    ffmpegJobsActive.set({ status }, count);
  });
  
  // The original code had a duplicate declaration of ffmpegJobsActive here,
  // which is now removed. The original code also had a duplicate declaration
  // of ffmpegJobsByAge here. This part of the original code is not
  // explicitly removed by the new_code, but the new_code does not include
  // the duplicate declarations. Therefore, I will keep the original
  // duplicate declaration of ffmpegJobsByAge.
  // Object.entries(ageCounts).forEach(([bucket, count]) => {
  //   ffmpegJobsByAge.set({ age_category: bucket }, count);
  // });
};

/**
 * Atualiza métricas de storage
 */
export const updateStorageMetrics = async (stats: any) => {
  // Atualizar contadores de diretórios
  // The original code had a duplicate declaration of storageDirectoriesTotal here,
  // which is now removed.
  // storageDirectoriesTotal.set({ type: 'temp' }, stats.directories?.temp || 0);
  // storageDirectoriesTotal.set({ type: 'output' }, stats.directories?.output || 0);
};

// Funções de registro de jobs
export const recordJobStart = (jobId: string): void => {
  ffmpegJobsActive.inc({ status: 'processing' });
  ffmpegJobsTotal.inc({ status: 'started' });
};

export const recordJobComplete = (jobId: string, durationMs: number): void => {
  ffmpegJobsActive.dec({ status: 'processing' });
  ffmpegJobsTotal.inc({ status: 'completed' });
  ffmpegJobDuration.observe({ status: 'completed' }, durationMs / 1000);
};

export const recordJobFail = (jobId: string, durationMs: number): void => {
  ffmpegJobsActive.dec({ status: 'processing' });
  ffmpegJobsTotal.inc({ status: 'failed' });
  ffmpegJobDuration.observe({ status: 'failed' }, durationMs / 1000);
};

/**
 * Registra operação de limpeza
 */
export const recordCleanup = (type: 'automatic' | 'manual', removedCount: number) => {
  // The original code had a duplicate declaration of cleanupOperationsTotal here,
  // which is now removed.
  // cleanupOperationsTotal.inc({ type, status: 'unknown' });
  console.log(`📊 Metrics: Cleanup ${type} removed ${removedCount} items`);
};

/**
 * Endpoint para expor métricas
 */
export const metricsHandler = async (req: Request, res: Response) => {
  try {
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (error) {
    console.error('Error generating metrics:', error);
    res.status(500).end('Error generating metrics');
  }
}; 

// ==== FUNÇÕES DE MONITORAMENTO ====

/**
 * Monitora e atualiza métricas de memória do processo Node.js
 */
export const updateProcessMemoryMetrics = (): void => {
  const memUsage = process.memoryUsage();
  
  processMemoryUsage.set({ type: 'heap_used' }, memUsage.heapUsed);
  processMemoryUsage.set({ type: 'heap_total' }, memUsage.heapTotal);
  processMemoryUsage.set({ type: 'rss' }, memUsage.rss);
  processMemoryUsage.set({ type: 'external' }, memUsage.external);
  
  // Verificar thresholds
  const heapUsedGB = memUsage.heapUsed / 1024 / 1024 / 1024;
  const rssGB = memUsage.rss / 1024 / 1024 / 1024;
  
  // Alertas baseados em thresholds
  if (heapUsedGB > 6) { // 75% de 8GB
    memoryAlerts.set({ severity: 'warning', type: 'process' }, 1);
    console.warn(`⚠️ Alto uso de heap: ${heapUsedGB.toFixed(2)}GB`);
  } else {
    memoryAlerts.set({ severity: 'warning', type: 'process' }, 0);
  }
  
  if (rssGB > 8) { // Limite crítico
    memoryAlerts.set({ severity: 'critical', type: 'process' }, 1);
    console.error(`🚨 Uso crítico de memória RSS: ${rssGB.toFixed(2)}GB`);
    
    // Forçar GC se disponível
    if (global.gc) {
      console.log('🧹 Executando garbage collection...');
      global.gc();
    }
  } else {
    memoryAlerts.set({ severity: 'critical', type: 'process' }, 0);
  }
};

/**
 * Monitora uso de memória de um processo FFmpeg específico
 */
export const updateFFmpegMemoryMetrics = (jobId: string, pid: number): void => {
  try {
    // Usar ps para obter uso de memória do processo FFmpeg
    const { execSync } = require('child_process');
    const cmd = `ps -o rss=,vsz= -p ${pid}`;
    const output = execSync(cmd).toString().trim().split(/\s+/);
    
    const rssKB = parseInt(output[0], 10);
    const vszKB = parseInt(output[1], 10);
    
    // Converter para bytes
    const rssBytes = rssKB * 1024;
    const vszBytes = vszKB * 1024;
    
    // Atualizar métricas
    ffmpegProcessMemory.set({ job_id: jobId, type: 'rss' }, rssBytes);
    ffmpegProcessMemory.set({ job_id: jobId, type: 'vsz' }, vszBytes);
    
    // Verificar limites
    const rssGB = rssBytes / 1024 / 1024 / 1024;
    if (rssGB > 6) { // 75% de 8GB
      memoryAlerts.set({ severity: 'warning', type: 'ffmpeg' }, 1);
      console.warn(`⚠️ Alto uso de memória FFmpeg (Job ${jobId}): ${rssGB.toFixed(2)}GB`);
    }
    
    if (rssGB > 7.5) { // 93.75% de 8GB
      memoryAlerts.set({ severity: 'critical', type: 'ffmpeg' }, 1);
      console.error(`🚨 Uso crítico de memória FFmpeg (Job ${jobId}): ${rssGB.toFixed(2)}GB`);
    }
  } catch (error) {
    console.error(`❌ Erro ao monitorar memória do FFmpeg (Job ${jobId}):`, error);
  }
}; 

// ==== MÉTRICAS DE SEMÁFORO ====

// Gauge de slots disponíveis no semáforo
export const semaphoreAvailableSlots = new promClient.Gauge({
  name: 'ffmpeg_semaphore_available_slots',
  help: 'Number of available slots in the semaphore',
  registers: [register]
});

// Gauge de jobs na fila aguardando
export const semaphoreQueuedJobs = new promClient.Gauge({
  name: 'ffmpeg_semaphore_queued_jobs',
  help: 'Number of jobs queued waiting for semaphore slots',
  registers: [register]
});

// Gauge de jobs ativos
export const activeRenderJobs = new promClient.Gauge({
  name: 'ffmpeg_active_render_jobs',
  help: 'Número atual de jobs de renderização ativos',
  registers: [register]
});

// Gauge da fila Redis/Bull
export const queueSize = new promClient.Gauge({
  name: 'bull_queue_size',
  help: 'Number of jobs in Bull queue',
  labelNames: ['queue_name', 'status'],
  registers: [register]
});

// Gauge para limite de concorrência
export const ffmpegConcurrencyLimit = new promClient.Gauge({
  name: 'ffmpeg_concurrency_limit',
  help: 'Maximum number of concurrent FFmpeg jobs allowed',
  registers: [register]
});

// Função para atualizar métricas do semáforo
export const updateSemaphoreMetrics = (availableSlots: number, queuedJobs: number, activeJobsCount: number): void => {
  semaphoreAvailableSlots.set(availableSlots);
  semaphoreQueuedJobs.set(queuedJobs);
  ffmpegJobsActive.set({ status: 'processing' }, activeJobsCount);
};

// ==== MÉTRICAS DE CUSTO ====

// Função para calcular custo de um vídeo
export const calculateVideoCost = (durationSeconds: number, complexity: 'low' | 'medium' | 'high'): number => {
  const complexityFactors = {
    low: 0.5,
    medium: 1.5,
    high: 3.0
  };
  
  const renderFactor = complexityFactors[complexity];
  const renderTimeSeconds = durationSeconds * renderFactor;
  const costPerSecond = 0.238 / 3600; // $0.238 por hora
  const baseCost = costPerSecond * renderTimeSeconds;
  const totalCost = baseCost * 1.2 * 10000; // 20% overhead e multiplicar por 10000 para valores mais significativos
  
  return totalCost;
};

// Função para determinar complexidade baseada no RenderRequest
export const determineComplexity = (renderRequest: any): 'low' | 'medium' | 'high' => {
  if (!renderRequest || !renderRequest.timeline) return 'low';
  
  const timeline = renderRequest.timeline;
  const output = renderRequest.output;
  
  // Contar tracks e clips
  const trackCount = timeline.tracks?.length || 0;
  const totalClips = timeline.tracks?.reduce((total: number, track: any) => 
    total + (track.clips?.length || 0), 0) || 0;
  
  // Verificar se tem efeitos/filtros
  const hasFilters = timeline.tracks?.some((track: any) => 
    track.clips?.some((clip: any) => clip.filter && clip.filter.length > 0)) || false;
  
  // Verificar se tem transições
  const hasTransitions = timeline.tracks?.some((track: any) => 
    track.clips?.some((clip: any) => clip.transition)) || false;
  
  // Verificar resolução alta
  const isHighRes = output?.resolution && 
    (output.resolution.includes('1080') || output.resolution.includes('1920') || 
     output.resolution.includes('4K') || output.resolution.includes('2160'));
  
  // Verificar qualidade alta
  const isHighQuality = output?.quality === 'high';
  
  // Lógica de complexidade
  if ((trackCount > 3 || totalClips > 10) && hasFilters && isHighRes) return 'high';
  if (hasFilters || hasTransitions || isHighRes || isHighQuality || trackCount > 2) return 'medium';
  return 'low';
};

// Função para atualizar métricas de custo
export const updateCostMetrics = (durationSeconds: number, complexity: 'low' | 'medium' | 'high', status: string, jobId: string): void => {
  try {
    const cost = calculateVideoCost(durationSeconds, complexity);
    
    // Atualizar custo total se o job foi bem-sucedido
    if (status === 'completed') {
      videoProcessingCostTotal.labels(complexity).inc(cost);
    }
    
    // Atualizar custo por hora baseado em uma estimativa simples
    // Assumimos que cada job em execução custa $0.238/hora
    const estimatedHourlyCost = 0.238 * 10000; // Multiplicar por 10000 para valores mais significativos
    costPerHourGauge.set(estimatedHourlyCost);
  } catch (error) {
    console.error('Error updating cost metrics:', error);
  }
};

// Função para atualizar custo por hora
export const updateHourlyCost = (activeJobs: number): void => {
  const utilizationRatio = activeJobs / 16; // Assumindo 16 jobs máximos
  const currentHourlyCost = 0.238 * Math.max(utilizationRatio, 0.1) * 10000; // Mínimo 10% e multiplicar por 10000
  costPerHourGauge.set(currentHourlyCost);
};

// Counter para custo total de processamento de vídeo
export const videoProcessingCostTotal = new promClient.Counter({
  name: 'ffmpeg_video_processing_cost_total_dollars',
  help: 'Total cost of video processing in USD (multiplied by 100 for better visualization)',
  labelNames: ['complexity'],
  registers: [register]
});

// Gauge de custo por hora
export const costPerHourGauge = new promClient.Gauge({
  name: 'ffmpeg_cost_per_hour_dollars',
  help: 'Estimated cost per hour in USD (multiplied by 100 for better visualization)',
  registers: [register]
}); 

// Gauge para CPU por job
export const ffmpegCpuUsagePerJob = new promClient.Gauge({
  name: 'ffmpeg_cpu_usage_per_job',
  help: 'CPU usage percentage per FFmpeg job',
  labelNames: ['job_id', 'complexity']
});

// Gauge para memória detalhada por job
export const ffmpegMemoryDetailedUsage = new promClient.Gauge({
  name: 'ffmpeg_memory_detailed_usage',
  help: 'Detailed memory usage per FFmpeg job in bytes',
  labelNames: ['job_id', 'type'] // type pode ser: heapUsed, heapTotal, external, rss
});

// Counter para custo total por job
export const jobProcessingCostTotal = new promClient.Counter({
  name: 'job_processing_cost_total',
  help: 'Total cost of processing jobs in USD',
  labelNames: ['job_id', 'complexity', 'duration_seconds', 'output_format'],
  registers: [register]
});

// Gauge para duração de processamento
export const jobProcessingDuration = new promClient.Gauge({
  name: 'job_processing_duration_seconds',
  help: 'Duration of job processing in seconds',
  labelNames: ['job_id', 'status', 'complexity']
});

// Counter para erros por tipo
export const jobErrorsTotal = new promClient.Counter({
  name: 'job_errors_total',
  help: 'Total number of job errors by type',
  labelNames: ['error_type', 'job_id']
});

// Função para atualizar métricas de CPU por job
export const updateJobCpuMetrics = (jobId: string, complexity: string): void => {
  try {
    const cpuUsage = process.cpuUsage();
    const totalUsage = (cpuUsage.user + cpuUsage.system) / 1000000; // Converter para segundos
    ffmpegCpuUsagePerJob.labels(jobId, complexity).set(totalUsage);
  } catch (error) {
    console.error('Error updating CPU metrics:', error);
  }
};

// Função para atualizar métricas detalhadas de memória por job
export const updateJobMemoryMetrics = (jobId: string): void => {
  try {
    const memoryUsage = process.memoryUsage();
    
    // Atualizar cada tipo de memória separadamente
    ffmpegMemoryDetailedUsage.labels(jobId, 'heapUsed').set(memoryUsage.heapUsed);
    ffmpegMemoryDetailedUsage.labels(jobId, 'heapTotal').set(memoryUsage.heapTotal);
    ffmpegMemoryDetailedUsage.labels(jobId, 'external').set(memoryUsage.external);
    ffmpegMemoryDetailedUsage.labels(jobId, 'rss').set(memoryUsage.rss);
  } catch (error) {
    console.error('Error updating memory metrics:', error);
  }
};

// Função para registrar erro de job
export const recordJobError = (jobId: string, errorType: string): void => {
  try {
    jobErrorsTotal.labels(errorType, jobId).inc();
  } catch (error) {
    console.error('Error recording job error:', error);
  }
};

// Função para atualizar duração de processamento
export const updateJobDuration = (jobId: string, durationSeconds: number, status: string, complexity: string): void => {
  try {
    jobProcessingDuration.labels(jobId, status, complexity).set(durationSeconds);
  } catch (error) {
    console.error('Error updating job duration:', error);
  }
}; 