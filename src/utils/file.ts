import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import { createWriteStream } from 'fs';

/**
 * Ensures a directory exists, creating it if necessary
 */
export const ensureDirectory = async (dirPath: string): Promise<void> => {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }
  }
};

/**
 * Converte uma URL de compartilhamento do Google Drive para URL de download direto
 */
const getGoogleDriveDirectUrl = (url: string): string | null => {
  // Verificar se é uma URL do Google Drive
  const gdriveLinkRegex = /drive\.google\.com\/.*[\/?]([a-zA-Z0-9_-]{25,})/;
  const match = url.match(gdriveLinkRegex);
  
  if (!match) return null;
  
  // Extrair o ID do arquivo
  const fileId = match[1];
  
  // Retornar URL de download direto
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
};

/**
 * Downloads a file from a URL to a local path
 */
export const downloadFile = async (url: string, outputPath: string): Promise<string> => {
  try {
    // Verificar se é uma URL do Google Drive e converter se necessário
    const downloadUrl = getGoogleDriveDirectUrl(url) || url;
    
    console.log('📥 Iniciando download:', {
      originalUrl: url,
      downloadUrl,
      outputPath
    });
    
    const response = await axios({
      url: downloadUrl,
      method: 'GET',
      responseType: 'stream',
      maxBodyLength: Infinity,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    // Verificar se o content-type é texto/html (possível página de confirmação)
    const contentType = response.headers['content-type'];
    if (contentType && contentType.includes('text/html')) {
      throw new Error('Received HTML response instead of file. The URL might be invalid or require authentication.');
    }
    
    // Ensure the directory exists
    await ensureDirectory(path.dirname(outputPath));
    
    const writer = createWriteStream(outputPath);
    response.data.pipe(writer);
    
    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        console.log('✅ Download concluído:', {
          path: outputPath,
          size: writer.bytesWritten
        });
        resolve(outputPath);
      });
      writer.on('error', (error) => {
        console.error('❌ Erro no download:', error);
        reject(error);
      });
    });
  } catch (error) {
    console.error('❌ Falha no download:', error);
    throw new Error(`Failed to download file from ${url}: ${(error as Error).message}`);
  }
};

/**
 * Cleans up temporary files
 */
export const cleanupDirectory = async (dirPath: string): Promise<void> => {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch (error) {
    console.error(`Error cleaning up directory ${dirPath}:`, error);
  }
}; 