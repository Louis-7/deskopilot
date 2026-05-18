import { beforeEach, describe, expect, it } from 'vitest';
import type { RawSignal } from '@shared/types';
import { contextRule, _resetContextRule } from './context.rule';

const f = (ts: number, bundleId: string): RawSignal => ({
  source: 'frontmost',
  timestamp: ts,
  payload: { bundleId },
});

describe('contextRule', () => {
  beforeEach(() => _resetContextRule());

  it('emits on first observed app', () => {
    expect(contextRule.evaluate([f(1000, 'com.apple.Terminal')], 1000)).toEqual({
      kind: 'context-switch',
      toBundleId: 'com.apple.Terminal',
    });
  });

  it('does not re-emit for the same app', () => {
    contextRule.evaluate([f(1000, 'com.apple.Terminal')], 1000);
    expect(
      contextRule.evaluate(
        [f(1000, 'com.apple.Terminal'), f(2000, 'com.apple.Terminal')],
        2000,
      ),
    ).toBeNull();
  });

  it('emits when the app changes', () => {
    contextRule.evaluate([f(1000, 'com.apple.Terminal')], 1000);
    const out = contextRule.evaluate([f(2000, 'com.cursor.Cursor')], 2000);
    expect(out).toEqual({ kind: 'context-switch', toBundleId: 'com.cursor.Cursor' });
  });
});
