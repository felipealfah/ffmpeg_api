// Debug: arquivo de configuração sendo executado
console.log('🔧 CONFIG: Arquivo de configuração sendo carregado!');

import path from 'path';
import fs from 'fs';

// Configuração padrão
const config = {
  port: process.env.PORT || 3000,
  ffmpegPath: process.env.FFMPEG_PATH || '/usr/local/bin/ffmpeg',
  ffprobePath: process.env.FFPROBE_PATH || '/usr/local/bin/ffprobe',
  maxConcurrentJobs: parseInt(process.env.MAX_CONCURRENT_JOBS || '3', 10),
  defaultTimeout: parseInt(process.env.DEFAULT_TIMEOUT || '300000', 10), // 5 minutos
  outputPath: process.env.OUTPUT_PATH || path.join(__dirname, '../../output'),
  tempPath: process.env.TEMP_PATH || path.join(__dirname, '../../temp'),
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || '',
    db: parseInt(process.env.REDIS_DB || '0', 10)
  },
  ffmpegOptions: {
    memoryLimitMB: parseInt(process.env.FFMPEG_MEMORY_LIMIT_MB || '32768', 10), // 32GB default
    threads: parseInt(process.env.FFMPEG_THREADS || '4', 10),
    preset: process.env.FFMPEG_PRESET || 'medium'
  },
  googleCloud: {
    enabled: process.env.GOOGLE_CLOUD_STORAGE_ENABLED === 'true',
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || '',
    keyFilename: process.env.GOOGLE_CLOUD_KEY_FILE || '',
    bucketName: process.env.GOOGLE_CLOUD_BUCKET_NAME || ''
  }
};

export default config;
module.exports = config;
module.exports.default = config; 