import type { BrowserWindow } from 'electron';
import { IPC } from '@shared/types';
import { Interpreter } from './interpreter/interpreter';
import { ALL_RULES } from './interpreter/rules';
import { getEventSources } from './platform/registry';

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

  const interpreter = new Interpreter({
    rules: ALL_RULES,
    onIntent: (intent) => {
      if (paused || win.isDestroyed()) return;
      win.webContents.send(IPC.IntentToRenderer, intent);
    },
  });

  const sources = getEventSources();
  await Promise.all(
    sources.map((src) =>
      src
        .start((signal) => interpreter.ingest(signal))
        .catch((err) => {
          console.error(`[source ${src.id}] failed to start:`, err);
        }),
    ),
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
