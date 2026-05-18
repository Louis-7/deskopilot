import { app, BrowserWindow } from 'electron';
import { createPetWindow } from './window';
import { handlePetProtocol, registerPetProtocolScheme } from './pet-protocol';
import { attachIpc, sendActivePet } from './ipc';
import { startEventPipeline, type PipelineHandle } from './runtime';
import { createTray, destroyTray } from './tray';

registerPetProtocolScheme();

if (process.platform === 'darwin') {
  // Pet lives in the menu bar — no dock icon.
  app.dock?.hide();
}

let pipeline: PipelineHandle | null = null;

app.whenReady().then(async () => {
  handlePetProtocol();
  const win = createPetWindow();
  attachIpc(win);
  win.webContents.on('did-finish-load', () => {
    void sendActivePet(win);
  });

  try {
    pipeline = await startEventPipeline(win);
  } catch (err) {
    console.error('[runtime] failed to start event pipeline:', err);
  }

  if (pipeline) createTray({ window: win, pipeline });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createPetWindow();
  });
});

app.on('before-quit', async () => {
  destroyTray();
  if (pipeline) await pipeline.stop();
});

// On macOS we keep the app alive even with no windows — the tray is our UI.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
