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

  tray.on('right-click', () => void rebuild());
  tray.on('click', () => void rebuild());

  return tray;
}

async function buildMenu(deps: TrayDeps, rebuild: () => Promise<void>): Promise<Menu> {
  const reg = await loadRegistry();
  const pets = collectPets(reg.pets);
  const activeId = reg.activePetId;

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
    { label: 'Quit deskopilot', role: 'quit' },
  ]);
}

/**
 * Always includes "default" (the bundled built-in) even if the registry is
 * empty — the first run on a fresh machine has no userData/registry yet.
 */
function collectPets(registered: Record<string, PetRegistryEntry>): Array<{ id: string; name: string }> {
  const out = [{ id: 'default', name: 'Default' }];
  for (const entry of Object.values(registered)) {
    if (entry.id === 'default') continue;
    out.push({ id: entry.id, name: entry.name });
  }
  return out;
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
