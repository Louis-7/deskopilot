import { describe, expect, it } from 'vitest';
import type { PetIntent, RawSignal, Rule } from '@shared/types';
import { Interpreter } from './interpreter';

function sig(source: string, ts: number, payload: Record<string, unknown> = {}): RawSignal {
  return { source, timestamp: ts, payload };
}

function constRule(id: string, intent: PetIntent | null): Rule {
  return {
    id,
    subscribes: [],
    evaluate: () => intent,
  };
}

describe('Interpreter', () => {
  it('emits the first rule that produces an intent (priority order)', () => {
    const emitted: PetIntent[] = [];
    const interp = new Interpreter({
      rules: [
        constRule('first', { kind: 'ai-working', agent: 'a' }),
        constRule('second', { kind: 'network-burst' }),
      ],
      onIntent: (i) => emitted.push(i),
      now: () => 1000,
      tickMs: 9999,
    });
    interp.tick();
    expect(emitted).toEqual([{ kind: 'ai-working', agent: 'a' }]);
  });

  it('dedupes consecutive identical intents', () => {
    const emitted: PetIntent[] = [];
    const interp = new Interpreter({
      rules: [constRule('one', { kind: 'ai-working', agent: 'x' })],
      onIntent: (i) => emitted.push(i),
      now: () => 1000,
      tickMs: 9999,
    });
    interp.tick();
    interp.tick();
    interp.tick();
    expect(emitted.length).toBe(1);
  });

  it('emits again when the intent changes', () => {
    const emitted: PetIntent[] = [];
    let pretend: PetIntent | null = { kind: 'ai-working', agent: 'a' };
    const interp = new Interpreter({
      rules: [{ id: 'switch', subscribes: [], evaluate: () => pretend }],
      onIntent: (i) => emitted.push(i),
      now: () => 1000,
      tickMs: 9999,
    });
    interp.tick();
    pretend = { kind: 'ai-finished' };
    interp.tick();
    expect(emitted.map((i) => i.kind)).toEqual(['ai-working', 'ai-finished']);
  });

  it('clearDedup() lets the next identical intent through', () => {
    const emitted: PetIntent[] = [];
    const interp = new Interpreter({
      rules: [constRule('one', { kind: 'ai-working', agent: 'x' })],
      onIntent: (i) => emitted.push(i),
      now: () => 1000,
      tickMs: 9999,
    });
    interp.tick();
    interp.tick(); // deduped
    interp.clearDedup();
    interp.tick(); // dedup memory cleared → emits again
    expect(emitted.length).toBe(2);
  });

  it('drops signals older than windowMs', () => {
    let now = 1000;
    let seen: number | null = null;
    const interp = new Interpreter({
      rules: [
        {
          id: 'count',
          subscribes: [],
          evaluate: (win) => {
            seen = win.length;
            return null;
          },
        },
      ],
      onIntent: () => {},
      now: () => now,
      windowMs: 1000,
      tickMs: 9999,
    });

    interp.ingest(sig('keyboard', 100));
    interp.ingest(sig('keyboard', 500));
    interp.tick();
    expect(seen).toBe(2); // now=1000, both within 1000ms

    // now=1500, cutoff=500. ts=100 dropped (100<500). ts=500 kept (not <500).
    now = 1500;
    interp.tick();
    expect(seen).toBe(1);

    // now=1700, cutoff=700. Both signals are <700 → dropped.
    now = 1700;
    interp.tick();
    expect(seen).toBe(0);
  });
});
