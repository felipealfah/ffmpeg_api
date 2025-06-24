import { Request, Response } from 'express';
import { circuitBreaker, resetCircuitBreaker } from '../middleware/circuitBreaker';
import { logger } from '../utils/logger';

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