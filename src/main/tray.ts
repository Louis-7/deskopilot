import {
  app,
  BrowserWindow,
  Menu,
  nativeImage,
  shell,
  Tray,
  type MenuItemConstructorOptions,
} from 'electron';
import { join } from 'node:path';
import { IPC } from '@shared/types';
import {
  loadRegistry,
  setActivePet,
  userPetsDir,
  type PetRegistryEntry,
} from './pets/registry';
import {
  checkForUpdates,
  getUpdaterState,
  onUpdaterStateChange,
  showUpdatePrompt,
  showInstallPrompt,
} from './updater';
import {
  isPreventingSleep,
  startPreventSleep,
  stopPreventSleep,
  isKeepingActive,
  startKeepActive,
  stopKeepActive,
} from './caffeinate';
import { getLogger } from './logger';

const log = getLogger('tray');

export interface TrayDeps {
  window: BrowserWindow;
}

let tray: Tray | null = null;

export function createTray(deps: TrayDeps): Tray {
  if (tray) return tray;

  const iconPath = join(app.getAppPath(), 'resources', 'tray-iconTemplate.png');
  const icon = nativeImage.createFromPath(iconPath);
  // Without isMacTemplateImage, the icon won't auto-tint for dark menu bars.
  icon.setTemplateImage(true);

  tray = new Tray(icon);
  tray.setToolTip('Deskopilot');

  const rebuild = async (): Promise<void> => {
    if (!tray) return;
    tray.setContextMenu(await buildMenu(deps, rebuild));
  };
  void rebuild();

  onUpdaterStateChange(() => void rebuild());

  tray.on('right-click', () => void rebuild());
  tray.on('click', () => void rebuild());

  return tray;
}

async function buildMenu(deps: TrayDeps, rebuild: () => Promise<void>): Promise<Menu> {
  const reg = await loadRegistry();
  const pets = collectPets(reg.pets);
  const activeId = reg.activePetId;
  const updState = getUpdaterState();

  function updaterMenuItem(): MenuItemConstructorOptions {
    switch (updState.phase) {
      case 'checking':
        return { label: 'Checking for Updates…', enabled: false };
      case 'update-available':
        return {
          label: `Update Available (v${updState.version})`,
          click: () => void showUpdatePrompt(),
        };
      case 'downloading':
        return { label: `Downloading… ${Math.round(updState.percent)}%`, enabled: false };
      case 'downloaded':
        return { label: 'Restart to Update', click: () => void showInstallPrompt() };
      default:
        return { label: 'Check for Updates…', click: () => void checkForUpdates({ silent: false }) };
    }
  }

  const petsSubmenu: MenuItemConstructorOptions[] = pets.length
    ? pets.map((p) => ({
        label: p.name,
        type: 'radio',
        checked: p.id === activeId,
        click: async () => {
          try {
            await setActivePet(p.id);
            deps.window.webContents.send(IPC.LoadPet, { petId: p.id });
          } catch (err) {
            log.error('setActivePet failed:', err);
          }
          await rebuild();
        },
      }))
    : [{ label: 'No pets installed', enabled: false }];

  return Menu.buildFromTemplate([
    { label: `Deskopilot · ${activeId}`, enabled: false },
    { type: 'separator' },
    { label: 'Pet', submenu: petsSubmenu },
    { type: 'separator' },
    {
      label: 'Open pets folder…',
      click: () => {
        void shell.openPath(userPetsDir());
      },
    },
    { type: 'separator' },
    {
      label: 'Prevent Sleep',
      type: 'checkbox',
      checked: isPreventingSleep(),
      click: () => {
        if (isPreventingSleep()) stopPreventSleep();
        else startPreventSleep();
        void rebuild();
      },
    },
    {
      label: 'Keep Active',
      type: 'checkbox',
      checked: isKeepingActive(),
      click: () => {
        if (isKeepingActive()) stopKeepActive();
        else startKeepActive();
        void rebuild();
      },
    },
    { type: 'separator' },
    updaterMenuItem(),
    { type: 'separator' },
    { label: 'Quit deskopilot', role: 'quit' },
  ]);
}

function collectPets(registered: Record<string, PetRegistryEntry>): Array<{ id: string; name: string }> {
  return Object.values(registered).map((entry) => ({ id: entry.id, name: entry.name }));
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
