// Media processing types
export enum MediaType {
  VIDEO = 'video',
  AUDIO = 'audio',
  IMAGE = 'image',
  TEXT = 'text',
  SUBTITLE = 'subtitle'
}

export enum AssetSource {
  URL = 'url',
  LOCAL = 'local'
}

export enum JobStatus {
  QUEUED = 'queued',
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

export enum OutputFormat {
  MP4 = 'mp4',
  GIF = 'gif',
  MOV = 'mov',
  WEBM = 'webm',
  HLS = 'hls'
}

// Interface base para todos os assets
interface BaseAsset {
  type: MediaType;
  source: AssetSource;
  src: string;
}

// Asset específico para áudio com propriedades adicionais
export interface AudioAsset extends BaseAsset {
  type: MediaType.AUDIO;
  isBackground?: boolean; // Indica se é um áudio de fundo
  volume?: number; // Volume opcional (0.0 a 1.0)
}

// Asset específico para vídeo
export interface VideoAsset extends BaseAsset {
  type: MediaType.VIDEO;
}

// Asset específico para imagem
export interface ImageAsset extends BaseAsset {
  type: MediaType.IMAGE;
}

// Asset para texto
export interface TextAsset {
  type: MediaType.TEXT;
  text: string;
  style?: TextStyle;
}

// Asset para legendas
export interface SubtitleAsset extends BaseAsset {
  type: MediaType.SUBTITLE;
  style?: SubtitleStyle;
}

// Tipo união para todos os tipos de assets
export type Asset = VideoAsset | AudioAsset | ImageAsset | TextAsset | SubtitleAsset;

// Interfaces auxiliares
export interface TextStyle {
  fontSize?: number;
  fontColor?: string;
  fontFamily?: string;
  bold?: boolean;
  italic?: boolean;
  alignment?: 'left' | 'center' | 'right';
}

export interface SubtitleStyle {
  fontSize?: number;
  fontColor?: string;
  outlineColor?: string;
  bold?: boolean;
  alignment?: 'left' | 'center' | 'right';
  position?: 'top' | 'bottom';
  marginV?: number;
  outline?: number;
  shadow?: number;
}

export interface Clip {
  asset: Asset;
  start: number;
  length: number | "auto";
  _optimized?: boolean;
  _inputIndex?: number;
}

export interface Track {
  clips: Clip[];
}

export interface Timeline {
  tracks: Track[];
  duration?: number;
}

export interface RenderOutput {
  format: OutputFormat;
  resolution?: string;
  quality?: 'low' | 'medium' | 'high';
  fps?: number;
  bitrate?: string;
}

export interface InputConfig {
  url: string;
  type?: MediaType;
}

export interface RenderRequest {
  input: InputConfig;
  timeline: Timeline;
  output: RenderOutput;
  webhook?: string;
}

export interface StorageInfo {
  type: 'gcs' | 'local';
  tempDir: string;
  outputDir: string;
  url?: string;
  fileName?: string;
}

export interface RenderJob {
  id: string;
  status: JobStatus;
  request: RenderRequest;
  error?: string;
  progress?: number;
  output?: string;
  storage?: StorageInfo;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
} 