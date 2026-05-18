import type { PetIntent, RawSignal, Rule } from '@shared/types';

const WINDOW_MS = 1_500;
const BURST_KBPS = 5_000; // ~5 MB/s combined in+out

export const networkRule: Rule = {
  id: 'network',
  subscribes: ['network'],
  evaluate(window: readonly RawSignal[], now: number): PetIntent | null {
    const recent = window.filter(
      (s) => s.source === 'network' && now - s.timestamp <= WINDOW_MS,
    );
    for (const s of recent) {
      const inKbps = typeof s.payload['kbpsIn'] === 'number' ? s.payload['kbpsIn'] : 0;
      const outKbps = typeof s.payload['kbpsOut'] === 'number' ? s.payload['kbpsOut'] : 0;
      if (inKbps + outKbps >= BURST_KBPS) {
        return { kind: 'network-burst' };
      }
    }
    return null;
  },
};
