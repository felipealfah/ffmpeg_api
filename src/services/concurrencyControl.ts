import Redis from 'ioredis';
import config from '../config/index';
import { logger } from '../utils/logger';
import { updateSemaphoreMetrics, ffmpegJobsActive } from '../middleware/metrics';

/**
 * Serviço de controle de concorrência que funciona como uma camada de proteção
 * sobre o sistema de fila existente. Não substitui o sistema atual, apenas
 * adiciona controle de quantos jobs podem rodar simultaneamente.
 */
export class ConcurrencyControl {
  private redis!: Redis;
  private semaphoreKey: string = 'ffmpeg:concurrency_semaphore';
  private activeJobsKey: string = 'ffmpeg:active_jobs_set';
  private maxConcurrentJobs: number;
  private isEnabled: boolean;

  constructor() {
    this.maxConcurrentJobs = config.maxConcurrentJobs;
    this.isEnabled = process.env.ENABLE_JOB_QUEUE !== 'false';
    
    if (this.isEnabled) {
      this.redis = new Redis({
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        db: config.redis.db || 0,
        enableReadyCheck: false,
        lazyConnect: true
      });
      
      this.initializeSemaphore();
    }
    
    logger.info(`🔒 Controle de concorrência ${this.isEnabled ? 'ATIVADO' : 'DESATIVADO'} - Max jobs: ${this.maxConcurrentJobs}`);
  }

  private async initializeSemaphore(): Promise<void> {
    try {
      if (!this.isEnabled) return;
      
      await this.redis.connect();
      
      // Inicializar o semáforo se não existir
      const exists = await this.redis.exists(this.semaphoreKey);
      if (!exists) {
        await this.redis.set(this.semaphoreKey, this.maxConcurrentJobs);
      }
      
      logger.info(`🔒 Semáforo inicializado com ${this.maxConcurrentJobs} slots`);
    } catch (error) {
      logger.error('❌ Erro ao inicializar semáforo:', error);
      // Não falhar se Redis não estiver disponível - apenas desabilitar controle
      this.isEnabled = false;
    }
  }

  /**
   * Tenta adquirir um slot para executar um job
   * @param jobId ID do job
   * @returns true se conseguiu adquirir slot, false caso contrário
   */
  async tryAcquireSlot(jobId: string): Promise<boolean> {
    if (!this.isEnabled) {
      // Se controle está desabilitado, sempre permitir
      return true;
    }

    try {
      // Tentar decrementar o semáforo atomicamente
      const availableSlots = await this.redis.decr(this.semaphoreKey);
      
      if (availableSlots >= 0) {
        // Slot adquirido com sucesso
        await this.redis.sadd(this.activeJobsKey, jobId);
        logger.info(`🟢 Job ${jobId} adquiriu slot. Slots restantes: ${availableSlots}`);
        
        // Atualizar métricas
        await this.updateMetrics();
        return true;
      } else {
        // Não há slots disponíveis, reverter o decremento
        await this.redis.incr(this.semaphoreKey);
        logger.warn(`🔴 Job ${jobId} rejeitado - sem slots disponíveis`);
        return false;
      }
    } catch (error) {
      logger.error(`❌ Erro ao adquirir slot para job ${jobId}:`, error);
      // Em caso de erro, permitir execução para não quebrar o sistema
      return true;
    }
  }

  /**
   * Libera um slot após conclusão do job
   * @param jobId ID do job
   */
  async releaseSlot(jobId: string): Promise<void> {
    if (!this.isEnabled) return;

    try {
      // Verificar se o job realmente estava ativo
      const wasActive = await this.redis.sismember(this.activeJobsKey, jobId);
      
      if (wasActive) {
        // Liberar o slot
        await this.redis.incr(this.semaphoreKey);
        await this.redis.srem(this.activeJobsKey, jobId);
        
        logger.info(`🔓 Job ${jobId} liberou slot`);
        
        // Atualizar métricas
        await this.updateMetrics();
      }
    } catch (error) {
      logger.error(`❌ Erro ao liberar slot para job ${jobId}:`, error);
    }
  }

  /**
   * Obtém status atual do controle de concorrência
   */
  async getStatus(): Promise<{
    enabled: boolean;
    maxConcurrentJobs: number;
    availableSlots: number;
    activeJobs: number;
    activeJobIds: string[];
  }> {
    if (!this.isEnabled) {
      return {
        enabled: false,
        maxConcurrentJobs: this.maxConcurrentJobs,
        availableSlots: this.maxConcurrentJobs,
        activeJobs: 0,
        activeJobIds: []
      };
    }

    try {
      const availableSlots = parseInt(await this.redis.get(this.semaphoreKey) || '0', 10);
      const activeJobIds = await this.redis.smembers(this.activeJobsKey);
      const activeJobs = activeJobIds.length;

      return {
        enabled: true,
        maxConcurrentJobs: this.maxConcurrentJobs,
        availableSlots,
        activeJobs,
        activeJobIds
      };
    } catch (error) {
      logger.error('❌ Erro ao obter status:', error);
      return {
        enabled: false,
        maxConcurrentJobs: this.maxConcurrentJobs,
        availableSlots: 0,
        activeJobs: 0,
        activeJobIds: []
      };
    }
  }

  /**
   * Força limpeza de jobs órfãos (jobs que não liberaram slots corretamente)
   */
  async forceCleanup(): Promise<number> {
    if (!this.isEnabled) return 0;

    try {
      const activeJobIds = await this.redis.smembers(this.activeJobsKey);
      
      // Limpar todos os jobs ativos
      if (activeJobIds.length > 0) {
        await this.redis.del(this.activeJobsKey);
        await this.redis.set(this.semaphoreKey, this.maxConcurrentJobs);
        
        logger.warn(`🧹 Limpeza forçada: ${activeJobIds.length} jobs órfãos removidos`);
        return activeJobIds.length;
      }
      
      return 0;
    } catch (error) {
      logger.error('❌ Erro na limpeza forçada:', error);
      return 0;
    }
  }

  private async updateMetrics(): Promise<void> {
    try {
      const status = await this.getStatus();
      updateSemaphoreMetrics(status.availableSlots, 0, status.activeJobs);
    } catch (error) {
      // Não falhar se métricas falharem
      logger.debug('Erro ao atualizar métricas:', error);
    }
  }

  async disconnect(): Promise<void> {
    if (this.isEnabled && this.redis) {
      try {
        await this.redis.disconnect();
        logger.info('🧹 ConcurrencyControl desconectado');
      } catch (error) {
        logger.error('❌ Erro ao desconectar ConcurrencyControl:', error);
      }
    }
  }
}

// Instância singleton
let concurrencyControlInstance: ConcurrencyControl;

export const getConcurrencyControl = (): ConcurrencyControl => {
  if (!concurrencyControlInstance) {
    concurrencyControlInstance = new ConcurrencyControl();
  }
  return concurrencyControlInstance;
}; 