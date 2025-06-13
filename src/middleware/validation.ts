import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { AppError } from './errorHandler';
import logger from '../utils/logger';

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

      logger.warn('Erro de validação na requisição', { 
        path: req.originalUrl,
        errors: errorDetails 
      });

      // Formatando o erro como RFC 7807 Problem Details
      const errorResponse = {
        type: 'https://api.example.com/errors/validation',
        title: 'Erro de Validação',
        status: 422,
        detail: 'A requisição contém erros de validação',
        instance: req.originalUrl,
        errors: errorDetails
      };

      res.status(422).json(errorResponse);
      return;
    }

    // Substituir o body com os dados validados e sem campos adicionais
    req.body = value;
    next();
  };
} 