import {
  NON_INTERRUPTIBLE,
  type PetIntent,
  type PetState,
  type Reducer,
} from '@shared/types';
import { getLogger } from './logger';

const log = getLogger('state-machine');

// =============================================================================
// Pure reducer. No side effects, no timers, no IO. The full behavior of the
// pet — when it reacts to typing, when it works, when it idles — lives here.
//
// One-shot states (typing/busy/success/failed) play to completion before
// accepting new intents, with one exception: `user-typing` is always allowed
// to interrupt so a keystroke during a celebration still feels responsive.
// The animator emits `animation-finished` when a loop finishes.
// =============================================================================

export const reduce: Reducer = (state, intent) => {
  // Animation-finished: leave one-shot states, no-op otherwise.
  if (intent.kind === 'animation-finished') {
    if (NON_INTERRUPTIBLE.has(state) && intent.from === state) {
      return 'idle';
    }
    return state;
  }

  // While a one-shot is playing, ignore everything else.
  if (NON_INTERRUPTIBLE.has(state)) {
    return state;
  }

  switch (intent.kind) {
    case 'user-typing':
      return 'typing';

    case 'ai-working':
      return 'working';

    case 'ai-finished':
      return state === 'working' ? 'success' : state;

    case 'network-burst':
      return state === 'idle' ? 'busy' : state;

    case 'idle-too-long':
      return state === 'idle' ? 'waiting' : state;

    case 'celebrate':
      return 'success';

    case 'oops':
      return 'failed';

    case 'context-switch':
      // v1: focus changes don't affect the pet. The intent exists so the
      // interpreter can emit it (e.g. to power a future "look at active app"
      // micro-animation) without changing the reducer's surface area later.
      return state;
  }
};

// Convenience helper used by the renderer to apply a stream of intents.
export class PetStateController {
  private currentState: PetState;
  private listeners = new Set<(state: PetState, prev: PetState) => void>();

  constructor(initial: PetState = 'idle') {
    this.currentState = initial;
  }

  get state(): PetState {
    return this.currentState;
  }

  dispatch(intent: PetIntent): PetState {
    const prev = this.currentState;
    const next = reduce(prev, intent);
    if (next !== prev) {
      log.debug(`${prev} -> ${next}`, intent);
      this.currentState = next;
      for (const fn of this.listeners) fn(next, prev);
    } else {
      log.debug(`${prev} (no change)`, intent);
    }
    return next;
  }

  subscribe(fn: (state: PetState, prev: PetState) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
}
