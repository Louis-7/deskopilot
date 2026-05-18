import { ipcMain, type BrowserWindow } from 'electron';
import { IPC, type PetIntent } from '@shared/types';
import { loadRegistry } from './pets/registry';

/**
 * Wires up the two main-process channels used in M0–M3:
 *
 *  - LoadPet      : main → renderer  ("here is the active pet's id")
 *  - DevtoolsIntent : renderer → main → renderer
 *      For dev: the preload exposes `devSendIntent(intent)` which routes
 *      through this channel and is echoed back as a real `IntentToRenderer`
 *      message. Real intents in M4 will come from the interpreter, not here.
 */
export function attachIpc(win: BrowserWindow): void {
  ipcMain.on(IPC.DevtoolsIntent, (_evt, intent: PetIntent) => {
    win.webContents.send(IPC.IntentToRenderer, intent);
  });
}

export async function sendActivePet(win: BrowserWindow): Promise<void> {
  const reg = await loadRegistry();
  win.webContents.send(IPC.LoadPet, { petId: reg.activePetId });
}
