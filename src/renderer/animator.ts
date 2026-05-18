import { Rectangle, Sprite, Texture } from 'pixi.js';
import type { PetState, SpritesheetSpec } from '@shared/types';

export interface AnimatorHooks {
  // Fires when the current state has played one full loop (loopMs elapsed).
  // Used by the state machine in M2 to drive one-shot states back to idle.
  onLoopComplete(state: PetState): void;
}

// Owns the visible Sprite and advances frames on a fixed-rate ticker.
// Pure rendering concern — does not know about events or the reducer.
export class Animator {
  readonly sprite: Sprite;

  private readonly spec: SpritesheetSpec;
  private readonly atlasTexture: Texture;
  private state: PetState = 'idle';
  private frameIndex = 0;
  private elapsedMs = 0;
  private hooks: AnimatorHooks;

  constructor(atlas: Texture, spec: SpritesheetSpec, hooks: AnimatorHooks) {
    this.atlasTexture = atlas;
    this.spec = spec;
    this.hooks = hooks;
    this.sprite = new Sprite(this.frameTexture('idle', 0));
    this.sprite.anchor.set(0.5, 1);
  }

  setState(state: PetState): void {
    if (state === this.state) return;
    const row = this.spec.rowMap[state];
    if (!row) {
      // Missing animation; fall back to idle so we never freeze the renderer.
      console.warn(`[animator] pet has no row for state="${state}"; using idle`);
      this.state = 'idle';
    } else {
      this.state = state;
    }
    this.frameIndex = 0;
    this.elapsedMs = 0;
    this.sprite.texture = this.frameTexture(this.state, 0);
  }

  // Call this on each Pixi ticker tick. deltaMs in milliseconds.
  update(deltaMs: number): void {
    const row = this.spec.rowMap[this.state] ?? this.spec.rowMap.idle;
    if (!row) return;
    const frameMs = row.loopMs / row.frames;
    this.elapsedMs += deltaMs;

    let advanced = false;
    while (this.elapsedMs >= frameMs) {
      this.elapsedMs -= frameMs;
      const next = (this.frameIndex + 1) % row.frames;
      if (next === 0) {
        this.hooks.onLoopComplete(this.state);
      }
      this.frameIndex = next;
      advanced = true;
    }
    if (advanced) {
      this.sprite.texture = this.frameTexture(this.state, this.frameIndex);
    }
  }

  private frameTexture(state: PetState, frame: number): Texture {
    const row = this.spec.rowMap[state];
    if (!row) {
      return this.frameTexture('idle', 0);
    }
    const x = frame * this.spec.frameWidth;
    const y = row.row * this.spec.frameHeight;
    return new Texture({
      source: this.atlasTexture.source,
      frame: new Rectangle(x, y, this.spec.frameWidth, this.spec.frameHeight),
    });
  }
}
