import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': resolve(__dirname, 'src/shared') },
    },
    build: {
      rollupOptions: { input: resolve(__dirname, 'src/main/index.ts') },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': resolve(__dirname, 'src/shared') },
    },
    build: {
      rollupOptions: { input: resolve(__dirname, 'src/preload/index.ts') },
    },
  },
  renderer: {
    resolve: {
      alias: { '@shared': resolve(__dirname, 'src/shared') },
    },
    build: {
      rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') },
    },
  },
});
