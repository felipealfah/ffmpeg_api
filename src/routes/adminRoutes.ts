import express from 'express';
import * as adminController from '../controllers/adminController';
import { asyncHandler } from '../middleware/asyncHandler';

const router = express.Router();

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

export default router; 