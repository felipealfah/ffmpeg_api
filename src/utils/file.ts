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
 * Downloads a file from a URL to a local path
 */
export const downloadFile = async (url: string, outputPath: string): Promise<string> => {
  try {
    const response = await axios({
      url,
      method: 'GET',
      responseType: 'stream'
    });
    
    // Ensure the directory exists
    await ensureDirectory(path.dirname(outputPath));
    
    const writer = createWriteStream(outputPath);
    response.data.pipe(writer);
    
    return new Promise((resolve, reject) => {
      writer.on('finish', () => resolve(outputPath));
      writer.on('error', reject);
    });
  } catch (error) {
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