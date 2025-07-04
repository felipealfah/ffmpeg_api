// Media processing types
export enum MediaType {
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
  TEXT = 'text',
  SUBTITLE = 'subtitle'
}

export enum AssetSource {
  URL = 'url',
  FILE = 'file',
  HTML = 'html'
}

export enum OutputFormat {
  MP4 = 'mp4',
  MOV = 'mov',
  GIF = 'gif',
  HLS = 'hls'
}

export enum JobStatus {
  QUEUED = 'queued',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

export interface AssetConfig {
  src: string;
  type: MediaType;
  source: AssetSource;
}

export interface ImageAsset extends AssetConfig {
  type: MediaType.IMAGE;
}

export interface VideoAsset extends AssetConfig {
  type: MediaType.VIDEO;
}

export interface AudioAsset extends AssetConfig {
  type: MediaType.AUDIO;
}

export interface TextAsset {
  type: MediaType.TEXT;
  text: string;
  style?: {
    fontFamily?: string;
    fontSize?: number;
    fontColor?: string;
    backgroundColor?: string;
    alignment?: 'left' | 'center' | 'right';
  };
}

export interface SubtitleAsset extends AssetConfig {
  type: MediaType.SUBTITLE;
  style?: {
    fontFamily?: string;
    fontSize?: number;
    fontColor?: string;
    outlineColor?: string;
    backgroundColor?: string;
    alignment?: 'left' | 'center' | 'right';
    position?: 'top' | 'center' | 'bottom';
    marginV?: number; // Vertical margin in pixels
    outline?: number; // Outline thickness
    shadow?: number; // Shadow offset
    bold?: boolean;
    italic?: boolean;
  };
}

export interface Clip {
  asset: ImageAsset | VideoAsset | AudioAsset | TextAsset | SubtitleAsset;
  start: number; // Start time in seconds
  length: number; // Duration in seconds
  position?: {
    x: number; // 0-100 percentage of screen width
    y: number; // 0-100 percentage of screen height
    width?: number; // 0-100 percentage of screen width
    height?: number; // 0-100 percentage of screen height
  };
  transition?: {
    in?: string; // Transition effect name
    out?: string; // Transition effect name
    inDuration?: number; // Duration in seconds
    outDuration?: number; // Duration in seconds
  };
  filter?: string[]; // Array of FFmpeg filter strings
  _optimized?: boolean; // Internal flag for optimized sequential clips
}

export interface Track {
  clips: Clip[];
}

export interface Timeline {
  background?: string; // Color in hex format
  tracks: Track[];
  duration?: number; // Total duration in seconds
}

export interface OutputOptions {
  format: OutputFormat;
  resolution: string; // e.g., "1280x720"
  quality?: 'low' | 'medium' | 'high';
  fps?: number;
  bitrate?: string; // e.g., "2000k"
}

export interface RenderRequest {
  timeline: Timeline;
  output: OutputOptions;
  webhook?: string; // URL to call when processing is complete
}

export interface RenderJob {
  id: string;
  status: JobStatus;
  progress?: number;
  request: RenderRequest;
  output?: string;
  storage?: {
    type: 'local' | 'gcs';
    url: string;
    fileName?: string;
    size?: number;
    metadata?: {
      [key: string]: string;
    };
  };
  error?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export interface JobResponse {
  data: {
    jobId: string;
    status: JobStatus;
  };
}

export interface JobStatusResponse {
  data: {
    jobId: string;
    status: JobStatus;
    progress?: number;
    output?: string;
    storage?: {
      type: 'local' | 'gcs';
      url: string;
      fileName?: string;
      size?: number;
    };
    error?: string;
  };
} 