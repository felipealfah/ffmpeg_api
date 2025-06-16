console.log('🔧 CONFIG JS: Arquivo JavaScript sendo carregado!');

console.log('🔧 JS PORT:', process.env.PORT);
console.log('🔧 JS FFMPEG_PATH:', process.env.FFMPEG_PATH);
console.log('🔧 JS GOOGLE_CLOUD_STORAGE_ENABLED:', process.env.GOOGLE_CLOUD_STORAGE_ENABLED);

const config = {
  port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
  ffmpegPath: process.env.FFMPEG_PATH || '/opt/homebrew/bin/ffmpeg',
  ffprobePath: process.env.FFPROBE_PATH || '/opt/homebrew/bin/ffprobe',
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379
  },
  storagePath: require('path').join(process.cwd(), 'storage'),
  tempPath: require('path').join(process.cwd(), 'storage', 'temp'),
  outputPath: require('path').join(process.cwd(), 'storage', 'output'),
  defaultTimeout: 300000,
  googleCloud: {
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
    keyFilename: process.env.GOOGLE_CLOUD_KEY_FILE,
    bucketName: process.env.GOOGLE_CLOUD_BUCKET_NAME || 'ffmpeg-api-outputs',
    enabled: process.env.GOOGLE_CLOUD_STORAGE_ENABLED === 'true'
  }
};

console.log('🔧 JS CONFIG FINAL:', config);

module.exports = config;
