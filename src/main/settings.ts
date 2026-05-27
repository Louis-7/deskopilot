import { app } from 'electron';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface UpdateSettings {
  allowPrerelease: boolean;
  autoCheckOnStartup: boolean;
  skippedVersion: string | null;
}

export interface AppSettings {
  version: 1;
  update: UpdateSettings;
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json');
}

function defaults(): AppSettings {
  return {
    version: 1,
    update: {
      allowPrerelease: true,
      autoCheckOnStartup: true,
      skippedVersion: null,
    },
  };
}

function normalize(parsed: unknown): AppSettings {
  const base = defaults();
  if (!parsed || typeof parsed !== 'object') return base;
  const obj = parsed as Partial<AppSettings>;
  if (obj.version !== 1) return base;
  const u = (obj.update ?? {}) as Partial<UpdateSettings>;
  return {
    version: 1,
    update: {
      allowPrerelease:
        typeof u.allowPrerelease === 'boolean' ? u.allowPrerelease : base.update.allowPrerelease,
      autoCheckOnStartup:
        typeof u.autoCheckOnStartup === 'boolean'
          ? u.autoCheckOnStartup
          : base.update.autoCheckOnStartup,
      skippedVersion: typeof u.skippedVersion === 'string' ? u.skippedVersion : null,
    },
  };
}

export async function loadSettings(): Promise<AppSettings> {
  const path = settingsPath();
  if (!existsSync(path)) return defaults();
  try {
    const raw = await readFile(path, 'utf8');
    return normalize(JSON.parse(raw));
  } catch {
    return defaults();
  }
}

export async function saveSettings(next: AppSettings): Promise<void> {
  const path = settingsPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(next, null, 2), 'utf8');
}

export async function updateSettings(patch: { update?: Partial<UpdateSettings> }): Promise<AppSettings> {
  const current = await loadSettings();
  const next: AppSettings = {
    ...current,
    update: { ...current.update, ...(patch.update ?? {}) },
  };
  await saveSettings(next);
  return next;
}
