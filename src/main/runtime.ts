import type { BrowserWindow } from 'electron';
import { IPC } from '@shared/types';
import { Interpreter } from './interpreter/interpreter';
import { ALL_RULES } from './interpreter/rules';
import { getEventSources } from './platform/registry';
import { getLogger } from './logger';

export interface PipelineHandle {
  stop(): Promise<void>;
  setPaused(paused: boolean): void;
  isPaused(): boolean;
}

/**
 * Boots layers 1 and 2: starts platform event sources, feeds them into the
 * interpreter, and forwards every emitted PetIntent to the renderer via IPC.
 *
 * Pausing keeps event sources alive (so we don't re-trigger permission prompts
 * on resume) but suppresses IPC delivery to the renderer.
 */
export async function startEventPipeline(win: BrowserWindow): Promise<PipelineHandle> {
  let paused = false;
  const intentLog = getLogger('interpreter');

  const interpreter = new Interpreter({
    rules: ALL_RULES,
    onIntent: (intent) => {
      intentLog.debug('intent:', intent);
      if (paused || win.isDestroyed()) return;
      win.webContents.send(IPC.IntentToRenderer, intent);
    },
  });

  const sources = getEventSources();
  await Promise.all(
    sources.map((src) => {
      const sourceLog = getLogger(`source:${src.id}`);
      return src
        .start((signal) => {
          sourceLog.debug('signal:', signal.payload);
          interpreter.ingest(signal);
        })
        .catch((err) => {
          sourceLog.error('failed to start:', err);
        });
    }),
  );

  interpreter.start();

  return {
    async stop() {
      interpreter.stop();
      await Promise.all(sources.map((s) => s.stop().catch(() => {})));
    },
    setPaused(next) {
      paused = next;
    },
    isPaused() {
      return paused;
    },
  };
}
