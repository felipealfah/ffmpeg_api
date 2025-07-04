import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import * as mediaController from '../controllers/mediaController';

const router = Router();

// Render video (create job)
router.post('/render', asyncHandler(mediaController.renderVideo));

// Get job status
router.get('/job/:jobId/status', asyncHandler(mediaController.getJobStatus));

// Download rendered video
router.get('/job/:jobId/download', asyncHandler(mediaController.downloadVideo));

// Validate render request
router.post('/validate', asyncHandler(mediaController.validateRequest));

export default router; 