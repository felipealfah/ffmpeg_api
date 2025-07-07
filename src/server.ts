// Carrega dotenv PRIMEIRO antes de qualquer import
require('dotenv').config();

console.log('🔥 ENV no server.ts APÓS dotenv:');
console.log('🔥 PORT:', process.env.PORT);
console.log('🔥 FFMPEG_PATH:', process.env.FFMPEG_PATH);
console.log('🔥 GOOGLE_CLOUD_STORAGE_ENABLED:', process.env.GOOGLE_CLOUD_STORAGE_ENABLED);

// Carregar configuração DEPOIS do dotenv usando require para evitar problemas de cache
console.log('🚀 Carregando config usando require...');
const configModule = require('./config/index');
console.log('🚀 Config module:', configModule);
console.log('🚀 Config module.default:', configModule.default);
const config = configModule.default || configModule;

// DEBUG: Log do objeto config completo
console.log('Config importado em server.ts:', config);

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { json, urlencoded } from 'body-parser';
import mediaRoutes from './routes/mediaRoutes';
import adminRoutes from './routes/adminRoutes';
import path from 'path';
import swagger from './swagger';
import { AppError } from './middleware/errorHandler';
import { initializeStorageService } from './services/storageService';
import { logger } from './utils/logger';
import { metricsMiddleware, metricsHandler } from './middleware/metrics';
// Importar queueService para inicializar o worker
import './services/queueService';

// Inicializar serviço de storage do Google Cloud (se habilitado)
console.log('=== DEBUG CONFIG NO SERVER ===');
console.log('config object:', config);
console.log('config.googleCloud:', config.googleCloud);
console.log('================================');

if (config.googleCloud && config.googleCloud.enabled) {
  try {
    initializeStorageService({
      projectId: config.googleCloud.projectId,
      keyFilename: config.googleCloud.keyFilename,
      bucketName: config.googleCloud.bucketName
    });
    console.log('✅ Google Cloud Storage habilitado', {
      bucketName: config.googleCloud.bucketName,
      projectId: config.googleCloud.projectId
    });
  } catch (error) {
    console.error('❌ Erro ao inicializar Google Cloud Storage', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    console.warn('⚠️  Google Cloud Storage não pôde ser inicializado. Usando armazenamento local.');
  }
} else {
  console.log('Google Cloud Storage desabilitado ou não configurado. Usando armazenamento local.');
}

// Initialize Express app
const app = express();

// Apply middleware
app.use(helmet({
  contentSecurityPolicy: false  // Desabilitar CSP completamente
}));
app.use(cors());
app.use(json({ limit: '50mb' }));
app.use(urlencoded({ extended: true, limit: '50mb' }));

// Metrics middleware (deve vir antes das rotas)
app.use(metricsMiddleware);

// Configura diretório para arquivos estáticos
app.use('/static', express.static(path.join(__dirname, '../public')));

// Configura o Swagger UI
swagger.setup(app);

// DEBUG: Log de todas as requisições
app.use((req, res, next) => {
  console.log(`🌐 SERVER REQUEST DEBUG:`);
  console.log(`  Method: ${req.method}`);
  console.log(`  Path: ${req.path}`);
  console.log(`  Base URL: ${req.baseUrl}`);
  console.log(`  Original URL: ${req.originalUrl}`);
  console.log(`  Route Pattern: ${req.route?.path || 'N/A'}`);
  console.log(`  Matched Route: ${req.route ? 'Yes' : 'No'}`);
  next();
});

// DEBUG: Log específico para rotas admin
app.use('/api/v1/admin', (req, res, next) => {
  console.log(`🔍 ADMIN ROUTE INTERCEPTED:`);
  console.log(`  Full Path: ${req.originalUrl}`);
  console.log(`  Base: /api/v1/admin`);
  console.log(`  Remaining Path: ${req.originalUrl.replace('/api/v1/admin', '')}`);
  next();
});

// Routes
app.use('/api/v1/media', mediaRoutes);
app.use('/api/v1/admin', adminRoutes);

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Metrics endpoint for Prometheus
app.get('/metrics', metricsHandler);

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

// DEBUG: Listar todas as rotas registradas
function listRoutes(app: any) {
  const routes: any[] = [];
  if (!app._router) {
    console.log('⚠️ Router não inicializado ainda');
    return routes;
  }
  
  app._router.stack.forEach((middleware: any) => {
    if (middleware.route) {
      routes.push({
        path: middleware.route.path,
        method: Object.keys(middleware.route.methods)[0].toUpperCase()
      });
    } else if (middleware.name === 'router') {
      middleware.handle.stack.forEach((handler: any) => {
        if (handler.route) {
          const basePath = middleware.regexp.source
            .replace('\\', '')
            .replace('(?:\\/(?=$))?', '')
            .replace('^', '')
            .replace('$', '')
            .replace(/\\\//g, '/');
          routes.push({
            path: basePath + handler.route.path,
            method: Object.keys(handler.route.methods)[0].toUpperCase()
          });
        }
      });
    }
  });
  return routes;
}

// Start server
const PORT = config.port || 3000;
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Documentação da API disponível em http://localhost:${PORT}/api-docs`);
    
    // DEBUG: Listar rotas registradas
    console.log('🚀 ROTAS REGISTRADAS:');
    const routes = listRoutes(app);
    routes.forEach(route => {
      console.log(`  ${route.method} ${route.path}`);
    });
  });
}

export default app; 