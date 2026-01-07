import pino, { Logger as PinoLogger, LoggerOptions as PinoLoggerOptions } from 'pino';

interface LoggerOptions {
  level?: string;
  format?: 'json' | 'pretty';
  name?: string;
}

function createLogger(options: LoggerOptions = {}): PinoLogger {
  const { level = 'info', format = 'json', name } = options;
  
  const baseOptions: PinoLoggerOptions = {
    level,
    name,
    base: {
      pid: process.pid,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  if (format === 'pretty') {
    return pino({
      ...baseOptions,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
    });
  }
  
  return pino(baseOptions);
}

export const logger = createLogger({
  level: process.env['LOG_LEVEL'] ?? 'info',
  format: (process.env['LOG_FORMAT'] as 'json' | 'pretty') ?? 'json',
  name: 'exchange',
});

export function createServiceLogger(serviceName: string): PinoLogger {
  return logger.child({ service: serviceName });
}

export type { PinoLogger as Logger };
