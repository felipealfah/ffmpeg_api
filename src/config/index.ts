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
  defaultTimeout: 300000 // 5 minutos
};

console.log('Config carregado:', {
  ffmpegPath: config.ffmpegPath,
  ffprobePath: config.ffprobePath,
  storagePath: config.storagePath
});

export default config; 