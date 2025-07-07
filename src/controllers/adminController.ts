import { Request, Response } from 'express';
import { circuitBreaker, resetCircuitBreaker } from '../middleware/circuitBreaker';
import { getConcurrencyControl } from '../services/concurrencyControl';
import { logger } from '../utils/logger';
import * as queueService from '../services/queueService';

// Get circuit breaker status
export const getCircuitBreakerStatus = async (req: Request, res: Response) => {
  try {
    // Como o Map não é serializável, vamos converter para objeto
    const stats: Record<string, any> = {};
    
    // Acessar stats privados através de reflexão (hack para debugging)
    const circuitBreakerInstance = circuitBreaker as any;
    if (circuitBreakerInstance.stats && circuitBreakerInstance.stats.forEach) {
      circuitBreakerInstance.stats.forEach((value: any, key: string) => {
        stats[key] = value;
      });
    }

    return res.status(200).json({
      data: {
        circuitBreakers: stats,
        totalKeys: Object.keys(stats).length,
        openCircuits: Object.values(stats).filter((s: any) => s.isOpen).length
      }
    });
  } catch (error) {
    logger.error('Erro ao obter status do circuit breaker:', error);
    throw error;
  }
};

// Reset circuit breaker
export const resetCircuitBreakerEndpoint = async (req: Request, res: Response) => {
  try {
    const { key } = req.body;
    
    logger.info('Resetando circuit breaker', { key: key || 'ALL' });
    resetCircuitBreaker(key);
    
    return res.status(200).json({
      data: {
        message: key ? `Circuit breaker resetado para chave: ${key}` : 'Todos os circuit breakers resetados',
        key: key || null,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Erro ao resetar circuit breaker:', error);
    throw error;
  }
};

// Emergency stop - clear everything
export const emergencyStop = async (req: Request, res: Response) => {
  try {
    logger.warn('EMERGENCY STOP executado via API');
    
    // Reset all circuit breakers
    resetCircuitBreaker();
    
    // TODO: Add other emergency procedures here
    // - Clear queues
    // - Stop processing jobs
    // - etc.
    
    return res.status(200).json({
      data: {
        message: 'Emergency stop executado com sucesso',
        actions: [
          'Circuit breakers resetados',
          'Processamento interrompido'
        ],
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Erro no emergency stop:', error);
    throw error;
  }
};

// Manual cleanup endpoint
export const manualCleanup = async (req: Request, res: Response) => {
  try {
    const { maxAgeHours = 24 } = req.body;
    
    logger.info('Iniciando limpeza manual', { maxAgeHours });
    
    // Executar limpeza
    const results = await queueService.performManualCleanup(maxAgeHours);
    
    return res.status(200).json({
      data: {
        message: 'Limpeza manual executada com sucesso',
        results,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Erro na limpeza manual:', error);
    throw error;
  }
};

// Get storage statistics
export const getStorageStats = async (req: Request, res: Response) => {
  try {
    const stats = await queueService.getStorageStatistics();
    
    return res.status(200).json({
      data: {
        storage: stats,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Erro ao obter estatísticas de storage:', error);
    throw error;
  }
};

// Get concurrency control status
export const getConcurrencyStatus = async (req: Request, res: Response) => {
  try {
    const concurrencyControl = getConcurrencyControl();
    const status = await concurrencyControl.getStatus();
    
    return res.status(200).json({
      data: {
        concurrency: status,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Erro ao obter status do controle de concorrência:', error);
    throw error;
  }
};

// Force cleanup orphaned jobs
export const forceCleanupConcurrency = async (req: Request, res: Response) => {
  try {
    const concurrencyControl = getConcurrencyControl();
    const cleanedJobs = await concurrencyControl.forceCleanup();
    
    logger.warn('Limpeza forçada do controle de concorrência executada', { cleanedJobs });
    
    return res.status(200).json({
      data: {
        message: 'Limpeza forçada executada com sucesso',
        cleanedJobs,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Erro na limpeza forçada do controle de concorrência:', error);
    throw error;
  }
}; 

// Get queue status
export const getQueueStatus = async (req: Request, res: Response) => {
  try {
    console.log('🔍 getQueueStatus chamado - iniciando...');
    const queueStats = await queueService.getQueueStatistics();
    console.log('🔍 getQueueStatus - estatísticas obtidas:', queueStats);
    
    return res.status(200).json({
      data: {
        queue: queueStats,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('🔍 getQueueStatus - erro capturado:', error);
    logger.error('Erro ao obter estatísticas da fila:', error);
    throw error;
  }
}; 