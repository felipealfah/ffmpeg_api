import path from 'path';

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  ffmpegPath: process.env.FFMPEG_PATH || '/usr/bin/ffmpeg',
  ffprobePath: process.env.FFPROBE_PATH || '/usr/bin/ffprobe',
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0', 10)
  },
  storagePath: process.env.STORAGE_PATH || path.join(__dirname, '../storage'),
  tempPath: process.env.TEMP_PATH || path.join(__dirname, '../storage/temp'),
  outputPath: process.env.OUTPUT_PATH || path.join(__dirname, '../storage/output'),
  defaultTimeout: parseInt(process.env.DEFAULT_TIMEOUT || '3600000', 10), // 1 hora
  maxConcurrentJobs: parseInt(process.env.MAX_CONCURRENT_JOBS || '2', 10),
  ffmpegOptions: {
    threads: parseInt(process.env.FFMPEG_THREADS || '4', 10),
    memory: parseInt(process.env.FFMPEG_MEMORY_LIMIT || '8192', 10), // 8GB
    preset: process.env.FFMPEG_PRESET || 'faster',
    priority: parseInt(process.env.FFMPEG_PRIORITY || '5', 10),
    niceness: parseInt(process.env.FFMPEG_NICENESS || '5', 10)
  },
  googleCloud: {
    enabled: process.env.GOOGLE_CLOUD_STORAGE_ENABLED === 'true',
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
    keyFilename: process.env.GOOGLE_CLOUD_KEY_FILE,
    bucketName: process.env.GOOGLE_CLOUD_BUCKET_NAME
  },
  // Aliases para compatibilidade
  get tempDir() {
    return this.tempPath;
  },
  get outputDir() {
    return this.outputPath;
  }
};

export default config; 