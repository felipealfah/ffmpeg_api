// Debug: arquivo de configuração sendo executado
console.log('🔧 CONFIG: Arquivo de configuração sendo carregado!');

import path from 'path';
import fs from 'fs';

// Caminhos absolutos
const ROOT_PATH = process.cwd();
const STORAGE_PATH = path.join(ROOT_PATH, 'storage');
const TEMP_PATH = path.join(STORAGE_PATH, 'temp');
const OUTPUT_PATH = path.join(STORAGE_PATH, 'output');

// Criar diretórios necessários
try {
  if (!fs.existsSync(STORAGE_PATH)) fs.mkdirSync(STORAGE_PATH, { recursive: true });
  if (!fs.existsSync(TEMP_PATH)) fs.mkdirSync(TEMP_PATH, { recursive: true });
  if (!fs.existsSync(OUTPUT_PATH)) fs.mkdirSync(OUTPUT_PATH, { recursive: true });
} catch (err) {
  console.error('Erro ao criar diretórios:', err);
}

// Log para depurar as variáveis de ambiente
console.log('🔧 ===== DEBUG VARIÁVEIS DE AMBIENTE =====');
console.log('🔧 PORT:', process.env.PORT);
console.log('🔧 FFMPEG_PATH:', process.env.FFMPEG_PATH);
console.log('🔧 FFPROBE_PATH:', process.env.FFPROBE_PATH);
console.log('🔧 MAX_CONCURRENT_JOBS:', process.env.MAX_CONCURRENT_JOBS);
console.log('🔧 FFMPEG_THREADS:', process.env.FFMPEG_THREADS);
console.log('🔧 FFMPEG_MAX_MEMORY:', process.env.FFMPEG_MAX_MEMORY);
console.log('🔧 FFMPEG_PRESET:', process.env.FFMPEG_PRESET);
console.log('🔧 GOOGLE_CLOUD_STORAGE_ENABLED:', process.env.GOOGLE_CLOUD_STORAGE_ENABLED);
console.log('🔧 GOOGLE_CLOUD_PROJECT_ID:', process.env.GOOGLE_CLOUD_PROJECT_ID);
console.log('🔧 REDIS_HOST:', process.env.REDIS_HOST);
console.log('🔧 REDIS_PASSWORD:', process.env.REDIS_PASSWORD ? '***' : 'NOT SET');
console.log('🔧 MAX_CONCURRENT_JOBS:', process.env.MAX_CONCURRENT_JOBS);
console.log('🔧 ======================================');

// Configuração
const config = {
  port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
  ffmpegPath: process.env.FFMPEG_PATH || '/usr/bin/ffmpeg',
  ffprobePath: process.env.FFPROBE_PATH || '/usr/bin/ffprobe',
  redis: {
    host: process.env.REDIS_HOST || 'redis',
    port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379,
    password: process.env.REDIS_PASSWORD || '',
    db: 0
  },
  storagePath: STORAGE_PATH,
  tempPath: TEMP_PATH,
  outputPath: OUTPUT_PATH,
  defaultTimeout: 600000, // 10 minutos (aumentado de 5 para 10)
  maxConcurrentJobs: process.env.MAX_CONCURRENT_JOBS ? parseInt(process.env.MAX_CONCURRENT_JOBS) : 1,
  ffmpegOptions: {
    threads: process.env.FFMPEG_THREADS ? parseInt(process.env.FFMPEG_THREADS) : 5,
    preset: process.env.FFMPEG_PRESET || 'faster',
    maxMemory: process.env.FFMPEG_MAX_MEMORY || '8G',
    priority: process.env.FFMPEG_PRIORITY ? parseInt(process.env.FFMPEG_PRIORITY) : 5,
    bitrate: process.env.FFMPEG_BITRATE || '3000k',
    audioBitrate: process.env.FFMPEG_AUDIO_BITRATE || '128k',
    bufferSize: process.env.FFMPEG_BUFFER_SIZE || '4000k',
    maxRate: process.env.FFMPEG_MAX_RATE || '4000k',
    muxingQueueSize: process.env.FFMPEG_MUXING_QUEUE_SIZE ? parseInt(process.env.FFMPEG_MUXING_QUEUE_SIZE) : 1024,
    cpuUsed: process.env.FFMPEG_CPU_USED ? parseInt(process.env.FFMPEG_CPU_USED) : 3,
    nice: 10 // Prioridade do processo no sistema
  },
  googleCloud: {
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
    keyFilename: process.env.GOOGLE_CLOUD_KEY_FILE,
    bucketName: process.env.GOOGLE_CLOUD_BUCKET_NAME || 'ffmpeg-api',
    enabled: process.env.GOOGLE_CLOUD_STORAGE_ENABLED === 'true'
  }
};

// Log das configurações críticas
console.log('=== DEBUG CONFIG NO SERVER ===');
console.log('🎥 FFmpeg Config:', {
  maxConcurrentJobs: config.maxConcurrentJobs,
  ffmpegOptions: config.ffmpegOptions,
  paths: {
    ffmpeg: config.ffmpegPath,
    ffprobe: config.ffprobePath
  }
});
console.log('🗄️ Storage Config:', {
  storagePath: config.storagePath,
  tempPath: config.tempPath,
  outputPath: config.outputPath
});
console.log('☁️ Google Cloud Config:', config.googleCloud);
console.log('================================');

export default config;
module.exports = config;
module.exports.default = config; 