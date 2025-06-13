import { Request, Response, NextFunction } from 'express';

/**
 * Wrapper para funções assíncronas em middlewares e controllers do Express
 * Captura exceções e as passa para o next() automaticamente
 */
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return function(req: Request, res: Response, next: NextFunction): void {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
} 