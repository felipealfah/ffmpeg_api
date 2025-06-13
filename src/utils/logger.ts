import config from '../config';

// Simple logger with different log levels
class Logger {
  private logLevel: string;
  
  constructor() {
    // Set log level based on env
    this.logLevel = config.nodeEnv === 'production' ? 'info' : 'debug';
  }
  
  private getTimestamp(): string {
    return new Date().toISOString();
  }
  
  private formatMessage(level: string, message: string, meta?: any): string {
    const timestamp = this.getTimestamp();
    const metaString = meta ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaString}`;
  }
  
  debug(message: string, meta?: any): void {
    if (['debug', 'trace'].includes(this.logLevel)) {
      console.debug(this.formatMessage('debug', message, meta));
    }
  }
  
  info(message: string, meta?: any): void {
    if (['debug', 'info', 'trace'].includes(this.logLevel)) {
      console.info(this.formatMessage('info', message, meta));
    }
  }
  
  warn(message: string, meta?: any): void {
    console.warn(this.formatMessage('warn', message, meta));
  }
  
  error(message: string, meta?: any): void {
    console.error(this.formatMessage('error', message, meta));
  }
}

// Export singleton instance
const logger = new Logger();
export default logger; 