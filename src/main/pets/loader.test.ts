import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPet, PetLoadError } from './loader';

// 1×1 px PNG (smallest valid PNG) — content is irrelevant; the loader only
// hashes it and confirms the file exists.
const TINY_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da636400000000000005000168636f1f0000000049454e44ae426082',
  'hex',
);

async function makePet(files: Record<string, string | Buffer>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'deskopilot-pet-'));
  for (const [name, content] of Object.entries(files)) {
    const p = join(root, name);
    await mkdir(join(p, '..'), { recursive: true });
    await writeFile(p, content);
  }
  return root;
}

describe('loadPet', () => {
  let toClean: string[] = [];
  beforeEach(() => {
    toClean = [];
  });
  afterEach(async () => {
    for (const dir of toClean) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('loads a fully-specified deskopilot manifest', async () => {
    const root = await makePet({
      'manifest.json': JSON.stringify({
        $schema: 'deskopilot/pet-manifest@1',
        id: 'fluffy',
        name: 'Fluffy',
        version: '0.1.0',
        spritesheet: {
          file: 'sheet.png',
          cols: 8, rows: 9, frameWidth: 192, frameHeight: 208,
          rowMap: {
            idle: { row: 0, frames: 6, loopMs: 1100 },
            working: { row: 2, frames: 6, loopMs: 700 },
          },
        },
      }),
      'sheet.png': TINY_PNG,
    });
    toClean.push(root);

    const pet = await loadPet(root);
    expect(pet.manifest.id).toBe('fluffy');
    expect(pet.manifest.spritesheet.cols).toBe(8);
    expect(pet.manifest.spritesheet.rowMap.idle).toEqual({ row: 0, frames: 6, loopMs: 1100 });
    expect(pet.manifest.spritesheet.rowMap.working).toEqual({ row: 2, frames: 6, loopMs: 700 });
    // Defaults filled in for states the author didn't specify
    expect(pet.manifest.spritesheet.rowMap.greet).toBeDefined();
    expect(pet.hashes.manifest).toMatch(/^[a-f0-9]{64}$/);
    expect(pet.hashes.spritesheet).toMatch(/^[a-f0-9]{64}$/);
  });

  it('loads a Codex-style pet.json with all defaults', async () => {
    const root = await makePet({
      // No $schema → treated as Codex format
      'pet.json': JSON.stringify({
        id: 'codex-cat',
        name: 'Codex Cat',
        spritesheet: { file: 'spritesheet.webp' },
      }),
      'spritesheet.webp': TINY_PNG, // content unused, just needs to exist
    });
    toClean.push(root);

    const pet = await loadPet(root);
    expect(pet.manifest.id).toBe('codex-cat');
    expect(pet.manifest.compat?.codexPets).toBe(true);
    // Codex defaults applied
    expect(pet.manifest.spritesheet.cols).toBe(8);
    expect(pet.manifest.spritesheet.rows).toBe(9);
    expect(pet.manifest.spritesheet.frameWidth).toBe(192);
    expect(pet.manifest.spritesheet.frameHeight).toBe(208);
    expect(pet.manifest.spritesheet.rowMap.idle?.row).toBe(0);
    expect(pet.manifest.spritesheet.rowMap.jump?.row).toBe(7);
  });

  it('infers the spritesheet filename when the manifest omits it', async () => {
    const root = await makePet({
      'pet.json': JSON.stringify({ id: 'x', name: 'X', spritesheet: {} }),
      'spritesheet.png': TINY_PNG,
    });
    toClean.push(root);

    const pet = await loadPet(root);
    expect(pet.manifest.spritesheet.file).toBe('spritesheet.png');
  });

  it('rejects forbidden transition fields', async () => {
    const root = await makePet({
      'manifest.json': JSON.stringify({
        id: 'evil',
        name: 'Evil',
        spritesheet: { file: 'spritesheet.png' },
        // ⚠ this is the kind of field we explicitly do not allow
        transitions: { 'user-typing': 'jump' },
      }),
      'spritesheet.png': TINY_PNG,
    });
    toClean.push(root);

    await expect(loadPet(root)).rejects.toBeInstanceOf(PetLoadError);
    await expect(loadPet(root)).rejects.toThrow(/forbidden field/);
  });

  it('throws if the spritesheet file is missing', async () => {
    const root = await makePet({
      'manifest.json': JSON.stringify({
        id: 'x',
        name: 'X',
        spritesheet: { file: 'missing.png' },
      }),
    });
    toClean.push(root);

    await expect(loadPet(root)).rejects.toThrow(/spritesheet file not found/);
  });

  it('throws if a rowMap entry references a row out of range', async () => {
    const root = await makePet({
      'manifest.json': JSON.stringify({
        id: 'x',
        name: 'X',
        spritesheet: {
          file: 'sheet.png',
          cols: 8, rows: 9, frameWidth: 192, frameHeight: 208,
          rowMap: {
            idle: { row: 42, frames: 6, loopMs: 1100 },
          },
        },
      }),
      'sheet.png': TINY_PNG,
    });
    toClean.push(root);

    await expect(loadPet(root)).rejects.toThrow(/out of range/);
  });

  it('throws on malformed JSON', async () => {
    const root = await makePet({
      'manifest.json': '{ not json',
      'spritesheet.png': TINY_PNG,
    });
    toClean.push(root);

    await expect(loadPet(root)).rejects.toThrow(/not valid JSON/);
  });

  it('throws when no manifest is present', async () => {
    const root = await makePet({ 'spritesheet.png': TINY_PNG });
    toClean.push(root);

    await expect(loadPet(root)).rejects.toThrow(/no manifest found/);
  });
});
