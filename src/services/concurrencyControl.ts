import Redis from 'ioredis';
import config from '../config/index';
import { logger } from '../utils/logger';
import { updateSemaphoreMetrics, ffmpegJobsActive } from '../middleware/metrics';

/**
 * Serviço centralizado de controle de concorrência para processamento de vídeos.
 * Gerencia slots de processamento e garante que não excedemos o limite de jobs simultâneos.
 */
export class ConcurrencyControl {
  private redis!: Redis;
  private readonly semaphoreKey: string = 'ffmpeg:concurrency_semaphore';
  private readonly activeJobsKey: string = 'ffmpeg:active_jobs_set';
  private readonly maxConcurrentJobs: number;
  private readonly isEnabled: boolean;

  constructor() {
    this.maxConcurrentJobs = config.maxConcurrentJobs;
    this.isEnabled = true; // Sempre ativado para garantir controle de recursos
    
    this.redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db || 0,
      enableReadyCheck: true,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      }
    });
    
    this.initializeSemaphore();
    
    logger.info(`🔒 Controle de concorrência inicializado - Max jobs: ${this.maxConcurrentJobs}`);
  }

  private async initializeSemaphore(): Promise<void> {
    try {
      // Redis se conecta automaticamente quando usado - não precisamos chamar connect()
      
      // Configurar listener de erro do Redis
      this.redis.on('error', (error) => {
        logger.error('❌ Erro na conexão Redis:', error);
      });
      
      this.redis.on('ready', async () => {
        try {
          // Inicializar o semáforo com o número máximo de slots
          await this.redis.set(this.semaphoreKey, this.maxConcurrentJobs);
          
          // Limpar lista de jobs ativos no início
          await this.redis.del(this.activeJobsKey);
          
          logger.info(`🔒 Semáforo inicializado com ${this.maxConcurrentJobs} slots disponíveis`);
        } catch (error) {
          logger.error('❌ Erro ao inicializar semáforo:', error);
        }
      });
      
    } catch (error) {
      logger.error('❌ Erro fatal ao inicializar semáforo:', error);
      throw error; // Falhar fast se Redis não estiver disponível
    }
  }

  /**
   * Tenta adquirir um slot para executar um job
   */
  async acquireSlot(jobId: string): Promise<boolean> {
    try {
      // Verificar se o job já está ativo
      const isActive = await this.redis.sismember(this.activeJobsKey, jobId);
      if (isActive) {
        logger.info(`⚠️ Job ${jobId} já está ativo`);
        return true;
      }

      // Tentar decrementar o semáforo atomicamente
      const availableSlots = await this.redis.decr(this.semaphoreKey);
      
      if (availableSlots >= 0) {
        // Slot adquirido com sucesso
        await this.redis.sadd(this.activeJobsKey, jobId);
        const activeJobs = await this.redis.scard(this.activeJobsKey);
        
        logger.info(`🟢 Job ${jobId} adquiriu slot (${activeJobs}/${this.maxConcurrentJobs} slots em uso)`);
        await this.updateMetrics();
        return true;
      } else {
        // Não há slots disponíveis, reverter o decremento
        await this.redis.incr(this.semaphoreKey);
        logger.warn(`🔴 Job ${jobId} aguardando slot disponível (${this.maxConcurrentJobs}/${this.maxConcurrentJobs} slots em uso)`);
        return false;
      }
    } catch (error) {
      logger.error(`❌ Erro ao adquirir slot para job ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Libera um slot após conclusão do job
   */
  async releaseSlot(jobId: string): Promise<void> {
    try {
      const wasActive = await this.redis.sismember(this.activeJobsKey, jobId);
      
      if (wasActive) {
        await this.redis.incr(this.semaphoreKey);
        await this.redis.srem(this.activeJobsKey, jobId);
        
        const activeJobs = await this.redis.scard(this.activeJobsKey);
        logger.info(`🔓 Job ${jobId} liberou slot (${activeJobs}/${this.maxConcurrentJobs} slots em uso)`);
        
        await this.updateMetrics();
      }
    } catch (error) {
      logger.error(`❌ Erro ao liberar slot para job ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Obtém lista de jobs ativos
   */
  async getActiveJobs(): Promise<string[]> {
    try {
      return await this.redis.smembers(this.activeJobsKey);
    } catch (error) {
      logger.error('❌ Erro ao obter jobs ativos:', error);
      return [];
    }
  }

  /**
   * Obtém status atual do controle de concorrência
   */
  async getStatus(): Promise<{
    maxConcurrentJobs: number;
    availableSlots: number;
    activeJobs: string[];
  }> {
    try {
      const [availableSlots, activeJobs] = await Promise.all([
        this.redis.get(this.semaphoreKey),
        this.redis.smembers(this.activeJobsKey)
      ]);

      return {
        maxConcurrentJobs: this.maxConcurrentJobs,
        availableSlots: parseInt(availableSlots || '0', 10),
        activeJobs
      };
    } catch (error) {
      logger.error('❌ Erro ao obter status:', error);
      throw error;
    }
  }

  /**
   * Força a limpeza de jobs órfãos e reinicializa o semáforo
   */
  async forceCleanup(): Promise<string[]> {
    try {
      // Obter jobs ativos antes da limpeza
      const activeJobs = await this.getActiveJobs();
      
      // Reinicializar o semáforo
      await this.redis.set(this.semaphoreKey, this.maxConcurrentJobs);
      
      // Limpar lista de jobs ativos
      await this.redis.del(this.activeJobsKey);
      
      logger.warn(`🧹 Limpeza forçada executada. ${activeJobs.length} jobs foram liberados.`);
      await this.updateMetrics();
      
      return activeJobs;
    } catch (error) {
      logger.error('❌ Erro ao forçar limpeza:', error);
      throw error;
    }
  }

  private async updateMetrics(): Promise<void> {
    try {
      const status = await this.getStatus();
      updateSemaphoreMetrics(
        status.availableSlots,
        0, // Removido waitingJobs pois é gerenciado pelo Bull
        status.activeJobs.length
      );
      ffmpegJobsActive.set(status.activeJobs.length);
    } catch (error) {
      logger.error('Erro ao atualizar métricas:', error);
    }
  }

  async disconnect(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
    }
  }
}

// Singleton instance
let concurrencyControl: ConcurrencyControl | null = null;

export const getConcurrencyControl = (): ConcurrencyControl => {
  if (!concurrencyControl) {
    concurrencyControl = new ConcurrencyControl();
  }
  return concurrencyControl;
}; 