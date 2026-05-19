import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC,
  type DeskopilotApi,
  type LoadPetMessage,
  type PetIntent,
} from '@shared/types';

const api: DeskopilotApi = {
  onIntent(handler) {
    const listener = (_: unknown, intent: PetIntent) => handler(intent);
    ipcRenderer.on(IPC.IntentToRenderer, listener);
    return () => {
      ipcRenderer.off(IPC.IntentToRenderer, listener);
    };
  },
  onLoadPet(handler) {
    const listener = (_: unknown, msg: LoadPetMessage) => handler(msg);
    ipcRenderer.on(IPC.LoadPet, listener);
    return () => {
      ipcRenderer.off(IPC.LoadPet, listener);
    };
  },
  devSendIntent(intent) {
    ipcRenderer.send(IPC.DevtoolsIntent, intent);
  },
  notifyStateChange(next, prev) {
    ipcRenderer.send(IPC.StateChange, next, prev);
  },
};

contextBridge.exposeInMainWorld('deskopilot', api);
