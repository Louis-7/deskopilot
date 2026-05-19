import type { PetIntent } from '@shared/types';

/**
 * Dedup successive identical intents so the renderer doesn't get hammered.
 * Two intents are considered "same" when their kind matches and their
 * non-trivial discriminator fields match (intensity, agent). We deliberately
 * keep this lenient — exact-equality dedup would defeat the rules that emit
 * the same intent every tick while a signal is active.
 */
export function sameIntent(a: PetIntent, b: PetIntent): boolean {
  if (a.kind !== b.kind) return false;
  // user-typing is never deduped: while the user is actively typing, the rule
  // emits every tick, and the state machine needs to see each one so the greet
  // animation re-triggers after each NON_INTERRUPTIBLE loop completes.
  if (a.kind === 'user-typing') return false;
  if (a.kind === 'ai-working' && b.kind === 'ai-working') {
    return (a.agent ?? null) === (b.agent ?? null);
  }
  return true;
}
