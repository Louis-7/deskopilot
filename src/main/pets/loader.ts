import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import {
  CODEX_ATLAS,
  CODEX_DEFAULT_ROW_MAP,
  CODEX_STATE_MAP,
} from '@shared/atlas-spec';
import type {
  AnimationRow,
  PetManifest,
  PetState,
  SpritesheetSpec,
} from '@shared/types';

export interface LoadedPet {
  manifest: PetManifest;
  /** Directory containing manifest.json and the spritesheet. */
  root: string;
  /** SHA-256 hashes of the two canonical files, in hex. */
  hashes: { manifest: string; spritesheet: string };
}

export class PetLoadError extends Error {
  constructor(message: string, readonly root: string) {
    super(`[pet "${root}"] ${message}`);
    this.name = 'PetLoadError';
  }
}

/**
 * Reads, validates, and normalizes a pet at `root`.
 *
 * Compatible with Codex Pets' `pet.json` format. If the manifest is missing
 * fields the Codex spec leaves as defaults (8×9 grid, 192×208 frames, 6 frames
 * per row, 1100ms loops), the loader fills them in so existing Codex pets
 * Just Work.
 *
 * Validation is strict on shape but permissive on extras — unknown fields are
 * preserved (callers must not assume the manifest has no extra keys). The one
 * thing we *reject* is any field that looks like an event-to-animation map,
 * because deskopilot owns transitions, not pet authors.
 */
export async function loadPet(root: string): Promise<LoadedPet> {
  const manifestPath = await findManifest(root);
  const manifestRaw = await readFile(manifestPath, 'utf8');

  let parsed: unknown;
  try {
    parsed = JSON.parse(manifestRaw);
  } catch (err) {
    throw new PetLoadError(`manifest is not valid JSON: ${(err as Error).message}`, root);
  }

  rejectForbiddenFields(parsed, root);
  const manifest = normalize(parsed, root);

  const spritesheetPath = join(root, manifest.spritesheet.file);
  if (!existsSync(spritesheetPath)) {
    throw new PetLoadError(
      `spritesheet file not found: ${manifest.spritesheet.file}`,
      root,
    );
  }

  const spritesheetBytes = await readFile(spritesheetPath);
  const hashes = {
    manifest: sha256(Buffer.from(manifestRaw)),
    spritesheet: sha256(spritesheetBytes),
  };

  return { manifest, root, hashes };
}

async function findManifest(root: string): Promise<string> {
  // Prefer our schema's filename; fall back to Codex's `pet.json`.
  const candidates = ['manifest.json', 'pet.json'];
  for (const name of candidates) {
    const p = join(root, name);
    if (existsSync(p)) return p;
  }
  throw new PetLoadError(
    `no manifest found (expected one of: ${candidates.join(', ')})`,
    root,
  );
}

/**
 * deskopilot's contract: pet packages are *data only*. They MUST NOT describe
 * how events map to animations. Reject any manifest that tries to.
 */
function rejectForbiddenFields(parsed: unknown, root: string): void {
  if (!isRecord(parsed)) return;
  const forbidden = ['transitions', 'events', 'triggers', 'eventMap', 'onEvent'];
  for (const key of forbidden) {
    if (key in parsed) {
      throw new PetLoadError(
        `manifest contains forbidden field "${key}" — deskopilot does not let pets define their own transitions`,
        root,
      );
    }
  }
}

function normalize(raw: unknown, root: string): PetManifest {
  if (!isRecord(raw)) throw new PetLoadError('manifest must be an object', root);

  const id = stringField(raw, 'id', root) ?? deriveIdFromRoot(root);
  const name = stringField(raw, 'name', root) ?? id;

  const ss = raw['spritesheet'];
  if (!isRecord(ss)) {
    throw new PetLoadError('manifest is missing "spritesheet" object', root);
  }
  const spritesheet = normalizeSpritesheet(ss, root);

  const out: PetManifest = {
    id,
    name,
    spritesheet,
    compat: isRecord(raw['compat'])
      ? { codexPets: raw['compat']['codexPets'] === true }
      : { codexPets: !raw['$schema'] }, // no $schema → assume Codex format
  };
  if (typeof raw['version'] === 'string') out.version = raw['version'];
  if (typeof raw['author'] === 'string') out.author = raw['author'];
  if (typeof raw['$schema'] === 'string') out.$schema = raw['$schema'];
  return out;
}

function normalizeSpritesheet(ss: Record<string, unknown>, root: string): SpritesheetSpec {
  const file =
    typeof ss['file'] === 'string'
      ? ss['file']
      : typeof ss['filename'] === 'string'
        ? ss['filename']
        : guessSpritesheetFilename(root);
  if (!file) {
    throw new PetLoadError(
      'spritesheet.file missing and no spritesheet.{webp,png} found in pet dir',
      root,
    );
  }

  const cols = numField(ss, 'cols', CODEX_ATLAS.cols);
  const rows = numField(ss, 'rows', CODEX_ATLAS.rows);
  const frameWidth = numField(ss, 'frameWidth', CODEX_ATLAS.frameWidth);
  const frameHeight = numField(ss, 'frameHeight', CODEX_ATLAS.frameHeight);

  const rawRowMap = ss['rowMap'];
  const rowMap = isRecord(rawRowMap)
    ? normalizeRowMap(rawRowMap, cols, rows, root)
    : { ...CODEX_DEFAULT_ROW_MAP };

  return { file, cols, rows, frameWidth, frameHeight, rowMap };
}

function normalizeRowMap(
  raw: Record<string, unknown>,
  cols: number,
  rows: number,
  root: string,
): Partial<Record<PetState, AnimationRow>> {
  const out: Partial<Record<PetState, AnimationRow>> = {};
  for (const [rawKey, value] of Object.entries(raw)) {
    if (!isRecord(value)) continue;
    // Translate codex state names (greet, jump, review, ...) into this app's
    // PetState vocabulary. Unknown keys and keys mapped to null (e.g. codex
    // `review`) are silently skipped so Codex-format pets load cleanly.
    const state = resolvePetState(rawKey);
    if (!state) continue;
    const row = numField(value, 'row', -1);
    if (row < 0 || row >= rows) {
      throw new PetLoadError(
        `rowMap["${rawKey}"].row=${row} is out of range (0..${rows - 1})`,
        root,
      );
    }
    const frames = numField(value, 'frames', CODEX_ATLAS.framesPerState);
    if (frames < 1 || frames > cols) {
      throw new PetLoadError(
        `rowMap["${rawKey}"].frames=${frames} must be in 1..${cols}`,
        root,
      );
    }
    const loopMs = numField(value, 'loopMs', CODEX_ATLAS.loopMs);
    out[state] = { row, frames, loopMs };
  }
  // Fall back to defaults for any state the author didn't supply.
  for (const [state, def] of Object.entries(CODEX_DEFAULT_ROW_MAP) as [PetState, AnimationRow][]) {
    if (!out[state] && def.row < rows) out[state] = def;
  }
  return out;
}

function deriveIdFromRoot(root: string): string {
  return root.split(/[\\/]/).filter(Boolean).pop() ?? 'unknown';
}

function guessSpritesheetFilename(root: string): string | null {
  for (const name of ['spritesheet.webp', 'spritesheet.png', 'atlas.png', 'atlas.webp']) {
    if (existsSync(join(root, name))) return name;
  }
  return null;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

// Resolves a manifest rowMap key (either a current PetState name or a codex
// alias like `greet`/`jump`) into the canonical PetState. Returns null for
// unknown keys and for codex states that have no app equivalent (e.g.
// `review`), so the caller can skip them.
function resolvePetState(key: string): PetState | null {
  if (isPetState(key)) return key;
  const mapped = CODEX_STATE_MAP[key];
  return mapped ?? null;
}

function isPetState(x: string): x is PetState {
  return (
    x === 'idle' || x === 'typing' || x === 'working' || x === 'waiting' ||
    x === 'failed' || x === 'success' || x === 'busy'
  );
}

function stringField(o: Record<string, unknown>, key: string, _root: string): string | undefined {
  return typeof o[key] === 'string' ? (o[key] as string) : undefined;
}

function numField(o: Record<string, unknown>, key: string, fallback: number): number {
  const v = o[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}
