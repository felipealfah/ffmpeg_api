// Simple logger functions
const getTimestamp = (): string => {
  return new Date().toISOString();
};

const formatMessage = (level: string, message: string, meta?: any): string => {
  const timestamp = getTimestamp();
  const metaString = meta ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaString}`;
};

const logLevel = process.env.NODE_ENV === 'production' ? 'info' : 'debug';

// Logger principal
const logger = {
  debug: (message: string, meta?: any): void => {
    if (['debug', 'trace'].includes(logLevel)) {
      console.debug(formatMessage('debug', message, meta));
    }
  },
  
  info: (message: string, meta?: any): void => {
    if (['debug', 'info', 'trace'].includes(logLevel)) {
      console.info(formatMessage('info', message, meta));
    }
  },
  
  warn: (message: string, meta?: any): void => {
    console.warn(formatMessage('warn', message, meta));
  },
  
  error: (message: string, meta?: any): void => {
    console.error(formatMessage('error', message, meta));
  }
};

console.log('🔧 Logger inicializado com sucesso');

export { logger };
export default logger; 