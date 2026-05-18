import { describe, expect, it } from 'vitest';
import type { RawSignal } from '@shared/types';
import { networkRule } from './network.rule';

const n = (ts: number, inK: number, outK: number): RawSignal => ({
  source: 'network',
  timestamp: ts,
  payload: { kbpsIn: inK, kbpsOut: outK },
});

describe('networkRule', () => {
  it('returns null with no signals', () => {
    expect(networkRule.evaluate([], 1000)).toBeNull();
  });

  it('returns null below burst threshold', () => {
    expect(networkRule.evaluate([n(1000, 1000, 1000)], 1000)).toBeNull();
  });

  it('emits network-burst above threshold', () => {
    expect(networkRule.evaluate([n(1000, 3000, 3000)], 1000)).toEqual({
      kind: 'network-burst',
    });
  });

  it('ignores stale signals', () => {
    expect(networkRule.evaluate([n(0, 9000, 9000)], 5000)).toBeNull();
  });
});
