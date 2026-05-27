import { uIOhook } from 'uiohook-napi';
import type { EventSource } from '../source';
import type { RawSignal } from '@shared/types';

export class KeyboardSourceMacOS implements EventSource {
  readonly id = 'keyboard';
  readonly supportedPlatforms = ['macos'] as const;

  private timer: NodeJS.Timeout | null = null;
  private counter = 0;
  private started = false;

  async start(emit: (signal: RawSignal) => void): Promise<void> {
    uIOhook.on('keydown', () => {
      this.counter += 1;
    });
    uIOhook.start();
    this.started = true;

    this.timer = setInterval(() => {
      const keysPerSec = this.counter;
      this.counter = 0;
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
    if (this.started) {
      uIOhook.stop();
      this.started = false;
    }
  }
}
