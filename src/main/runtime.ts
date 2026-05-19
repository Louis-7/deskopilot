import { ipcMain, type BrowserWindow } from 'electron';
import { IPC, type PetState } from '@shared/types';
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

  // Renderer notifies us every time its state machine actually transitions.
  // We clear the interpreter's dedup memory so intents the reducer had to
  // ignore (e.g. ai-working emitted while typing was NON_INTERRUPTIBLE) don't
  // suppress the next legitimate emit of the same kind.
  const onStateChange = (_evt: unknown, next: PetState, prev: PetState): void => {
    intentLog.debug(`state-change ${prev} -> ${next}, clearing dedup`);
    interpreter.clearDedup();
  };
  ipcMain.on(IPC.StateChange, onStateChange);

  return {
    async stop() {
      ipcMain.off(IPC.StateChange, onStateChange);
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
