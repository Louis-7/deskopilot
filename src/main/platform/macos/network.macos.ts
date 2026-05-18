import si from 'systeminformation';
import type { EventSource } from '../source';
import type { RawSignal } from '@shared/types';

const POLL_MS = 1_000;

/**
 * Samples per-second network throughput across all interfaces. No special
 * macOS permission required. systeminformation.networkStats() returns
 * bytes-per-second deltas based on the time since the last call.
 */
export class NetworkSourceMacOS implements EventSource {
  readonly id = 'network';
  readonly supportedPlatforms = ['macos'] as const;

  private timer: NodeJS.Timeout | null = null;

  async start(emit: (signal: RawSignal) => void): Promise<void> {
    // Warm up so the next call has meaningful deltas
    await si.networkStats().catch(() => {});

    const poll = async () => {
      try {
        const stats = await si.networkStats();
        let bytesInSec = 0;
        let bytesOutSec = 0;
        for (const iface of stats) {
          bytesInSec += iface.rx_sec ?? 0;
          bytesOutSec += iface.tx_sec ?? 0;
        }
        const kbpsIn = (bytesInSec * 8) / 1_000;
        const kbpsOut = (bytesOutSec * 8) / 1_000;
        emit({
          source: this.id,
          timestamp: Date.now(),
          payload: { kbpsIn, kbpsOut },
        });
      } catch (err) {
        console.warn('[network] poll failed:', (err as Error).message);
      }
    };
    this.timer = setInterval(poll, POLL_MS);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
