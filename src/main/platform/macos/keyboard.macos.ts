import { GlobalKeyboardListener } from 'node-global-key-listener';
import type { EventSource } from '../source';
import type { RawSignal } from '@shared/types';

/**
 * Counts global keystrokes per second. Does NOT record key contents.
 *
 * macOS permission: the first time this starts, the system will prompt to
 * grant Input Monitoring permission. Until granted, GlobalKeyboardListener
 * silently produces no events. We surface this as keysPerSec=0 — the typing
 * rule will simply never fire, but no crash.
 */
export class KeyboardSourceMacOS implements EventSource {
  readonly id = 'keyboard';
  readonly supportedPlatforms = ['macos'] as const;

  private listener: GlobalKeyboardListener | null = null;
  private timer: NodeJS.Timeout | null = null;
  private counter = 0;

  async start(emit: (signal: RawSignal) => void): Promise<void> {
    this.listener = new GlobalKeyboardListener();
    this.listener.addListener((e) => {
      if (e.state === 'DOWN') this.counter += 1;
    });

    this.timer = setInterval(() => {
      const keysPerSec = this.counter;
      this.counter = 0;
      // Skip empty buckets — the typing rule infers "stopped typing" from the
      // absence of recent signals (signals age out of its 2s window). Emitting
      // zero-keys signals every 500ms while idle just floods the log without
      // changing rule behavior.
      if (keysPerSec === 0) return;
      emit({
        source: this.id,
        timestamp: Date.now(),
        payload: { keysPerSec, sampledOver: 500 },
      });
    }, 500);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.listener) this.listener.kill();
    this.listener = null;
  }
}
