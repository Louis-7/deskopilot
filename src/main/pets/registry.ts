import { app } from 'electron';
import { copyFile, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** One record per installed pet. Stored in registry.json under userData. */
export interface PetRegistryEntry {
  id: string;
  name: string;
  installedAt: number;
  root: string;
  hashes: { manifest: string; spritesheet: string };
  builtin?: boolean;
}

export interface RegistryFile {
  version: 1;
  activePetId: string;
  pets: Record<string, PetRegistryEntry>;
}

function registryPath(): string {
  return join(app.getPath('userData'), 'registry.json');
}

export function builtinPetsDir(): string {
  // In dev,     pets/ lives at the repo root.
  // When packaged, electron-builder copies it to Contents/Resources/pets/
  // via the extraResources entry in electron-builder.yml.
  return app.isPackaged
    ? join(process.resourcesPath, 'pets')
    : join(app.getAppPath(), 'pets');
}

export function userPetsDir(): string {
  return join(app.getPath('userData'), 'pets');
}

export async function loadRegistry(): Promise<RegistryFile> {
  const path = registryPath();
  if (!existsSync(path)) {
    const bundled = join(app.getAppPath(), 'resources', 'registry.json');
    if (existsSync(bundled)) {
      await mkdir(dirname(path), { recursive: true });
      await copyFile(bundled, path);
    } else {
      return { version: 1, activePetId: 'default', pets: {} };
    }
  }
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as RegistryFile;
    if (parsed.version !== 1) {
      // Forward-compat shim: callers should treat unknown versions as empty.
      return { version: 1, activePetId: 'default', pets: {} };
    }
    return parsed;
  } catch {
    return { version: 1, activePetId: 'default', pets: {} };
  }
}

export async function saveRegistry(file: RegistryFile): Promise<void> {
  const path = registryPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(file, null, 2), 'utf8');
}

export async function upsertPet(entry: PetRegistryEntry): Promise<void> {
  const file = await loadRegistry();
  file.pets[entry.id] = entry;
  if (!file.pets[file.activePetId]) file.activePetId = entry.id;
  await saveRegistry(file);
}

export async function removePet(id: string): Promise<void> {
  const file = await loadRegistry();
  delete file.pets[id];
  if (file.activePetId === id) {
    const fallback = Object.keys(file.pets)[0] ?? 'default';
    file.activePetId = fallback;
  }
  await saveRegistry(file);
}

export async function setActivePet(id: string): Promise<void> {
  const file = await loadRegistry();
  if (!file.pets[id] && id !== 'default') {
    throw new Error(`cannot activate unknown pet "${id}"`);
  }
  file.activePetId = id;
  await saveRegistry(file);
}
