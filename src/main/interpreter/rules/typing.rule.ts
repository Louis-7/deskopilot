import type { PetIntent, RawSignal, Rule } from '@shared/types';

const WINDOW_MS = 2_000;
const LIGHT_THRESHOLD = 3; // keysPerSec
const HEAVY_THRESHOLD = 8;

export const typingRule: Rule = {
  id: 'typing',
  subscribes: ['keyboard'],
  evaluate(window: readonly RawSignal[], now: number): PetIntent | null {
    const recent = window.filter(
      (s) => s.source === 'keyboard' && now - s.timestamp <= WINDOW_MS,
    );
    if (recent.length === 0) return null;

    const total = recent.reduce((sum, s) => {
      const v = s.payload['keysPerSec'];
      return sum + (typeof v === 'number' ? v : 0);
    }, 0);
    const avg = total / recent.length;
    if (avg < LIGHT_THRESHOLD) return null;
    return { kind: 'user-typing', intensity: avg >= HEAVY_THRESHOLD ? 'heavy' : 'light' };
  },
};
