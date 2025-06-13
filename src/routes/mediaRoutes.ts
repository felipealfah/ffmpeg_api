import express from 'express';
import * as mediaController from '../controllers/mediaController';
import { asyncHandler } from '../middleware/asyncHandler';
import { validate } from '../middleware/validation';
import { renderRequestSchema, mediaInfoRequestSchema } from '../validation/schemas';

const router = express.Router();

/**
 * Rotas para renderização de vídeos
 */
router.post('/render', validate(renderRequestSchema), asyncHandler(mediaController.createRenderJob));
router.get('/render/:jobId', asyncHandler(mediaController.getRenderJobStatus));
router.get('/render/:jobId/result', asyncHandler(mediaController.getRenderJobResult));
router.get('/render/:jobId/file', asyncHandler(mediaController.getRenderJobFile));

/**
 * Rota para obter informações de mídia
 */
router.post('/info', validate(mediaInfoRequestSchema), asyncHandler(mediaController.getMediaInfo));

export default router; 