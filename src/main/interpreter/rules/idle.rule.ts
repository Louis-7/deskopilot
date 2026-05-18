import type { PetIntent, RawSignal, Rule } from '@shared/types';

const IDLE_AFTER_MS = 5 * 60 * 1_000; // 5 minutes

let lastFiredAt = 0;

// Counts as "user is here": keyboard, mouse (if we add it later), or app switch.
// We deliberately ignore ai-agent and network — the user could be afk while
// background processes are noisy.
const USER_PRESENCE_SOURCES = new Set(['keyboard', 'frontmost']);

export const idleRule: Rule = {
  id: 'idle',
  subscribes: ['keyboard', 'frontmost'],
  evaluate(window: readonly RawSignal[], now: number): PetIntent | null {
    let lastPresence: number | null = null;
    for (const s of window) {
      if (!USER_PRESENCE_SOURCES.has(s.source)) continue;
      if (lastPresence === null || s.timestamp > lastPresence) {
        lastPresence = s.timestamp;
      }
    }
    if (lastPresence === null) return null; // not enough data yet

    const sinceLast = now - lastPresence;
    if (sinceLast < IDLE_AFTER_MS) return null;
    if (now - lastFiredAt < IDLE_AFTER_MS) return null; // don't spam
    lastFiredAt = now;
    return { kind: 'idle-too-long' };
  },
};

export function _resetIdleRule(): void {
  lastFiredAt = 0;
}
