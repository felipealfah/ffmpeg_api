import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { recordJobStart, recordJobComplete, recordJobFail } from '../middleware/metrics';
import { renderRequestSchema } from '../validation/schemas';
import { RenderJob, JobStatus } from '../types/media';
import { createJob, getJob, updateJob, addRenderJob } from '../services/queueService';

// Importação dinâmica do mediaService
const getMediaService = async () => {
  return await import('../services/mediaService.js');
};

/**
 * Endpoint para renderizar vídeo
 */
export const renderVideo = async (req: Request, res: Response) => {
  let jobId: string | null = null;
  
  try {
    // Validar request
    const { error, value } = renderRequestSchema.validate(req.body);
    if (error) {
      logger.error('Validation error:', error.details);
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details
      });
    }

    // Gerar ID único para o job
    jobId = uuidv4();
    
    // Criar job na queue
    const job = createJob(jobId, value);
    
    // Adicionar job à fila do Redis
    await addRenderJob(job);
    
    // Registrar início do job
    recordJobStart(jobId);
    
    logger.info(`🎬 Job ${jobId} criado e adicionado à fila...`);
    
    // Responder imediatamente com o job ID
    res.json({
      jobId,
      status: 'queued',
      message: 'Job criado com sucesso',
      estimatedTime: '2-5 minutos'
    });
    
  } catch (error) {
    logger.error('Erro ao criar job:', error);
    
    if (jobId) {
      updateJob(jobId, {
        status: JobStatus.FAILED,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        completedAt: new Date()
      });
      recordJobFail(jobId, 0);
    }
    
    res.status(500).json({
      error: 'Erro interno do servidor',
      message: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
};

/**
 * Processa job em background
 */
const processJobInBackground = async (jobId: string, renderRequest: any) => {
  const startTime = Date.now();
  
  try {
    // Atualizar status para processing
    updateJob(jobId, { status: JobStatus.PROCESSING });
    
    // Importar e executar renderização
    const mediaService = await getMediaService();
    
    // Obter informações do job para storage
    const job = getJob(jobId);
    if (!job) {
      throw new Error('Job não encontrado');
    }
    
    const outputPath = await mediaService.renderVideo(
      jobId,
      renderRequest,
      job.storage
    );
    
    // Atualizar job com resultado
    updateJob(jobId, {
      status: JobStatus.COMPLETED,
      output: outputPath,
      completedAt: new Date()
    });
    
    // Registrar conclusão
    const durationMs = Date.now() - startTime;
    recordJobComplete(jobId, durationMs);
    
    logger.info(`✅ Job ${jobId} concluído com sucesso`);
    
  } catch (error) {
    logger.error(`❌ Job ${jobId} falhou:`, error);
    
    // Atualizar job com erro
    updateJob(jobId, {
      status: JobStatus.FAILED,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
      completedAt: new Date()
    });
    
    // Registrar erro
    const durationMs = Date.now() - startTime;
    recordJobFail(jobId, durationMs);
  }
};

/**
 * Endpoint para verificar status do job
 */
export const getJobStatus = async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    
    if (!jobId) {
      return res.status(400).json({
        error: 'Job ID é obrigatório'
      });
    }
    
    const job = getJob(jobId);
    
    if (!job) {
      return res.status(404).json({
        error: 'Job não encontrado'
      });
    }
    
    // Remover dados sensíveis do response
    const sanitizedJob = {
      id: job.id,
      status: job.status,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      output: job.output,
      error: job.error,
      progress: job.progress
    };
    
    res.json(sanitizedJob);
    
  } catch (error) {
    logger.error('Erro ao buscar status do job:', error);
    res.status(500).json({
      error: 'Erro interno do servidor'
    });
  }
};

/**
 * Endpoint para download do vídeo renderizado
 */
export const downloadVideo = async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    
    if (!jobId) {
      return res.status(400).json({
        error: 'Job ID é obrigatório'
      });
    }
    
    const job = getJob(jobId);
    
    if (!job) {
      return res.status(404).json({
        error: 'Job não encontrado'
      });
    }
    
    if (job.status !== JobStatus.COMPLETED) {
      return res.status(400).json({
        error: 'Job ainda não foi concluído',
        status: job.status
      });
    }
    
    if (!job.output) {
      return res.status(404).json({
        error: 'Arquivo de saída não encontrado'
      });
    }
    
    // Importar função de download
    const mediaService = await getMediaService();
    
    // Verificar se downloadFile existe
    if (typeof mediaService.downloadFile === 'function') {
      await mediaService.downloadFile(job.output, res);
    } else {
      // Fallback para download simples
      res.download(job.output);
    }
    
  } catch (error) {
    logger.error('Erro ao fazer download:', error);
    res.status(500).json({
      error: 'Erro interno do servidor'
    });
  }
};

/**
 * Endpoint para validar request sem processar
 */
export const validateRequest = async (req: Request, res: Response) => {
  try {
    const { error, value } = renderRequestSchema.validate(req.body);
    
    if (error) {
      return res.status(400).json({
        valid: false,
        error: 'Validation failed',
        details: error.details
      });
    }
    
    // Importar função de cálculo de duração
    const mediaService = await getMediaService();
    const estimatedDuration = mediaService.calculateTimelineDuration(value.timeline);
    
    res.json({
      valid: true,
      estimatedDuration,
      message: 'Request válido'
    });
    
  } catch (error) {
    logger.error('Erro na validação:', error);
    res.status(500).json({
      error: 'Erro interno do servidor'
    });
  }
}; 