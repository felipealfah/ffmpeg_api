import express from 'express';
import * as mediaController from '../controllers/mediaController';
import { asyncHandler } from '../middleware/asyncHandler';
import { validate } from '../middleware/validation';
import { renderRequestSchema, mediaInfoRequestSchema } from '../validation/schemas';
import { circuitBreakerMiddleware } from '../middleware/circuitBreaker';

const router = express.Router();

/**
 * Rota para validar requisição de renderização (sem processar)
 */
router.post('/render/validate', circuitBreakerMiddleware, validate(renderRequestSchema), asyncHandler(mediaController.validateRenderRequest));

/**
 * Rotas para renderização de vídeos
 */
router.post('/render', circuitBreakerMiddleware, validate(renderRequestSchema), asyncHandler(mediaController.createRenderJob));
router.get('/render/:jobId', asyncHandler(mediaController.getRenderJobStatus));
router.get('/render/:jobId/result', asyncHandler(mediaController.getRenderJobResult));
router.get('/render/:jobId/file', asyncHandler(mediaController.getRenderJobFile));

/**
 * Rota para obter informações de mídia
 */
router.post('/info', validate(mediaInfoRequestSchema), asyncHandler(mediaController.getMediaInfo));

export default router; 