import type { PetIntent, RawSignal, Rule } from '@shared/types';

const IDLE_AFTER_MS = 30 * 1_000;

let lastPresence: number | null = null;
let lastFiredAt = 0;

// We deliberately ignore ai-agent and network — the user could be afk while
// background processes are noisy.
const USER_PRESENCE_SOURCES = new Set(['keyboard', 'frontmost']);

export const idleRule: Rule = {
  id: 'idle',
  subscribes: ['keyboard', 'frontmost'],
  evaluate(window: readonly RawSignal[], now: number): PetIntent | null {
    for (const s of window) {
      if (!USER_PRESENCE_SOURCES.has(s.source)) continue;
      if (lastPresence === null || s.timestamp > lastPresence) {
        lastPresence = s.timestamp;
      }
    }
    if (lastPresence === null) return null; // haven't observed a presence signal yet
    if (now - lastPresence < IDLE_AFTER_MS) return null;
    if (now - lastFiredAt < IDLE_AFTER_MS) return null; // don't spam
    lastFiredAt = now;
    return { kind: 'idle-too-long' };
  },
};

export function _resetIdleRule(): void {
  lastPresence = null;
  lastFiredAt = 0;
}
