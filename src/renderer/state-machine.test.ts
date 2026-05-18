import { describe, expect, it } from 'vitest';
import type { PetIntent, PetState } from '@shared/types';
import { NON_INTERRUPTIBLE } from '@shared/types';
import { PetStateController, reduce } from './state-machine';

const ALL_STATES: PetState[] = [
  'idle', 'greet', 'working', 'waiting', 'review', 'failed', 'success', 'jump',
];

describe('reduce', () => {
  describe('from idle', () => {
    it('user-typing → greet', () => {
      expect(reduce('idle', { kind: 'user-typing', intensity: 'light' })).toBe('greet');
      expect(reduce('idle', { kind: 'user-typing', intensity: 'heavy' })).toBe('greet');
    });

    it('ai-working → working', () => {
      expect(reduce('idle', { kind: 'ai-working' })).toBe('working');
    });

    it('ai-finished → idle (stays)', () => {
      expect(reduce('idle', { kind: 'ai-finished' })).toBe('idle');
    });

    it('network-burst → jump', () => {
      expect(reduce('idle', { kind: 'network-burst' })).toBe('jump');
    });

    it('idle-too-long → waiting', () => {
      expect(reduce('idle', { kind: 'idle-too-long' })).toBe('waiting');
    });

    it('celebrate → success', () => {
      expect(reduce('idle', { kind: 'celebrate' })).toBe('success');
    });

    it('oops → failed', () => {
      expect(reduce('idle', { kind: 'oops' })).toBe('failed');
    });

    it('context-switch → idle (no-op)', () => {
      expect(reduce('idle', { kind: 'context-switch', toBundleId: 'com.foo' })).toBe('idle');
    });
  });

  describe('from working', () => {
    it('user-typing → working (stays, does not yank to greet)', () => {
      expect(reduce('working', { kind: 'user-typing', intensity: 'light' })).toBe('working');
    });

    it('ai-working → working', () => {
      expect(reduce('working', { kind: 'ai-working' })).toBe('working');
    });

    it('ai-finished → success', () => {
      expect(reduce('working', { kind: 'ai-finished' })).toBe('success');
    });

    it('network-burst → working (stays)', () => {
      expect(reduce('working', { kind: 'network-burst' })).toBe('working');
    });

    it('idle-too-long → working (stays)', () => {
      expect(reduce('working', { kind: 'idle-too-long' })).toBe('working');
    });

    it('oops → failed (overrides working)', () => {
      expect(reduce('working', { kind: 'oops' })).toBe('failed');
    });
  });

  describe('from waiting', () => {
    it('ai-working → working', () => {
      expect(reduce('waiting', { kind: 'ai-working' })).toBe('working');
    });

    it('user-typing → waiting (stays — only idle triggers greet)', () => {
      expect(reduce('waiting', { kind: 'user-typing', intensity: 'light' })).toBe('waiting');
    });
  });

  describe('NON_INTERRUPTIBLE states ignore non-animation-finished intents', () => {
    const intents: PetIntent[] = [
      { kind: 'user-typing', intensity: 'light' },
      { kind: 'ai-working' },
      { kind: 'ai-finished' },
      { kind: 'network-burst' },
      { kind: 'idle-too-long' },
      { kind: 'celebrate' },
      { kind: 'oops' },
      { kind: 'context-switch', toBundleId: 'x' },
    ];
    for (const state of [...NON_INTERRUPTIBLE]) {
      for (const intent of intents) {
        it(`${state} + ${intent.kind} → ${state}`, () => {
          expect(reduce(state, intent)).toBe(state);
        });
      }
    }
  });

  describe('animation-finished', () => {
    for (const state of [...NON_INTERRUPTIBLE]) {
      it(`${state} + animation-finished(from=${state}) → idle`, () => {
        expect(reduce(state, { kind: 'animation-finished', from: state })).toBe('idle');
      });
      it(`${state} ignores animation-finished from a different state`, () => {
        const other = state === 'greet' ? 'jump' : 'greet';
        expect(reduce(state, { kind: 'animation-finished', from: other })).toBe(state);
      });
    }

    for (const state of ALL_STATES.filter((s) => !NON_INTERRUPTIBLE.has(s))) {
      it(`${state} ignores animation-finished (looping state)`, () => {
        expect(reduce(state, { kind: 'animation-finished', from: state })).toBe(state);
      });
    }
  });
});

describe('PetStateController', () => {
  it('starts at idle by default', () => {
    expect(new PetStateController().state).toBe('idle');
  });

  it('notifies subscribers only when state changes', () => {
    const c = new PetStateController('idle');
    const seen: string[] = [];
    c.subscribe((next, prev) => seen.push(`${prev}->${next}`));

    c.dispatch({ kind: 'ai-working' });
    c.dispatch({ kind: 'ai-working' }); // no-op
    c.dispatch({ kind: 'ai-finished' });

    expect(seen).toEqual(['idle->working', 'working->success']);
  });

  it('honors the one-shot lock end-to-end', () => {
    const c = new PetStateController('idle');
    c.dispatch({ kind: 'user-typing', intensity: 'light' });
    expect(c.state).toBe('greet');

    // While in greet, no intent (except animation-finished) escapes
    c.dispatch({ kind: 'ai-working' });
    expect(c.state).toBe('greet');

    c.dispatch({ kind: 'animation-finished', from: 'greet' });
    expect(c.state).toBe('idle');

    c.dispatch({ kind: 'ai-working' });
    expect(c.state).toBe('working');
  });
});
