import { beforeEach, describe, expect, it } from 'vitest';
import type { RawSignal } from '@shared/types';
import { aiActivityRule, _resetAiActivityRule } from './ai-activity.rule';

const a = (ts: number, agents: { name: string; cpu: number }[]): RawSignal => ({
  source: 'ai-agent',
  timestamp: ts,
  payload: { agents },
});

describe('aiActivityRule', () => {
  beforeEach(() => _resetAiActivityRule());

  it('returns null with no signals', () => {
    expect(aiActivityRule.evaluate([], 1000)).toBeNull();
  });

  it('emits ai-working when an agent is over the CPU threshold', () => {
    const out = aiActivityRule.evaluate([a(1000, [{ name: 'claude', cpu: 45 }])], 1000);
    expect(out).toEqual({ kind: 'ai-working', agent: 'claude' });
  });

  it('does not emit ai-working when CPU is below threshold', () => {
    const out = aiActivityRule.evaluate([a(1000, [{ name: 'claude', cpu: 3 }])], 1000);
    expect(out).toBeNull();
  });

  it('emits ai-finished only after the idle threshold is exceeded', () => {
    // Set state to "working"
    expect(aiActivityRule.evaluate([a(1000, [{ name: 'c', cpu: 50 }])], 1000)).toEqual({
      kind: 'ai-working',
      agent: 'c',
    });
    // 5s later, no hot agents — not yet finished
    expect(
      aiActivityRule.evaluate([a(1000, [{ name: 'c', cpu: 50 }])], 6000),
    ).toBeNull();
    // 11s later — should be finished
    expect(
      aiActivityRule.evaluate([a(1000, [{ name: 'c', cpu: 50 }])], 12000),
    ).toEqual({ kind: 'ai-finished' });
  });

  it('does not double-fire ai-finished', () => {
    expect(aiActivityRule.evaluate([a(1000, [{ name: 'c', cpu: 50 }])], 1000)).not.toBeNull();
    expect(
      aiActivityRule.evaluate([a(1000, [{ name: 'c', cpu: 50 }])], 12000),
    ).toEqual({ kind: 'ai-finished' });
    expect(
      aiActivityRule.evaluate([a(1000, [{ name: 'c', cpu: 50 }])], 13000),
    ).toBeNull();
  });
});
