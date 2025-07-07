import Redis from 'ioredis';
import config from '../config/index';
import logger from '../utils/logger';
import { updateSemaphoreMetrics } from '../middleware/metrics';

export class SemaphoreService {
  private redis: Redis;
  private semaphoreKey: string = 'ffmpeg:semaphore';
  private queueKey: string = 'ffmpeg:queue';
  private activeJobsKey: string = 'ffmpeg:active_jobs';
  private maxConcurrentJobs: number;

  constructor() {
    this.redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
      enableReadyCheck: false,
      lazyConnect: true
    });

    this.maxConcurrentJobs = config.maxConcurrentJobs;
    this.initializeSemaphore();
  }

  private async initializeSemaphore(): Promise<void> {
    try {
      await this.redis.connect();
      // Inicializar o semáforo com o número máximo de jobs permitidos
      await this.redis.set(this.semaphoreKey, this.maxConcurrentJobs);
      logger.info(`🔒 Semáforo inicializado com ${this.maxConcurrentJobs} slots`);
    } catch (error) {
      logger.error('❌ Erro ao inicializar semáforo:', error);
      throw error;
    }
  }

  async acquireSlot(jobId: string): Promise<boolean> {
    try {
      // Tentar adquirir um slot do semáforo
      const availableSlots = await this.redis.decr(this.semaphoreKey);
      
      if (availableSlots >= 0) {
        // Slot adquirido com sucesso
        await this.redis.sadd(this.activeJobsKey, jobId);
        logger.info(`🟢 Job ${jobId} adquiriu slot. Slots restantes: ${availableSlots}`);
        return true;
      } else {
        // Não há slots disponíveis, reverter o decremento
        await this.redis.incr(this.semaphoreKey);
        logger.info(`🔴 Job ${jobId} não conseguiu slot. Adicionando à fila...`);
        return false;
      }
    } catch (error) {
      logger.error(`❌ Erro ao adquirir slot para job ${jobId}:`, error);
      throw error;
    }
  }

  async releaseSlot(jobId: string): Promise<void> {
    try {
      // Liberar o slot
      await this.redis.incr(this.semaphoreKey);
      await this.redis.srem(this.activeJobsKey, jobId);
      
      logger.info(`🔓 Job ${jobId} liberou slot`);
      
      // Verificar se há jobs na fila aguardando
      await this.processQueue();
    } catch (error) {
      logger.error(`❌ Erro ao liberar slot para job ${jobId}:`, error);
      throw error;
    }
  }

  async addToQueue(jobId: string, jobData: any): Promise<void> {
    try {
      const queueData = {
        jobId,
        jobData,
        timestamp: Date.now()
      };
      
      await this.redis.lpush(this.queueKey, JSON.stringify(queueData));
      logger.info(`📋 Job ${jobId} adicionado à fila`);
    } catch (error) {
      logger.error(`❌ Erro ao adicionar job ${jobId} à fila:`, error);
      throw error;
    }
  }

  async processQueue(): Promise<void> {
    try {
      // Verificar se há slots disponíveis
      const availableSlots = await this.redis.get(this.semaphoreKey);
      
      if (parseInt(availableSlots || '0', 10) > 0) {
        // Pegar o próximo job da fila
        const queueItem = await this.redis.rpop(this.queueKey);
        
        if (queueItem) {
          const { jobId, jobData } = JSON.parse(queueItem);
          
          // Tentar adquirir slot para o job da fila
          const acquired = await this.acquireSlot(jobId);
          
          if (acquired) {
            logger.info(`🚀 Job ${jobId} removido da fila e iniciado`);
            // Aqui você pode emitir um evento ou chamar o processamento do job
            this.processJobFromQueue(jobId, jobData);
          } else {
            // Se não conseguiu adquirir, colocar de volta na fila
            await this.redis.rpush(this.queueKey, queueItem);
          }
        }
      }
    } catch (error) {
      logger.error('❌ Erro ao processar fila:', error);
    }
  }

  private async processJobFromQueue(jobId: string, jobData: any): Promise<void> {
    // Este método será chamado quando um job sair da fila
    // Você pode implementar um sistema de eventos aqui
    logger.info(`🔄 Processando job ${jobId} da fila`);
    
    // Por enquanto, apenas log - implementar processamento real depois
    logger.info(`🚀 Job ${jobId} pronto para processamento`);
  }

  async getQueueStatus(): Promise<{
    activeJobs: number;
    queuedJobs: number;
    availableSlots: number;
    activeJobIds: string[];
  }> {
    try {
      const availableSlots = parseInt(await this.redis.get(this.semaphoreKey) || '0', 10);
      const queuedJobs = await this.redis.llen(this.queueKey);
      const activeJobIds = await this.redis.smembers(this.activeJobsKey);
      const activeJobs = activeJobIds.length;

      // Atualizar métricas Prometheus
      updateSemaphoreMetrics(availableSlots, queuedJobs, activeJobs);

      return {
        activeJobs,
        queuedJobs,
        availableSlots,
        activeJobIds
      };
    } catch (error) {
      logger.error('❌ Erro ao obter status da fila:', error);
      throw error;
    }
  }

  async removeFromQueue(jobId: string): Promise<boolean> {
    try {
      // Remover job específico da fila (para cancelamentos)
      const queueLength = await this.redis.llen(this.queueKey);
      let removed = false;

      for (let i = 0; i < queueLength; i++) {
        const item = await this.redis.lindex(this.queueKey, i);
        if (item) {
          const { jobId: queueJobId } = JSON.parse(item);
          if (queueJobId === jobId) {
            await this.redis.lrem(this.queueKey, 1, item);
            removed = true;
            logger.info(`🗑️ Job ${jobId} removido da fila`);
            break;
          }
        }
      }

      return removed;
    } catch (error) {
      logger.error(`❌ Erro ao remover job ${jobId} da fila:`, error);
      throw error;
    }
  }

  async cleanup(): Promise<void> {
    try {
      await this.redis.disconnect();
      logger.info('🧹 SemaphoreService desconectado');
    } catch (error) {
      logger.error('❌ Erro ao desconectar SemaphoreService:', error);
    }
  }
} 