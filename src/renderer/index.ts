import type { DeskopilotApi, PetIntent, PetState } from '@shared/types';
import { createPetStage, type PetStageHandle } from './pet-stage';
import { PetStateController } from './state-machine';

declare global {
  interface Window {
    deskopilot: DeskopilotApi;
    pet?: {
      setState(state: PetState): void;
      dispatch(intent: PetIntent): void;
      state(): PetState;
    };
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const stage = document.getElementById('stage');
  if (!stage) return;

  const controller = new PetStateController('idle');
  let handle: PetStageHandle | null = null;

  async function loadPet(petId: string): Promise<void> {
    handle?.destroy();
    handle = await createPetStage(stage!, petId, (finishedState) => {
      controller.dispatch({ kind: 'animation-finished', from: finishedState });
    });
    handle.setState(controller.state);
    document.getElementById('placeholder')?.remove();
  }

  controller.subscribe((next) => handle?.setState(next));
  window.deskopilot?.onIntent((intent) => controller.dispatch(intent));
  window.deskopilot?.onLoadPet(({ petId }) => {
    void loadPet(petId).catch((err) =>
      console.error('[pet] failed to load pet:', petId, err),
    );
  });

  // Dev hooks for manual driving from the devtools console.
  window.pet = {
    setState: (state) => handle?.setState(state),
    dispatch: (intent) => controller.dispatch(intent),
    state: () => controller.state,
  };
});
