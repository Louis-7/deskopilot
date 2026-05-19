// Test-only stub for `electron-log/renderer`. The real module assumes it runs
// inside an Electron renderer process and hangs vitest's node worker (it ships
// an IPC transport that touches `window.__electronLog`). Tests don't care
// about log output, so we hand back a no-op logger with a `scope()` that
// returns the same shape.

type NoopLogger = {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  scope: (ns: string) => NoopLogger;
};

const noop = (): void => {};

const logger: NoopLogger = {
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
  scope: () => logger,
};

export default logger;
