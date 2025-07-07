import express from 'express';
import * as adminController from '../controllers/adminController';
import { asyncHandler } from '../middleware/asyncHandler';

const router = express.Router();

// DEBUG: Log de todas as requisições para rotas admin
router.use((req, res, next) => {
  console.log(`🔍 ADMIN ROUTE DEBUG:`);
  console.log(`  Method: ${req.method}`);
  console.log(`  Path: ${req.path}`);
  console.log(`  Base URL: ${req.baseUrl}`);
  console.log(`  Original URL: ${req.originalUrl}`);
  console.log(`  Route Pattern: ${req.route?.path || 'N/A'}`);
  next();
});

/**
 * Rotas administrativas para circuit breaker
 */
router.get('/circuit-breaker/status', asyncHandler(adminController.getCircuitBreakerStatus));
router.post('/circuit-breaker/reset', asyncHandler(adminController.resetCircuitBreakerEndpoint));
router.post('/emergency-stop', asyncHandler(adminController.emergencyStop));

/**
 * Rotas administrativas para limpeza e estatísticas
 */
router.post('/cleanup', asyncHandler(adminController.manualCleanup));
router.get('/storage/stats', asyncHandler(adminController.getStorageStats));

/**
 * Rotas administrativas para controle de concorrência
 */
router.get('/concurrency/status', asyncHandler(adminController.getConcurrencyStatus));
router.post('/concurrency/force-cleanup', asyncHandler(adminController.forceCleanupConcurrency));

/**
 * Rotas administrativas para fila
 */
// TESTE SIMPLES - rota básica para verificar se o problema é do Express
router.get('/queue/test', (req, res) => {
  console.log('🧪 TESTE: /queue/test foi chamada!');
  res.json({ message: 'TESTE: Rota funcionando!', timestamp: new Date().toISOString() });
});

// Rota para status da fila com middleware de debug adicional
router.get('/queue/status', (req, res, next) => {
  console.log('🔍 DEBUG /queue/status:');
  console.log('  Headers:', req.headers);
  console.log('  Query:', req.query);
  console.log('  Params:', req.params);
  console.log('  Base URL:', req.baseUrl);
  console.log('  Original URL:', req.originalUrl);
  console.log('  Path:', req.path);
  next();
}, asyncHandler(adminController.getQueueStatus));

// Rota alternativa para teste
router.get('/queue-status', asyncHandler(adminController.getQueueStatus));

export default router; 