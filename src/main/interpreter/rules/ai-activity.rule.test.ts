import { beforeEach, describe, expect, it } from 'vitest';
import type { RawSignal } from '@shared/types';
import { aiActivityRule, _resetAiActivityRule } from './ai-activity.rule';

const a = (
  ts: number,
  agents: { name: string; bytesPerSec: number }[],
): RawSignal => ({
  source: 'ai-agent',
  timestamp: ts,
  payload: { agents },
});

describe('aiActivityRule', () => {
  beforeEach(() => _resetAiActivityRule());

  it('returns null with no signals', () => {
    expect(aiActivityRule.evaluate([], 1000)).toBeNull();
  });

  it('emits ai-working when an agent exceeds the bytes/s threshold', () => {
    const out = aiActivityRule.evaluate(
      [a(1000, [{ name: 'claude', bytesPerSec: 40_000 }])],
      1000,
    );
    expect(out).toEqual({ kind: 'ai-working', agent: 'claude' });
  });

  it('does not emit ai-working when bytes/s is below threshold', () => {
    const out = aiActivityRule.evaluate(
      [a(1000, [{ name: 'claude', bytesPerSec: 500 }])],
      1000,
    );
    expect(out).toBeNull();
  });

  it('emits ai-finished only after the idle threshold since the last hot sample', () => {
    const hot = [{ name: 'c', bytesPerSec: 50_000 }];
    // Hot sample at t=1000 sets lastHotAt
    expect(aiActivityRule.evaluate([a(1000, hot)], 1000)).toEqual({
      kind: 'ai-working',
      agent: 'c',
    });
    // Continued idle heartbeats — 5s after hot, not yet finished
    expect(aiActivityRule.evaluate([a(1000, hot), a(6000, [])], 6000)).toBeNull();
    // 11s after the last hot sample — fires ai-finished even though a fresh
    // (empty) heartbeat just arrived
    expect(aiActivityRule.evaluate([a(1000, hot), a(12000, [])], 12000)).toEqual({
      kind: 'ai-finished',
    });
  });

  it('does not double-fire ai-finished', () => {
    const hot = [{ name: 'c', bytesPerSec: 50_000 }];
    expect(aiActivityRule.evaluate([a(1000, hot)], 1000)).not.toBeNull();
    expect(aiActivityRule.evaluate([a(1000, hot), a(12000, [])], 12000)).toEqual({
      kind: 'ai-finished',
    });
    expect(aiActivityRule.evaluate([a(1000, hot), a(13000, [])], 13000)).toBeNull();
  });
});
