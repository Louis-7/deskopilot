import { Application, Assets, Texture } from 'pixi.js';
import type { PetManifest, PetState } from '@shared/types';
import { Animator } from './animator';

export interface PetStageHandle {
  setState(state: PetState): void;
  destroy(): void;
}

export async function createPetStage(
  container: HTMLElement,
  petId: string,
  onLoopComplete: (state: PetState) => void,
): Promise<PetStageHandle> {
  const manifestUrl = `pet://${petId}/manifest.json`;
  const manifest = (await fetch(manifestUrl).then((r) => r.json())) as PetManifest;

  const atlasUrl = `pet://${petId}/${manifest.spritesheet.file}`;
  const atlas = (await Assets.load(atlasUrl)) as Texture;

  const app = new Application();
  await app.init({
    width: container.clientWidth,
    height: container.clientHeight,
    backgroundAlpha: 0,
    antialias: true,
    resolution: window.devicePixelRatio,
    autoDensity: true,
  });
  container.appendChild(app.canvas);

  const animator = new Animator(atlas, manifest.spritesheet, {
    onLoopComplete,
  });

  // Fit the sprite into the window, anchored at the bottom center.
  const scale = Math.min(
    (container.clientWidth * 0.9) / manifest.spritesheet.frameWidth,
    (container.clientHeight * 0.95) / manifest.spritesheet.frameHeight,
  );
  animator.sprite.scale.set(scale);
  animator.sprite.x = container.clientWidth / 2;
  animator.sprite.y = container.clientHeight - 4;
  app.stage.addChild(animator.sprite);

  app.ticker.add((ticker) => animator.update(ticker.deltaMS));

  return {
    setState: (state) => animator.setState(state),
    destroy: () => {
      app.destroy(true, { children: true, texture: true });
    },
  };
}
