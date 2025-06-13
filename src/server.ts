// Carregar configuração primeiro
import config from './config';

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { json, urlencoded } from 'body-parser';
import mediaRoutes from './routes/mediaRoutes';
import path from 'path';
import swagger from './swagger';
import { AppError } from './middleware/errorHandler';

// Initialize Express app
const app = express();

// Apply middleware
app.use(helmet());
app.use(cors());
app.use(json({ limit: '50mb' }));
app.use(urlencoded({ extended: true, limit: '50mb' }));

// Configura diretório para arquivos estáticos
app.use('/static', express.static(path.join(__dirname, '../public')));

// Configura o Swagger UI
swagger.setup(app);

// Routes
app.use('/api/v1/media', mediaRoutes);

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler middleware
app.use((err: Error | AppError, req: Request, res: Response, next: NextFunction) => {
  console.error(`[Error]: ${err}`);
  
  // Default error
  let statusCode = 500;
  let message = 'Internal Server Error';
  let errors: any = undefined;
  
  // AppError handling
  if ((err as any).statusCode) {
    statusCode = (err as AppError).statusCode;
    message = err.message;
  }
  
  // Validation errors
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation Error';
    errors = err.message;
  }
  
  // Send standardized error response
  res.status(statusCode).json({
    type: `https://api.example.com/errors/${statusCode}`,
    title: message,
    status: statusCode,
    detail: errors || message,
    instance: req.originalUrl
  });
});

// Middleware para rotas não encontradas
app.use((req: Request, res: Response) => {
  res.status(404).json({
    type: 'https://api.example.com/errors/404',
    title: 'Not Found',
    status: 404,
    detail: 'O recurso solicitado não foi encontrado',
    instance: req.originalUrl
  });
});

// Start server
const PORT = config.port || 3000;
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Documentação da API disponível em http://localhost:${PORT}/api-docs`);
  });
}

export default app; 