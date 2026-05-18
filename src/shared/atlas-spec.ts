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

// Default row assignment for Codex-format pets (one state per row, in order).
export const CODEX_DEFAULT_ROW_MAP: Readonly<Record<PetState, AnimationRow>> = {
  idle:    { row: 0, frames: 6, loopMs: 1100 },
  greet:   { row: 1, frames: 6, loopMs: 900 },
  working: { row: 2, frames: 6, loopMs: 700 },
  waiting: { row: 3, frames: 6, loopMs: 1500 },
  review:  { row: 4, frames: 6, loopMs: 1100 },
  failed:  { row: 5, frames: 6, loopMs: 800 },
  success: { row: 6, frames: 6, loopMs: 800 },
  jump:    { row: 7, frames: 6, loopMs: 600 },
};
