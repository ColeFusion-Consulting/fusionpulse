type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const CURRENT_LEVEL = (process.env.LOG_LEVEL || 'info') as LogLevel;

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[CURRENT_LEVEL];
}

function formatMessage(level: LogLevel, message: string, meta?: Record<string, unknown>): string {
  const entry = {
    t: new Date().toISOString(),
    lvl: level,
    msg: message,
    ...(meta ? { ...meta } : {}),
    pid: process.pid,
  };
  return JSON.stringify(entry);
}

export const logger = {
  debug(message: string, meta?: Record<string, unknown>) {
    if (!shouldLog('debug')) return;
    console.debug(formatMessage('debug', message, meta));
  },

  info(message: string, meta?: Record<string, unknown>) {
    if (!shouldLog('info')) return;
    console.info(formatMessage('info', message, meta));
  },

  warn(message: string, meta?: Record<string, unknown>) {
    if (!shouldLog('warn')) return;
    console.warn(formatMessage('warn', message, meta));
  },

  error(message: string, meta?: Record<string, unknown>) {
    if (!shouldLog('error')) return;
    console.error(formatMessage('error', message, meta));
  },
};
