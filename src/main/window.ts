import { BrowserWindow, screen } from 'electron';
import { join } from 'node:path';

const WINDOW_SIZE = { width: 256, height: 256 };

export function createPetWindow(): BrowserWindow {
  const { workArea } = screen.getPrimaryDisplay();

  const win = new BrowserWindow({
    width: WINDOW_SIZE.width,
    height: WINDOW_SIZE.height,
    x: workArea.x + workArea.width - WINDOW_SIZE.width - 24,
    y: workArea.y + workArea.height - WINDOW_SIZE.height - 24,
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: false,
    movable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Click-through is toggled later by the tray; default to interactive so
  // dragging works in dev.
  win.setIgnoreMouseEvents(false);

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL']);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return win;
}
