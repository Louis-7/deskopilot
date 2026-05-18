import type { EventSource } from '../source';
import type { RawSignal } from '@shared/types';

/**
 * Dev-time stand-in for the real keyboard source. Emits a synthetic keyboard
 * signal every second so the pet shows a `greet` reaction without needing
 * macOS Input Monitoring permission. Cycles intensity so the demo is visible.
 */
export class MockKeyboardSource implements EventSource {
  readonly id = 'keyboard';
  readonly supportedPlatforms = ['macos', 'windows', 'linux'] as const;

  private timer: NodeJS.Timeout | null = null;
  private tick = 0;

  async start(emit: (signal: RawSignal) => void): Promise<void> {
    this.timer = setInterval(() => {
      // Pulse: 5s active, 5s quiet — so the pet visibly returns to idle in between.
      this.tick = (this.tick + 1) % 10;
      const active = this.tick < 5;
      const keysPerSec = active ? 4 + Math.random() * 3 : 0;
      emit({
        source: 'keyboard',
        timestamp: Date.now(),
        payload: { keysPerSec, sampledOver: 1_000 },
      });
    }, 1_000);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
