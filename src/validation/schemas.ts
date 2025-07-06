import Joi from 'joi';
import { MediaType, AssetSource, OutputFormat } from '../types/media';

// Regex para validar cores hexadecimais
const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;

// Schema para validar posições de elementos na timeline
const positionSchema = Joi.object({
  x: Joi.number().required().min(0).max(100).description('Posição X em porcentagem da largura da tela'),
  y: Joi.number().required().min(0).max(100).description('Posição Y em porcentagem da altura da tela'),
  width: Joi.number().optional().min(0).max(100).description('Largura em porcentagem da largura da tela'),
  height: Joi.number().optional().min(0).max(100).description('Altura em porcentagem da altura da tela')
});

// Schema para validar transições
const transitionSchema = Joi.object({
  in: Joi.string().optional().description('Efeito de transição de entrada'),
  out: Joi.string().optional().description('Efeito de transição de saída'),
  inDuration: Joi.number().optional().min(0).description('Duração da transição de entrada em segundos'),
  outDuration: Joi.number().optional().min(0).description('Duração da transição de saída em segundos')
});

// Schema para validar estilos de texto
const textStyleSchema = Joi.object({
  fontFamily: Joi.string().optional().default('Arial').description('Família da fonte'),
  fontSize: Joi.number().optional().default(24).description('Tamanho da fonte'),
  fontColor: Joi.string().optional().default('white').description('Cor da fonte'),
  backgroundColor: Joi.string().optional().description('Cor de fundo'),
  alignment: Joi.string().optional().valid('left', 'center', 'right').default('center').description('Alinhamento do texto')
});

// Schema para validar estilos de legendas
const subtitleStyleSchema = Joi.object({
  fontFamily: Joi.string().optional().default('DejaVu Serif').description('Família da fonte'),
  fontSize: Joi.number().optional().default(42).min(8).max(200).description('Tamanho da fonte'),
  fontColor: Joi.string().pattern(HEX_COLOR_REGEX).optional().default('#FFFFFF').description('Cor da fonte em formato hexadecimal'),
  outlineColor: Joi.string().pattern(HEX_COLOR_REGEX).optional().default('#000000').description('Cor do contorno em formato hexadecimal'),
  backgroundColor: Joi.string().pattern(HEX_COLOR_REGEX).optional().description('Cor de fundo em formato hexadecimal'),
  alignment: Joi.string().optional().valid('left', 'center', 'right').default('center').description('Alinhamento horizontal do texto'),
  position: Joi.string().optional().valid('top', 'center', 'bottom').default('bottom').description('Posição vertical das legendas'),
  marginV: Joi.number().optional().default(100).min(0).max(500).description('Margem vertical em pixels'),
  outline: Joi.number().optional().default(3).min(0).max(10).description('Espessura do contorno'),
  shadow: Joi.number().optional().default(1).min(0).max(10).description('Intensidade da sombra'),
  bold: Joi.boolean().optional().default(true).description('Texto em negrito'),
  italic: Joi.boolean().optional().default(false).description('Texto em itálico')
}).unknown(false);

// Schema para validar assets (imagens, vídeos, áudios, legendas)
const assetSchema = Joi.object({
  type: Joi.string().required().valid(...Object.values(MediaType)).description('Tipo de mídia'),
  source: Joi.string().when('type', {
    is: MediaType.TEXT,
    then: Joi.forbidden(),
    otherwise: Joi.string().required().valid(...Object.values(AssetSource))
  }).description('Fonte do asset'),
  src: Joi.string().when('type', {
    is: MediaType.TEXT,
    then: Joi.forbidden(),
    otherwise: Joi.string().required()
  }).description('URL ou caminho do arquivo'),
  text: Joi.string().when('type', {
    is: MediaType.TEXT,
    then: Joi.string().required(),
    otherwise: Joi.forbidden()
  }).description('Texto para renderizar'),
  style: Joi.alternatives().conditional('type', {
    switch: [
      { is: MediaType.TEXT, then: textStyleSchema.optional() },
      { is: MediaType.SUBTITLE, then: subtitleStyleSchema.optional() }
    ],
    otherwise: Joi.forbidden()
  }).description('Estilo do texto ou legenda')
});

// Schema para validar um clipe
const clipSchema = Joi.object({
  asset: assetSchema.required().description('Asset a ser usado no clipe'),
  start: Joi.number().required().min(0).description('Tempo de início em segundos'),
  length: Joi.alternatives().try(
    Joi.number().min(0).description('Duração em segundos'),
    Joi.string().valid('auto').description('Usa toda a duração disponível do vídeo')
  ).required().description('Duração em segundos ou "auto" para usar toda a duração disponível'),
  position: positionSchema.optional().description('Posição e tamanho do clipe'),
  transition: transitionSchema.optional().description('Transições de entrada e saída'),
  filter: Joi.array().items(Joi.string()).optional().description('Filtros FFmpeg a serem aplicados')
});

// Schema para validar uma trilha
const trackSchema = Joi.object({
  clips: Joi.array().items(clipSchema).min(1).required().description('Clipes na trilha')
});

// Schema para validar a timeline
const timelineSchema = Joi.object({
  background: Joi.string().optional().description('Cor de fundo no formato hexadecimal'),
  tracks: Joi.array().items(trackSchema).min(1).required().description('Trilhas da timeline'),
  duration: Joi.number().optional().min(0).description('Duração total em segundos')
});

// Schema para validar opções de saída
const outputOptionsSchema = Joi.object({
  format: Joi.string().valid(...Object.values(OutputFormat)).required().description('Formato do arquivo de saída'),
  width: Joi.number().integer().min(1).max(7680).optional().default(1280).description('Largura do vídeo em pixels'),
  height: Joi.number().integer().min(1).max(4320).optional().default(720).description('Altura do vídeo em pixels'),
  quality: Joi.string().valid('low', 'medium', 'high').optional().default('medium').description('Qualidade da codificação'),
  fps: Joi.number().integer().min(1).max(120).optional().default(30).description('Frames por segundo'),
  bitrate: Joi.string().optional().description('Bitrate do vídeo (ex: "2000k")')
});

// Schema para validar a requisição de renderização
export const renderRequestSchema = Joi.object({
  timeline: timelineSchema.required().description('Timeline para renderização'),
  output: outputOptionsSchema.required().description('Opções de saída'),
  webhook: Joi.string().uri().optional().description('URL para callback quando o processamento for concluído')
}).required();

// Schema para validar a requisição de informação de mídia
export const mediaInfoRequestSchema = Joi.object({
  url: Joi.string().uri().required().description('URL da mídia para analisar')
}).required();

// Função para validar requisição de renderização
export const validateRenderRequest = (data: any) => {
  return renderRequestSchema.validate(data, { abortEarly: false });
}; 