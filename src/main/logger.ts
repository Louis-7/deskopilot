import log from 'electron-log/main';

export interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

const VALID_LEVELS = new Set(['silly', 'debug', 'verbose', 'info', 'warn', 'error']);

function resolveLevel(): 'silly' | 'debug' | 'verbose' | 'info' | 'warn' | 'error' {
  const env = process.env['DESKOPILOT_LOG_LEVEL'];
  if (env && VALID_LEVELS.has(env)) return env as 'info';
  return 'info';
}

log.initialize();
log.transports.file.level = false;
log.transports.console.level = resolveLevel();
log.transports.console.format = '[{h}:{i}:{s}.{ms}] [{level}] [{scope}] {text}';

export function getLogger(namespace: string): Logger {
  return log.scope(namespace);
}
