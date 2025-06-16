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
console.log('🔧 GOOGLE_CLOUD_STORAGE_ENABLED:', process.env.GOOGLE_CLOUD_STORAGE_ENABLED);
console.log('🔧 GOOGLE_CLOUD_PROJECT_ID:', process.env.GOOGLE_CLOUD_PROJECT_ID);
console.log('🔧 REDIS_HOST:', process.env.REDIS_HOST);
console.log('🔧 ======================================');

// Configuração
const config = {
  port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
  ffmpegPath: process.env.FFMPEG_PATH || '/opt/homebrew/bin/ffmpeg',
  ffprobePath: process.env.FFPROBE_PATH || '/opt/homebrew/bin/ffprobe',
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379
  },
  storagePath: STORAGE_PATH,
  tempPath: TEMP_PATH,
  outputPath: OUTPUT_PATH,
  defaultTimeout: 300000, // 5 minutos
  googleCloud: {
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
    keyFilename: process.env.GOOGLE_CLOUD_KEY_FILE,
    bucketName: process.env.GOOGLE_CLOUD_BUCKET_NAME || 'ffmpeg-api-outputs',
    enabled: process.env.GOOGLE_CLOUD_STORAGE_ENABLED === 'true'
  }
};

console.log('Config carregado:', {
  ffmpegPath: config.ffmpegPath,
  ffprobePath: config.ffprobePath,
  storagePath: config.storagePath
});

// DEBUG: Log do objeto config completo antes de exportar
console.log('Final config object in config/index.ts:', config);

console.log('🔧 EXPORTANDO CONFIG:', config);

export default config;
module.exports = config;
module.exports.default = config; 