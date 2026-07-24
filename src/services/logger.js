let useWinston = false;
try {
  require.resolve('winston');
  useWinston = true;
} catch {}
const { createLogger, format, transports } = useWinston ? require('winston') : {};

let winstonLogger;
if (useWinston && createLogger) {
  winstonLogger = createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: format.combine(
      format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
      format.errors({ stack: true }),
      format.json()
    ),
    defaultMeta: { service: 'labcoop-backend' },
    transports: [
      new transports.Console({
        format: process.env.NODE_ENV === 'production'
          ? format.json()
          : format.combine(format.colorize(), format.printf(({ timestamp, level, message, ...meta }) => {
              const metaStr = Object.keys(meta).length > 1 ? ' ' + JSON.stringify(meta) : '';
              return `${timestamp} [${level}]: ${message}${metaStr}`;
            })),
      }),
    ],
  });
}

const levels = { error: 0, warn: 1, info: 2, debug: 3 };

function log(level, message, meta = {}) {
  if (levels[level] === undefined) level = 'info';
  if (useWinston && winstonLogger) {
    winstonLogger.log(level, message, meta);
    return;
  }
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [${level.toUpperCase()}]`;
  const suffix = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
  if (level === 'error') {
    console.error(`${prefix} ${message}${suffix}`);
  } else if (level === 'warn') {
    console.warn(`${prefix} ${message}${suffix}`);
  } else {
    console.log(`${prefix} ${message}${suffix}`);
  }
}

module.exports = {
  error: (msg, meta) => log('error', msg, meta),
  warn: (msg, meta) => log('warn', msg, meta),
  info: (msg, meta) => log('info', msg, meta),
  debug: (msg, meta) => log('debug', msg, meta),
};
