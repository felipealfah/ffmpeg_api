import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { AppError } from './errorHandler';
import { logger } from '../utils/logger';
import { circuitBreaker } from './circuitBreaker';

// Middleware de validação que recebe um schema do Joi
export function validate(schema: Joi.ObjectSchema) {
  return function(req: Request, res: Response, next: NextFunction): void {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,  // Para retornar todos os erros de uma vez
      stripUnknown: true  // Remove campos desconhecidos
    });

    if (error) {
      const errorDetails = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        type: detail.type
      }));

      // Log do erro de validação
      logger.warn('Erro de validação detectado', {
        url: req.originalUrl,
        errors: errorDetails,
        body: req.body
      });

      // Registrar falha no circuit breaker
      const key = circuitBreaker.getKey(req);
      const errorMessage = errorDetails.map(e => `${e.field}: ${e.message}`).join('; ');
      circuitBreaker.recordFailure(key, errorMessage);

      // Formatando o erro como RFC 7807 Problem Details
      const errorResponse = {
        type: 'https://api.example.com/errors/validation',
        title: 'Erro de Validação',
        status: 422,
        detail: 'A requisição contém erros de validação',
        instance: req.originalUrl,
        errors: errorDetails
      };

      // Headers para indicar que não deve ser feito retry
      res.set({
        'X-No-Retry': 'true',
        'X-Final-Error': 'true',
        'Retry-After': '86400' // 24 horas - indica que não deve tentar novamente
      });

      res.status(422).json(errorResponse);
      return;
    }

    // Substituir o body com os dados validados e sem campos adicionais
    req.body = value;
    next();
  };
} 