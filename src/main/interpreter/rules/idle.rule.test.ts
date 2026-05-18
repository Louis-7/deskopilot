import { beforeEach, describe, expect, it } from 'vitest';
import type { RawSignal } from '@shared/types';
import { idleRule, _resetIdleRule } from './idle.rule';

const k = (ts: number): RawSignal => ({
  source: 'keyboard',
  timestamp: ts,
  payload: { keysPerSec: 0 },
});

describe('idleRule', () => {
  beforeEach(() => _resetIdleRule());

  const FIVE_MIN = 5 * 60 * 1000;

  it('returns null with no presence signals', () => {
    expect(idleRule.evaluate([], 1000)).toBeNull();
  });

  it('returns null while user is active', () => {
    expect(idleRule.evaluate([k(1000)], 1500)).toBeNull();
  });

  it('emits idle-too-long after 5 minutes of no presence', () => {
    const out = idleRule.evaluate([k(0)], FIVE_MIN + 1);
    expect(out).toEqual({ kind: 'idle-too-long' });
  });

  it('does not re-fire immediately', () => {
    expect(idleRule.evaluate([k(0)], FIVE_MIN + 1)).not.toBeNull();
    expect(idleRule.evaluate([k(0)], FIVE_MIN + 2)).toBeNull();
  });
});
