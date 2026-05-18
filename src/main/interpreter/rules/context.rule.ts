import type { PetIntent, RawSignal, Rule } from '@shared/types';

let lastBundleId: string | null = null;

export const contextRule: Rule = {
  id: 'context',
  subscribes: ['frontmost'],
  evaluate(window: readonly RawSignal[]): PetIntent | null {
    // Take the newest frontmost sample
    let newest: RawSignal | null = null;
    for (const s of window) {
      if (s.source !== 'frontmost') continue;
      if (!newest || s.timestamp > newest.timestamp) newest = s;
    }
    if (!newest) return null;
    const bundleId = newest.payload['bundleId'];
    if (typeof bundleId !== 'string') return null;
    if (bundleId === lastBundleId) return null;
    lastBundleId = bundleId;
    return { kind: 'context-switch', toBundleId: bundleId };
  },
};

export function _resetContextRule(): void {
  lastBundleId = null;
}
