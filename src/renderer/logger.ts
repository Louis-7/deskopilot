import log from 'electron-log/renderer';

export interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export function getLogger(namespace: string): Logger {
  return log.scope(namespace);
}
