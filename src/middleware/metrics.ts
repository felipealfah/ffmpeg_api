import promClient from 'prom-client';
import { Request, Response, NextFunction } from 'express';
import { Registry, Gauge } from 'prom-client';

// Configurar coleta de métricas padrão do Node.js
promClient.collectDefaultMetrics({
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
});

export const register = new Registry();

// Métricas existentes
export const ffmpegMemoryUsage = new Gauge({
  name: 'ffmpeg_memory_usage_bytes',
  help: 'Uso de memória do FFmpeg em bytes',
  labelNames: ['job_id'],
  registers: [register]
});

export const ffmpegSigkillJobs = new Gauge({
  name: 'ffmpeg_sigkill_jobs_total',
  help: 'Número total de jobs FFmpeg terminados com SIGKILL',
  registers: [register]
});

export const ffmpegOrphanedProcesses = new Gauge({
  name: 'ffmpeg_orphaned_processes_total',
  help: 'Número total de processos FFmpeg órfãos detectados',
  registers: [register]
});

// Nova métrica para jobs ativos
export const activeRenderJobs = new Gauge({
  name: 'ffmpeg_active_render_jobs',
  help: 'Número atual de jobs de renderização ativos',
  registers: [register]
});

// ==== MÉTRICAS HTTP ====

// Contador de requests HTTP
export const httpRequestsTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

// Histograma de duração de requests HTTP
export const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
});

// Gauge de requests ativas
export const httpRequestsActive = new promClient.Gauge({
  name: 'http_requests_active',
  help: 'Number of active HTTP requests',
});

// ==== MÉTRICAS DE JOBS ====

// Gauge de jobs por status
export const ffmpegJobsActive = new promClient.Gauge({
  name: 'ffmpeg_jobs_active',
  help: 'Number of active FFmpeg jobs by status',
  labelNames: ['status'],
});

// Contador de jobs totais
export const ffmpegJobsTotal = new promClient.Counter({
  name: 'ffmpeg_jobs_total',
  help: 'Total number of FFmpeg jobs processed',
  labelNames: ['status', 'complexity'],
});

// Histograma de duração de jobs
export const ffmpegJobDuration = new promClient.Histogram({
  name: 'ffmpeg_job_duration_seconds',
  help: 'Duration of FFmpeg job processing in seconds',
  labelNames: ['complexity', 'status'],
  buckets: [1, 5, 10, 30, 60, 300, 600, 1800],
});

// Gauge para jobs ativos (removido - duplicado com ffmpegJobsActive)

// Contador de jobs terminados com SIGKILL
export const ffmpegSigkillJobs = new promClient.Counter({
  name: 'ffmpeg_sigkill_jobs_total',
  help: 'Total number of FFmpeg jobs killed with SIGKILL',
  labelNames: ['reason'],
});

// Gauge para uso de memória por job
export const ffmpegMemoryUsage = new promClient.Gauge({
  name: 'ffmpeg_memory_usage_bytes',
  help: 'Memory usage per FFmpeg job in bytes',
  labelNames: ['job_id'],
});

// Contador de processos órfãos limpos
export const ffmpegOrphanedProcesses = new promClient.Counter({
  name: 'ffmpeg_orphaned_processes_total',
  help: 'Total number of orphaned FFmpeg processes cleaned up',
});

// Gauge para limite de concorrência
export const ffmpegConcurrencyLimit = new promClient.Gauge({
  name: 'ffmpeg_concurrency_limit',
  help: 'Maximum number of concurrent FFmpeg jobs allowed',
});

// Gauge da fila Redis/Bull
export const queueSize = new promClient.Gauge({
  name: 'bull_queue_size',
  help: 'Number of jobs in Bull queue',
  labelNames: ['queue_name', 'status'],
});

// ==== MÉTRICAS DO SEMÁFORO ====

// Gauge de slots disponíveis no semáforo
export const semaphoreAvailableSlots = new promClient.Gauge({
  name: 'ffmpeg_semaphore_available_slots',
  help: 'Number of available slots in the semaphore',
});

// Gauge de jobs na fila aguardando
export const semaphoreQueuedJobs = new promClient.Gauge({
  name: 'ffmpeg_semaphore_queued_jobs',
  help: 'Number of jobs queued waiting for semaphore slots',
});

// Função para atualizar métricas do semáforo
export const updateSemaphoreMetrics = (availableSlots: number, queuedJobs: number, activeJobsCount: number) => {
  semaphoreAvailableSlots.set(availableSlots);
  semaphoreQueuedJobs.set(queuedJobs);
  ffmpegJobsActive.set({ status: 'processing' }, activeJobsCount);
};

// ==== MÉTRICAS DE SISTEMA ====

// Gauge de uso de storage
export const storageUsage = new promClient.Gauge({
  name: 'storage_usage_bytes',
  help: 'Storage usage in bytes',
  labelNames: ['type'], // 'temp', 'output'
});

// Gauge de contadores de diretórios
export const storageDirectoriesTotal = new promClient.Gauge({
  name: 'storage_directories_total',
  help: 'Total number of directories in storage',
  labelNames: ['type'], // 'temp', 'output'
});

// ==== MÉTRICAS PERSONALIZADAS ====

// Gauge de jobs por idade
export const ffmpegJobsByAge = new promClient.Gauge({
  name: 'ffmpeg_jobs_by_age',
  help: 'Number of jobs by age category',
  labelNames: ['age_category'], // 'last1h', 'last24h', 'older'
});

// Contador de limpezas automáticas
export const cleanupOperationsTotal = new promClient.Counter({
  name: 'cleanup_operations_total',
  help: 'Total number of cleanup operations',
  labelNames: ['type', 'status'],
});

// Histograma de tamanho de arquivos processados
export const fileSize = new promClient.Histogram({
  name: 'processed_file_size_bytes',
  help: 'Size of processed files in bytes',
  buckets: [1024, 10240, 102400, 1024000, 10240000, 102400000], // 1KB a 100MB
});

// ==== MÉTRICAS DE CUSTO ====

// Gauge de custo por vídeo
export const costPerVideoGauge = new promClient.Gauge({
  name: 'ffmpeg_cost_per_video_dollars',
  help: 'Estimated cost per video in dollars',
  labelNames: ['complexity', 'duration_category'],
});

// Gauge de custo por hora
export const costPerHourGauge = new promClient.Gauge({
  name: 'ffmpeg_cost_per_hour_dollars',
  help: 'Current cost per hour based on active jobs',
});

// Gauge de custo mensal projetado
export const monthlyProjectedCost = new promClient.Gauge({
  name: 'ffmpeg_monthly_projected_cost_dollars',
  help: 'Projected monthly cost based on current usage',
});

// Gauge de custo do servidor
export const serverCostPerHour = new promClient.Gauge({
  name: 'server_cost_per_hour_dollars',
  help: 'Server cost per hour (configurable)',
  labelNames: ['provider', 'instance_type'],
});

// Contador de custo total de processamento de vídeo
export const videoProcessingCostTotal = new promClient.Counter({
  name: 'ffmpeg_video_processing_cost_total_dollars',
  help: 'Total accumulated cost for video processing',
  labelNames: ['complexity'],
});

// Gauge de eficiência de custo
export const costEfficiencyRatio = new promClient.Gauge({
  name: 'ffmpeg_cost_efficiency_ratio',
  help: 'Cost efficiency ratio (videos processed per dollar)',
});

// Configurações de custo (podem ser alteradas via variáveis de ambiente)
const COST_CONFIG = {
  serverCostPerHour: parseFloat(process.env.SERVER_COST_PER_HOUR || '0.238'), // DO 16GB default
  providerName: process.env.CLOUD_PROVIDER || 'DigitalOcean',
  instanceType: process.env.INSTANCE_TYPE || '16GB CPU-Optimized',
  
  // Fatores de renderização por complexidade
  complexityFactors: {
    low: 0.5,
    medium: 1.5,
    high: 3.0
  },
  
  // Custos adicionais (storage, bandwidth, overhead)
  additionalCostFactor: 0.2, // 20% overhead
};

// Inicializar métrica de custo do servidor
serverCostPerHour.set(
  { provider: COST_CONFIG.providerName, instance_type: COST_CONFIG.instanceType },
  COST_CONFIG.serverCostPerHour
);

// Função para calcular custo de um vídeo
export function calculateVideoCost(durationSeconds: number, complexity: 'low' | 'medium' | 'high'): number {
  const renderFactor = COST_CONFIG.complexityFactors[complexity];
  const renderTimeSeconds = durationSeconds * renderFactor;
  const costPerSecond = COST_CONFIG.serverCostPerHour / 3600;
  const baseCost = costPerSecond * renderTimeSeconds;
  const totalCost = baseCost * (1 + COST_CONFIG.additionalCostFactor);
  
  return totalCost;
}

// Função para determinar categoria de duração
function getDurationCategory(durationSeconds: number): string {
  if (durationSeconds <= 60) return 'short'; // ≤ 1 min
  if (durationSeconds <= 300) return 'medium'; // ≤ 5 min
  if (durationSeconds <= 600) return 'long'; // ≤ 10 min
  return 'very_long'; // > 10 min
}

// Função para determinar complexidade baseada no RenderRequest
export function determineComplexity(renderRequest: any): 'low' | 'medium' | 'high' {
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
}

// Atualizar métricas de custo quando um job é processado
export function updateCostMetrics(durationSeconds: number, complexity: 'low' | 'medium' | 'high', status: string) {
  const cost = calculateVideoCost(durationSeconds, complexity);
  const durationCategory = getDurationCategory(durationSeconds);
  
  // Atualizar custo por vídeo
  costPerVideoGauge.set({ complexity, duration_category: durationCategory }, cost);
  
  // Acumular custo total se o job foi bem-sucedido
  if (status === 'completed') {
    videoProcessingCostTotal.inc({ complexity }, cost);
  }
  
  // Atualizar eficiência de custo
  updateCostEfficiency();
}

// Função para atualizar custo por hora baseado em jobs ativos
export function updateHourlyCost(activeJobs: number) {
  const utilizationRatio = activeJobs / 16; // Assumindo 16 jobs máximos
  const currentHourlyCost = COST_CONFIG.serverCostPerHour * Math.max(utilizationRatio, 0.1); // Mínimo 10%
  costPerHourGauge.set(currentHourlyCost);
}

// Função para calcular projeção mensal
export function updateMonthlyProjection() {
  // Pegar métricas dos últimos 24h para projetar o mês
  const dailyJobsApprox = 100; // Isso seria calculado baseado em métricas históricas
  const avgCostPerVideo = 0.01; // Isso seria calculado baseado em métricas históricas
  const monthlyProjection = dailyJobsApprox * 30 * avgCostPerVideo;
  
  monthlyProjectedCost.set(monthlyProjection);
}

// Função para atualizar eficiência de custo
function updateCostEfficiency() {
  // Calcular vídeos processados por dólar
  const totalVideos = 1000; // Isso seria obtido de métricas históricas
  const totalCost = 10; // Isso seria obtido de métricas históricas
  const efficiency = totalCost > 0 ? totalVideos / totalCost : 0;
  
  costEfficiencyRatio.set(efficiency);
}

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
  
  Object.entries(ageCounts).forEach(([bucket, count]) => {
    ffmpegJobsByAge.set({ age_category: bucket }, count);
  });
};

/**
 * Atualiza métricas de storage
 */
export const updateStorageMetrics = async (stats: any) => {
  // Atualizar contadores de diretórios
  storageDirectoriesTotal.set({ type: 'temp' }, stats.directories?.temp || 0);
  storageDirectoriesTotal.set({ type: 'output' }, stats.directories?.output || 0);
};

/**
 * Registra início de job
 */
export const recordJobStart = (jobId: string) => {
  ffmpegJobsTotal.inc({ status: 'started', complexity: 'unknown' });
  console.log(`📊 Metrics: Job ${jobId} started`);
};

/**
 * Registra fim de job
 */
export const recordJobComplete = (jobId: string, durationMs: number) => {
  const durationSeconds = durationMs / 1000;
  
  ffmpegJobsTotal.inc({ status: 'completed', complexity: 'unknown' });
  ffmpegJobDuration.observe({ complexity: 'unknown', status: 'completed' }, durationSeconds);
  
  console.log(`📊 Metrics: Job ${jobId} completed in ${durationSeconds}s`);
};

/**
 * Registra falha de job
 */
export const recordJobFail = (jobId: string, durationMs: number) => {
  const durationSeconds = durationMs / 1000;
  
  ffmpegJobsTotal.inc({ status: 'failed', complexity: 'unknown' });
  ffmpegJobDuration.observe({ complexity: 'unknown', status: 'failed' }, durationSeconds);
  
  console.log(`📊 Metrics: Job ${jobId} failed in ${durationSeconds}s`);
};

/**
 * Registra operação de limpeza
 */
export const recordCleanup = (type: 'automatic' | 'manual', removedCount: number) => {
  cleanupOperationsTotal.inc({ type, status: 'unknown' });
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