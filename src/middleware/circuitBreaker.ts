import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

interface CircuitBreakerStats {
  failureCount: number;
  lastFailureTime: number;
  isOpen: boolean;
  lastError?: string;
}

class CircuitBreaker {
  private stats: Map<string, CircuitBreakerStats> = new Map();
  private readonly failureThreshold: number;
  private readonly timeWindow: number; // ms
  private readonly openTimeout: number; // ms

  constructor(
    failureThreshold: number = 5,
    timeWindow: number = 60000, // 1 minuto
    openTimeout: number = 300000 // 5 minutos
  ) {
    this.failureThreshold = failureThreshold;
    this.timeWindow = timeWindow;
    this.openTimeout = openTimeout;
  }

  getKey(req: Request): string {
    // Criar chave baseada no IP e endpoint
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const endpoint = req.originalUrl;
    return `${ip}:${endpoint}`;
  }

  recordFailure(key: string, error: string): void {
    const now = Date.now();
    const stats = this.stats.get(key) || {
      failureCount: 0,
      lastFailureTime: 0,
      isOpen: false
    };

    // Resetar contador se passou do tempo de janela
    if (now - stats.lastFailureTime > this.timeWindow) {
      stats.failureCount = 0;
    }

    stats.failureCount++;
    stats.lastFailureTime = now;
    stats.lastError = error;

    // Abrir circuito se passou do threshold
    if (stats.failureCount >= this.failureThreshold) {
      stats.isOpen = true;
      logger.warn('Circuit breaker opened', {
        key,
        failureCount: stats.failureCount,
        lastError: error
      });
    }

    this.stats.set(key, stats);
  }

  isCircuitOpen(key: string): boolean {
    const stats = this.stats.get(key);
    if (!stats || !stats.isOpen) {
      return false;
    }

    const now = Date.now();
    
    // Fechar circuito se passou do timeout
    if (now - stats.lastFailureTime > this.openTimeout) {
      stats.isOpen = false;
      stats.failureCount = 0;
      this.stats.set(key, stats);
      logger.info('Circuit breaker closed', { key });
      return false;
    }

    return true;
  }

  getStats(key: string): CircuitBreakerStats | undefined {
    return this.stats.get(key);
  }

  reset(key?: string): void {
    if (key) {
      this.stats.delete(key);
      logger.info('Circuit breaker reset for key', { key });
    } else {
      this.stats.clear();
      logger.info('All circuit breakers reset');
    }
  }
}

// Instância global do circuit breaker
const circuitBreaker = new CircuitBreaker();

// Middleware para verificar circuit breaker
export function circuitBreakerMiddleware(req: Request, res: Response, next: NextFunction): void {
  const key = circuitBreaker.getKey(req);
  
  if (circuitBreaker.isCircuitOpen(key)) {
    const stats = circuitBreaker.getStats(key);
    
    logger.warn('Request blocked by circuit breaker', {
      key,
      stats,
      url: req.originalUrl
    });

    res.status(429).json({
      type: 'https://api.example.com/errors/rate-limit',
      title: 'Muitas requisições com erro',
      status: 429,
      detail: 'Circuit breaker ativo. Muitas requisições com erro detectadas.',
      instance: req.originalUrl,
      retryAfter: Math.ceil((300000 - (Date.now() - (stats?.lastFailureTime || 0))) / 1000),
      stats: {
        failureCount: stats?.failureCount,
        lastError: stats?.lastError
      }
    });
    return;
  }

  next();
}

// Middleware para capturar erros e atualizar circuit breaker
export function circuitBreakerErrorHandler(error: any, req: Request, res: Response, next: NextFunction): void {
  const key = circuitBreaker.getKey(req);
  
  // Registrar falha apenas para erros de validação (422)
  if (res.statusCode === 422 || error.status === 422) {
    circuitBreaker.recordFailure(key, error.message || 'Validation error');
  }

  next(error);
}

// Função para reset manual (útil para debugging)
export function resetCircuitBreaker(key?: string): void {
  circuitBreaker.reset(key);
}

export { circuitBreaker }; 