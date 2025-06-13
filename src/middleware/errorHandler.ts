import { Request, Response, NextFunction } from 'express';

// Custom error class for application errors
export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;
  
  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

// Main error handler middleware
export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  console.error(`[Error]: ${err}`);
  
  // Default error
  let statusCode = 500;
  let message = 'Internal Server Error';
  let errors: any = undefined;
  
  // AppError handling
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
  }
  
  // Validation errors
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation Error';
    errors = err.message; // This could be further structured based on your validation library
  }
  
  // Send standardized error response
  res.status(statusCode).json({
    type: `https://api.example.com/errors/${statusCode}`,
    title: message,
    status: statusCode,
    detail: errors || message,
    instance: req.originalUrl
  });
}; 