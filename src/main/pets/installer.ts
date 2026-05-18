import AdmZip from 'adm-zip';
import { copyFile, mkdir, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadPet, PetLoadError, type LoadedPet } from './loader';
import { upsertPet, userPetsDir } from './registry';

export interface InstallResult {
  pet: LoadedPet;
  installedAt: number;
}

/**
 * Installs a pet package from either:
 *   - a folder (during dev, or for "drop a folder into pets/" workflow), or
 *   - a .zip file (the canonical distribution format)
 *
 * Steps:
 *   1. Stage the contents into a temp dir under userData
 *   2. Validate via loadPet() — catches malformed manifests AND any author who
 *      tries to ship transition logic (rejected at the loader)
 *   3. Move into <userData>/pets/<id>/  (replacing any existing pet with the
 *      same id)
 *   4. Record SHA-256 hashes + metadata into the registry
 *
 * Returns the LoadedPet (manifest + hashes) so the caller can switch the
 * active pet to it immediately.
 */
export async function installPet(sourcePath: string): Promise<InstallResult> {
  const stats = await stat(sourcePath);
  const target = await mkdtempUnderUserData();

  if (stats.isDirectory()) {
    await copyDir(sourcePath, target);
  } else if (sourcePath.toLowerCase().endsWith('.zip')) {
    const zip = new AdmZip(sourcePath);
    zip.extractAllTo(target, /* overwrite */ true);
  } else {
    throw new Error(`unsupported pet source (must be folder or .zip): ${sourcePath}`);
  }

  // The pet may be at the staged root, or nested one level (common when a
  // zip wraps the pet in its own folder).
  const root = (await findManifestRoot(target)) ?? target;
  const pet = await loadPet(root); // throws PetLoadError on invalid manifest

  // Move into the final destination, replacing any prior install.
  const finalDir = join(userPetsDir(), pet.manifest.id);
  if (existsSync(finalDir)) {
    await rmrf(finalDir);
  }
  await mkdir(userPetsDir(), { recursive: true });
  await renameOrCopy(root, finalDir);

  // Re-load from the final location so root paths line up.
  const finalPet = await loadPet(finalDir);

  const installedAt = Date.now();
  await upsertPet({
    id: finalPet.manifest.id,
    name: finalPet.manifest.name,
    installedAt,
    root: finalDir,
    hashes: finalPet.hashes,
  });

  return { pet: finalPet, installedAt };
}

async function mkdtempUnderUserData(): Promise<string> {
  const base = join(userPetsDir(), `.staging-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  await mkdir(base, { recursive: true });
  return base;
}

async function findManifestRoot(dir: string): Promise<string | null> {
  if (existsSync(join(dir, 'manifest.json')) || existsSync(join(dir, 'pet.json'))) {
    return dir;
  }
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const sub = join(dir, entry.name);
    if (existsSync(join(sub, 'manifest.json')) || existsSync(join(sub, 'pet.json'))) {
      return sub;
    }
  }
  return null;
}

async function copyDir(src: string, dst: string): Promise<void> {
  await mkdir(dst, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const s = join(src, entry.name);
    const d = join(dst, entry.name);
    if (entry.isDirectory()) {
      await copyDir(s, d);
    } else if (entry.isFile()) {
      await copyFile(s, d);
    }
  }
}

async function renameOrCopy(src: string, dst: string): Promise<void> {
  try {
    const { rename } = await import('node:fs/promises');
    await rename(src, dst);
  } catch {
    await copyDir(src, dst);
    await rmrf(src);
  }
}

async function rmrf(path: string): Promise<void> {
  const { rm } = await import('node:fs/promises');
  await rm(path, { recursive: true, force: true });
}

export { PetLoadError };
