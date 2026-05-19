// Codex Pets atlas defaults. When a manifest omits these, the loader fills them
// in so existing Codex-format pets work as-is.
// Reference: https://github.com/crafter-station/petdex

import type { AnimationRow, PetState } from './types';

export const CODEX_ATLAS = {
  cols: 8,
  rows: 9,
  frameWidth: 192,
  frameHeight: 208,
  framesPerState: 6,
  loopMs: 1100,
} as const;

// Translation from Codex Pets state names → this app's PetState vocabulary.
// Codex `review` has no equivalent here and is intentionally dropped (mapped
// to null) — the loader skips those rowMap entries. Keys are the state names
// you'll find in a Codex `pet.json`'s `rowMap`; identity entries are listed
// explicitly so this table is the single source of truth.
export const CODEX_STATE_MAP: Readonly<Record<string, PetState | null>> = {
  idle: 'idle',
  greet: 'typing',
  working: 'working',
  waiting: 'waiting',
  review: null,
  failed: 'failed',
  success: 'success',
  jump: 'busy',
};

// Default row assignment for Codex-format pets (one state per row, in order).
// Row numbers match the Codex Pets canonical layout — `typing` lives on the
// `greet` row, `busy` on the `jump` row. Row 4 (codex `review`) is left
// unmapped on purpose since we no longer have a corresponding state.
export const CODEX_DEFAULT_ROW_MAP: Readonly<Record<PetState, AnimationRow>> = {
  idle:    { row: 0, frames: 6, loopMs: 1100 },
  typing:  { row: 1, frames: 6, loopMs: 900 },
  working: { row: 2, frames: 6, loopMs: 700 },
  waiting: { row: 3, frames: 6, loopMs: 1500 },
  failed:  { row: 5, frames: 6, loopMs: 800 },
  success: { row: 6, frames: 6, loopMs: 800 },
  busy:    { row: 7, frames: 6, loopMs: 600 },
};
