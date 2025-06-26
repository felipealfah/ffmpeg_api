import promClient from 'prom-client';
import { Request, Response, NextFunction } from 'express';

// Configurar coleta de métricas padrão do Node.js
promClient.collectDefaultMetrics({
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
});

// Registry para todas as métricas
export const register = promClient.register;

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
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
});

// Gauge de requests ativas
export const httpRequestsActive = new promClient.Gauge({
  name: 'http_requests_active',
  help: 'Number of active HTTP requests',
});

// ==== MÉTRICAS DE JOBS ====

// Gauge de jobs por status
export const jobsActive = new promClient.Gauge({
  name: 'ffmpeg_jobs_active',
  help: 'Number of active FFmpeg jobs',
  labelNames: ['status'],
});

// Contador de jobs totais
export const jobsTotal = new promClient.Counter({
  name: 'ffmpeg_jobs_total',
  help: 'Total number of FFmpeg jobs',
  labelNames: ['status'],
});

// Histograma de duração de jobs
export const jobDuration = new promClient.Histogram({
  name: 'ffmpeg_job_duration_seconds',
  help: 'Duration of FFmpeg jobs in seconds',
  labelNames: ['status'],
  buckets: [5, 10, 30, 60, 120, 300, 600, 1200],
});

// Gauge da fila Redis/Bull
export const queueSize = new promClient.Gauge({
  name: 'bull_queue_size',
  help: 'Number of jobs in Bull queue',
  labelNames: ['queue_name', 'status'],
});

// ==== MÉTRICAS DE SISTEMA ====

// Gauge de uso de storage
export const storageUsage = new promClient.Gauge({
  name: 'storage_usage_bytes',
  help: 'Storage usage in bytes',
  labelNames: ['type'], // 'temp', 'output'
});

// Gauge de contadores de diretórios
export const directoryCount = new promClient.Gauge({
  name: 'storage_directories_count',
  help: 'Number of directories in storage',
  labelNames: ['type'], // 'temp', 'output'
});

// ==== MÉTRICAS PERSONALIZADAS ====

// Gauge de jobs por idade
export const jobsByAge = new promClient.Gauge({
  name: 'ffmpeg_jobs_by_age',
  help: 'Number of jobs by age bucket',
  labelNames: ['age_bucket'], // 'last1h', 'last24h', 'older'
});

// Contador de limpezas automáticas
export const cleanupOperations = new promClient.Counter({
  name: 'cleanup_operations_total',
  help: 'Total number of cleanup operations',
  labelNames: ['type'], // 'automatic', 'manual'
});

// Histograma de tamanho de arquivos processados
export const fileSize = new promClient.Histogram({
  name: 'processed_file_size_bytes',
  help: 'Size of processed files in bytes',
  buckets: [1024, 10240, 102400, 1024000, 10240000, 102400000], // 1KB a 100MB
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
    jobsActive.set({ status }, count);
  });
  
  Object.entries(ageCounts).forEach(([bucket, count]) => {
    jobsByAge.set({ age_bucket: bucket }, count);
  });
};

/**
 * Atualiza métricas de storage
 */
export const updateStorageMetrics = async (stats: any) => {
  // Atualizar contadores de diretórios
  directoryCount.set({ type: 'temp' }, stats.directories?.temp || 0);
  directoryCount.set({ type: 'output' }, stats.directories?.output || 0);
};

/**
 * Registra início de job
 */
export const recordJobStart = (jobId: string) => {
  jobsTotal.inc({ status: 'started' });
  console.log(`📊 Metrics: Job ${jobId} started`);
};

/**
 * Registra fim de job
 */
export const recordJobComplete = (jobId: string, status: 'completed' | 'failed', durationMs: number) => {
  const durationSeconds = durationMs / 1000;
  
  jobsTotal.inc({ status });
  jobDuration.observe({ status }, durationSeconds);
  
  console.log(`📊 Metrics: Job ${jobId} ${status} in ${durationSeconds}s`);
};

/**
 * Registra operação de limpeza
 */
export const recordCleanup = (type: 'automatic' | 'manual', removedCount: number) => {
  cleanupOperations.inc({ type });
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