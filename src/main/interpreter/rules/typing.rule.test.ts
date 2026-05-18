import { describe, expect, it } from 'vitest';
import type { RawSignal } from '@shared/types';
import { typingRule } from './typing.rule';

const k = (ts: number, kps: number): RawSignal => ({
  source: 'keyboard',
  timestamp: ts,
  payload: { keysPerSec: kps },
});

describe('typingRule', () => {
  it('returns null when no keyboard signals', () => {
    expect(typingRule.evaluate([], 1000)).toBeNull();
  });

  it('emits user-typing/light when avg keysPerSec ≥ 3', () => {
    const out = typingRule.evaluate([k(900, 3), k(950, 4), k(1000, 3)], 1000);
    expect(out).toEqual({ kind: 'user-typing', intensity: 'light' });
  });

  it('emits user-typing/heavy when avg keysPerSec ≥ 8', () => {
    const out = typingRule.evaluate([k(900, 9), k(950, 10), k(1000, 8)], 1000);
    expect(out).toEqual({ kind: 'user-typing', intensity: 'heavy' });
  });

  it('returns null when typing is too slow', () => {
    expect(typingRule.evaluate([k(900, 1), k(1000, 2)], 1000)).toBeNull();
  });

  it('ignores signals outside the window', () => {
    // 3000ms old is outside the 2000ms window
    expect(typingRule.evaluate([k(0, 20)], 3000)).toBeNull();
  });

  it('ignores non-keyboard sources', () => {
    expect(
      typingRule.evaluate(
        [{ source: 'network', timestamp: 1000, payload: { keysPerSec: 100 } }],
        1000,
      ),
    ).toBeNull();
  });
});
