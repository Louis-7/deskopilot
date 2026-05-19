---
name: install-petdex-pet
description: Installs a pet from petdex into deskopilot end-to-end — runs `npx petdex install`, copies files into the project, refines the manifest, and registers the pet in the deskopilot registry so it appears in the tray. Use when the user asks to install / add / import a petdex pet by name or slug.
---

# Install a Petdex Pet

End-to-end workflow: petdex CLI → project files → refined manifest → registered & active in the app.

## Inputs

- **Pet slug** — required. Ask if not provided. Example slugs: `boba`, `pingu`, `doraemon`, `mochi`. Browse https://petdex.crafter.run for the gallery.

## Steps

### 1. Run petdex install

```bash
npx petdex@latest install <slug>
```

This installs the pet to `~/.petdex/pets/<slug>/` (and also `~/.codex/pets/<slug>/`). Each pet folder contains `pet.json` + `spritesheet.webp` (or `.png`).

If the command fails (network, unknown slug, auth required), surface the error and stop.

### 2. Copy into the project

The project loads built-in pets from `pets/<slug>/` at the repo root.

```bash
mkdir -p pets/<slug>
cp -R ~/.petdex/pets/<slug>/. pets/<slug>/
ls pets/<slug>/
```

### 3. Verify spritesheet dimensions

Codex format is 8 cols × 9 rows of 192×208 frames → image must be 1536×1872:

```bash
/usr/bin/sips -g pixelWidth -g pixelHeight pets/<slug>/spritesheet.webp
```

If dimensions differ, stop and report — this pet isn't standard Codex format.

### 4. Inspect the spritesheet to count frames per row

Use the Read tool on `pets/<slug>/spritesheet.webp` — it renders the image. For each of the 8 rows, count how many frames the animation actually uses (look for where frames go blank/repeat). Frame counts vary per pet:

- pingu: greet=8, working=8, waiting=4, jump=5, failed=8 (others 6)
- boba: greet=8, working=8, waiting=4, jump=5, failed=8 (others 6)

If unclear from the image, default to 6 for each row — the user can tune later.

### 5. Write the refined manifest

Always write to `manifest.json` (NOT `pet.json`) — `manifest.json` is what the project prefers, and writing both creates ambiguity. Use the canonical Codex row order (verified against real petdex assets; do **not** use `src/shared/atlas-spec.ts:CODEX_DEFAULT_ROW_MAP`, which has a different/wrong order):

```json
{
  "id": "<slug>",
  "name": "<Pretty Name>",
  "description": "<from petdex's pet.json if present, else omit>",
  "spritesheet": {
    "file": "spritesheet.webp",
    "cols": 8,
    "rows": 9,
    "frameWidth": 192,
    "frameHeight": 208,
    "rowMap": {
      "idle":    { "row": 0, "frames": <N>, "loopMs": 1100 },
      "greet":   { "row": 1, "frames": <N>, "loopMs": 900 },
      "working": { "row": 2, "frames": <N>, "loopMs": 700 },
      "waiting": { "row": 3, "frames": <N>, "loopMs": 1500 },
      "jump":    { "row": 4, "frames": <N>, "loopMs": 600 },
      "failed":  { "row": 5, "frames": <N>, "loopMs": 800 },
      "review":  { "row": 6, "frames": <N>, "loopMs": 1100 },
      "success": { "row": 7, "frames": <N>, "loopMs": 800 }
    }
  }
}
```

**Why this matters:**
- Field name `name` (not `displayName`) — the loader at `src/main/pets/loader.ts:109` reads `name`. Wrong field → name silently falls back to id.
- The `rowMap` MUST be written in full. The renderer fetches `pet://<id>/manifest.json` directly (`src/renderer/pet-stage.ts:15-16`) and parses raw JSON — it never runs through `loadPet()`, so the loader's defaults never apply. Missing rows → renderer crash: `Cannot read properties of undefined (reading 'idle')`.
- `loopMs` values above are tuned per state (working faster than waiting). Keep them.
- Do NOT include `$schema`, `displayName`, `spritesheetPath`, `transitions`, `events`, `triggers`, `eventMap`, or `onEvent` — the loader REJECTS the last five (`loader.ts:94`); pets are data-only.

### 6. Remove the old pet.json

```bash
rm pets/<slug>/pet.json
```

### 7. Compute SHA-256 hashes

```bash
cd pets/<slug>
shasum -a 256 manifest.json
shasum -a 256 spritesheet.webp
```

### 8. Register in the deskopilot registry

The tray menu only shows pets present in `~/Library/Application Support/deskopilot/registry.json` (plus the hardcoded `default`). Auto-discovery of built-in pets isn't wired up.

Read the existing registry, then merge — **never overwrite existing pets**:

```bash
cat "$HOME/Library/Application Support/deskopilot/registry.json"
```

Add an entry with shape:

```json
{
  "id": "<slug>",
  "name": "<Pretty Name>",
  "installedAt": <Date.now() in ms — use a sensible integer>,
  "root": "<absolute path to deskopilot/pets/<slug>>",
  "hashes": {
    "manifest":    "<sha256 from step 7>",
    "spritesheet": "<sha256 from step 7>"
  },
  "builtin": true
}
```

The `root` path must be absolute. Hashes are stored but not validated at load time, so stale values won't break loading.

**Default behavior:** keep the current `activePetId` (don't auto-switch). Only set `activePetId` to the new slug if the user explicitly said "make it active" / "switch to it".

Write the merged registry back with the Write tool (Read it first if you haven't this turn).

### 9. Tell the user to reload

The app reads the registry once at startup. They need to quit + relaunch `npm run dev` for the new pet to show up in the tray Pet submenu.

## Quick reference: full example for slug `boba`

```bash
npx petdex@latest install boba
mkdir -p pets/boba
cp -R ~/.petdex/pets/boba/. pets/boba/
/usr/bin/sips -g pixelWidth -g pixelHeight pets/boba/spritesheet.webp
# Read pets/boba/spritesheet.webp to count frames per row
# Write pets/boba/manifest.json with refined content
rm pets/boba/pet.json
cd pets/boba && shasum -a 256 manifest.json spritesheet.webp
# Read + merge registry.json, add boba entry
```

## Common pitfalls

- **Renderer crash `Cannot read properties of undefined (reading 'idle')`** — `rowMap` missing or incomplete. Write all 8 states explicitly.
- **Pet's name shows as the slug** — used `displayName` instead of `name`.
- **`spritesheet file not found`** — `spritesheet.file` doesn't match the actual filename on disk (e.g., manifest says `.png` but file is `.webp`).
- **Pet doesn't appear in tray** — not registered. Step 8.
- **Wrong animation for a state** (e.g., jump plays "review") — used `CODEX_DEFAULT_ROW_MAP` order from `atlas-spec.ts` instead of the canonical petdex order in step 5.
- **Overwrote the registry** — always Read first, then Write the merged result. Existing pets must be preserved.
