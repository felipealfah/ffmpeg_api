import { Storage } from '@google-cloud/storage';
import path from 'path';
import fs from 'fs/promises';
import { logger } from '../utils/logger';

interface StorageConfig {
  projectId?: string;
  keyFilename?: string;
  bucketName: string;
}

interface UploadOptions {
  destination?: string;
  metadata?: {
    [key: string]: string;
  };
  public?: boolean;
}

interface UploadResult {
  publicUrl: string;
  gsUrl: string;
  fileName: string;
  size: number;
}

class StorageService {
  private storage: Storage;
  private bucketName: string;
  private bucket: any;

  constructor(config: StorageConfig) {
    // Configurar o cliente do Google Cloud Storage
    const storageOptions: any = {};
    
    if (config.projectId) {
      storageOptions.projectId = config.projectId;
    }
    
    if (config.keyFilename) {
      storageOptions.keyFilename = config.keyFilename;
    }

    this.storage = new Storage(storageOptions);
    this.bucketName = config.bucketName;
    this.bucket = this.storage.bucket(this.bucketName);

    logger.info('StorageService inicializado', {
      bucketName: this.bucketName,
      projectId: config.projectId || 'default'
    });
  }

  /**
   * Faz upload de um arquivo local para o Google Cloud Storage
   */
  async uploadFile(
    localFilePath: string, 
    options: UploadOptions = {}
  ): Promise<UploadResult> {
    try {
      // Verificar se o arquivo existe
      const stats = await fs.stat(localFilePath);
      const fileName = options.destination || path.basename(localFilePath);
      
      logger.info('Iniciando upload para GCS', {
        localPath: localFilePath,
        destination: fileName,
        size: stats.size
      });

      // Configurar opções de upload
      const uploadOptions: any = {
        destination: fileName,
        metadata: {
          metadata: {
            uploadedAt: new Date().toISOString(),
            originalName: path.basename(localFilePath),
            ...options.metadata
          }
        }
      };

      // Fazer o upload
      const [file] = await this.bucket.upload(localFilePath, uploadOptions);

      // Tornar público se solicitado (quando bucket permite)
      if (options.public) {
        try {
          await file.makePublic();
        } catch (publicError) {
          logger.info('Não foi possível tornar arquivo público (uniform bucket-level access pode estar habilitado)', {
            fileName,
            error: publicError instanceof Error ? publicError.message : 'Unknown error'
          });
        }
      }

      // Gerar URLs
      const publicUrl = options.public 
        ? `https://storage.googleapis.com/${this.bucketName}/${fileName}`
        : '';
      const gsUrl = `gs://${this.bucketName}/${fileName}`;

      const result: UploadResult = {
        publicUrl,
        gsUrl,
        fileName,
        size: stats.size
      };

      logger.info('Upload concluído com sucesso', result);
      return result;

    } catch (error) {
      logger.error('Erro no upload para GCS', {
        localPath: localFilePath,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new Error(`Falha no upload para GCS: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Gera uma URL assinada para download temporário
   */
  async generateSignedUrl(fileName: string, expiresInHours: number = 24): Promise<string> {
    try {
      const file = this.bucket.file(fileName);
      
      const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + (expiresInHours * 60 * 60 * 1000)
      });

      logger.info('URL assinada gerada', {
        fileName,
        expiresInHours
      });

      return signedUrl;
    } catch (error) {
      logger.error('Erro ao gerar URL assinada', {
        fileName,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new Error(`Falha ao gerar URL assinada: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Verifica se um arquivo existe no bucket
   */
  async fileExists(fileName: string): Promise<boolean> {
    try {
      const file = this.bucket.file(fileName);
      const [exists] = await file.exists();
      return exists;
    } catch (error) {
      logger.error('Erro ao verificar existência do arquivo', {
        fileName,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Remove um arquivo do bucket
   */
  async deleteFile(fileName: string): Promise<void> {
    try {
      const file = this.bucket.file(fileName);
      await file.delete();
      
      logger.info('Arquivo removido do GCS', { fileName });
    } catch (error) {
      logger.error('Erro ao remover arquivo do GCS', {
        fileName,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new Error(`Falha ao remover arquivo: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Lista arquivos no bucket com prefixo opcional
   */
  async listFiles(prefix?: string): Promise<string[]> {
    try {
      const options: any = {};
      if (prefix) {
        options.prefix = prefix;
      }

      const [files] = await this.bucket.getFiles(options);
      const fileNames = files.map((file: any) => file.name);

      logger.info('Arquivos listados', {
        prefix,
        count: fileNames.length
      });

      return fileNames;
    } catch (error) {
      logger.error('Erro ao listar arquivos', {
        prefix,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new Error(`Falha ao listar arquivos: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Obtém metadados de um arquivo
   */
  async getFileMetadata(fileName: string): Promise<any> {
    try {
      const file = this.bucket.file(fileName);
      const [metadata] = await file.getMetadata();
      
      return {
        name: metadata.name,
        size: parseInt(metadata.size),
        contentType: metadata.contentType,
        created: metadata.timeCreated,
        updated: metadata.updated,
        etag: metadata.etag
      };
    } catch (error) {
      logger.error('Erro ao obter metadados', {
        fileName,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new Error(`Falha ao obter metadados: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Instância singleton do serviço de storage
let storageService: StorageService | null = null;

export const initializeStorageService = (config: StorageConfig): StorageService => {
  storageService = new StorageService(config);
  return storageService;
};

export const getStorageService = (): StorageService => {
  if (!storageService) {
    throw new Error('StorageService não foi inicializado. Chame initializeStorageService() primeiro.');
  }
  return storageService;
};

export { StorageService, StorageConfig, UploadOptions, UploadResult }; 