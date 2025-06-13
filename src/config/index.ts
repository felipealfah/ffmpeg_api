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

// Configuração simples
const config = {
  port: 3000,
  ffmpegPath: '/opt/homebrew/bin/ffmpeg',
  ffprobePath: '/opt/homebrew/bin/ffprobe',
  redis: {
    host: 'localhost',
    port: 6379
  },
  storagePath: STORAGE_PATH,
  tempPath: TEMP_PATH,
  outputPath: OUTPUT_PATH,
  defaultTimeout: 300000 // 5 minutos
};

export default config; 