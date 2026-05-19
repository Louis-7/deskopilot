import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      // electron-log/renderer assumes an Electron renderer environment and
      // hangs vitest's node worker. Tests stub it with a no-op logger.
      'electron-log/renderer': resolve(__dirname, 'test/stubs/electron-log-renderer.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
