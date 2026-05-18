import type { PetIntent, RawSignal, Rule } from '@shared/types';
import { sameIntent } from './debounce';

export interface InterpreterOptions {
  rules: readonly Rule[];
  /** Sliding window length in ms. Older signals are discarded. */
  windowMs?: number;
  /** Tick interval in ms. How often rules are evaluated. */
  tickMs?: number;
  /** Callback for each PetIntent emitted (after dedup). */
  onIntent: (intent: PetIntent) => void;
  /** Override clock for testing. Defaults to Date.now. */
  now?: () => number;
}

/**
 * Layer-2 main loop. Buffers RawSignals from layer-1 sources, evaluates rules
 * on a tick, and emits PetIntents (deduped vs the previous emit) to layer 3.
 */
export class Interpreter {
  private readonly rules: readonly Rule[];
  private readonly windowMs: number;
  private readonly tickMs: number;
  private readonly onIntent: (intent: PetIntent) => void;
  private readonly now: () => number;

  private buffer: RawSignal[] = [];
  private timer: NodeJS.Timeout | null = null;
  private lastEmitted: PetIntent | null = null;

  constructor(opts: InterpreterOptions) {
    this.rules = opts.rules;
    this.windowMs = opts.windowMs ?? 10_000;
    this.tickMs = opts.tickMs ?? 250;
    this.onIntent = opts.onIntent;
    this.now = opts.now ?? Date.now;
  }

  ingest(signal: RawSignal): void {
    this.buffer.push(signal);
    this.trim();
  }

  /** Force one evaluation tick. Used by tests; the timer does the same. */
  tick(): void {
    this.trim();
    const now = this.now();
    for (const rule of this.rules) {
      const intent = rule.evaluate(this.buffer, now);
      if (!intent) continue;
      if (this.lastEmitted && sameIntent(this.lastEmitted, intent)) continue;
      this.lastEmitted = intent;
      this.onIntent(intent);
      return; // first rule wins per tick — see ALL_RULES ordering
    }
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), this.tickMs);
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private trim(): void {
    const cutoff = this.now() - this.windowMs;
    while (this.buffer.length > 0 && this.buffer[0]!.timestamp < cutoff) {
      this.buffer.shift();
    }
  }
}
