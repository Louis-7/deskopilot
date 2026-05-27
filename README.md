# deskopilot

A desktop pet that reacts to what's happening on your machine: typing bursts,
AI coding agents working in the background, network activity, idle stretches.

macOS first. Windows planned.

Inspired by the [Codex Pets](https://github.com/codex-pets/codex-pets) ecosystem
— the loader accepts Codex-format `pet.json` manifests, so existing pets from
[petdex](https://github.com/crafter-station/petdex) work as-is. Unlike Codex
Pets, deskopilot owns the event→animation table; pet packages are pure art.

## What it does

| Trigger | Pet state |
|---|---|
| You start typing | `typing` |
| Claude Code / Cursor / Copilot / Codex / Gemini are crunching | `working` |
| AI agent finishes | `success` |
| Network burst (>5 MB/s) | `busy` |
| Extended idle (no input) | `waiting` |

States `typing`, `busy`, `success`, and `failed` are one-shot — they play
their full animation loop before the pet returns to `idle`.

All event→animation mapping lives in `src/renderer/state-machine.ts`.

## Architecture

Three layers. Each future change touches only one of them.

```
  ┌────────────────────────────────────────────────────────┐
  │ Layer 3 — State machine + PixiJS renderer              │
  │   reduce(PetState, PetIntent) → PetState  (pure)       │
  └────────────────────────────────────────────────────────┘
                        ▲ PetIntent
  ┌────────────────────────────────────────────────────────┐
  │ Layer 2 — Interpreter + rules (platform-agnostic)      │
  │   RawSignal stream  → PetIntent stream                 │
  └────────────────────────────────────────────────────────┘
                        ▲ RawSignal
  ┌────────────────────────────────────────────────────────┐
  │ Layer 1 — Platform event sources (macOS / Windows)     │
  │   keyboard · frontmost · ai-agent · network            │
  └────────────────────────────────────────────────────────┘
```

| Change | Files to edit |
|---|---|
| Add Windows support | `src/main/platform/windows/*` only |
| Add a new event source (mouse, calendar, …) | `platform/<os>/*` + new `interpreter/rules/*.rule.ts` |
| Change pet behavior | `src/renderer/state-machine.ts` only |
| Swap render engine (PixiJS → three.js) | `src/renderer/pet-stage.ts` + `animator.ts` only |

Layer-3 contracts: see `src/shared/types.ts`.

## Project layout

```
src/
├── main/                       # Electron main process
│   ├── platform/               # Layer 1
│   │   ├── source.ts           # EventSource interface
│   │   ├── registry.ts         # platform → sources dispatch
│   │   ├── macos/              # macOS implementations
│   │   └── mock/               # for dev without OS permissions
│   ├── interpreter/            # Layer 2
│   │   ├── interpreter.ts      # sliding-window tick loop
│   │   └── rules/              # one file per rule
│   ├── pets/                   # loader, installer, registry
│   ├── updater.ts              # electron-updater auto-update
│   ├── settings.ts             # persisted user settings
│   └── tray.ts                 # system tray menu (pet picker, updates)
├── renderer/                   # Layer 3 (Electron renderer + PixiJS)
│   ├── state-machine.ts        # pure reducer
│   ├── animator.ts             # frame advancement
│   └── pet-stage.ts            # PixiJS Application
├── preload/                    # contextBridge
└── shared/                     # types, atlas spec, IPC constants
pets/
├── calico/                     # default pet (bundled in release builds)
├── boba/                       # additional built-in pets
├── doraemon/
├── pingu/
└── default/                    # placeholder atlas for development
```

## Run

```bash
npm install
npm run dev            # real macOS sources (will prompt for Input Monitoring)
DESKOPILOT_MOCK_SOURCES=1 npm run dev   # no OS perms; mock keyboard only
npm test               # vitest, 97 tests covering reducer + rules + loader
npm run typecheck
npm run build          # produces out/
npm run dist           # builds + packages (produces build/*.dmg and build/*.zip)
```

Devtools hooks (in the renderer console):

```js
window.deskopilot                              // the full API object
// inject an intent manually:
window.deskopilot.devSendIntent({ kind: 'user-typing', intensity: 'heavy' })
```

## Pet packages

deskopilot loads pets from:

- **Built-in**: `pets/` in the repo (or `Contents/Resources/pets/` when
  packaged).
- **User-installed**: `~/Library/Application Support/deskopilot/pets/<id>/`.

Switch the active pet via the system tray menu.

A pet package is two files:

```
<pet-id>/
├── manifest.json        (or pet.json for Codex-format pets)
└── spritesheet.webp     (or .png)
```

The manifest declares a spritesheet grid and maps each `PetState` to a row.
Pet authors can use any grid size and frame dimensions. Here is a minimal
example:

```json
{
  "id": "calico",
  "name": "Calico",
  "spritesheet": {
    "file": "spritesheet.webp",
    "cols": 9,
    "rows": 7,
    "frameWidth": 192,
    "frameHeight": 192,
    "rowMap": {
      "idle":    { "row": 0, "frames": 8, "loopMs": 1600 },
      "typing":  { "row": 1, "frames": 9, "loopMs": 1800 },
      "working": { "row": 2, "frames": 9, "loopMs": 1800 },
      "waiting": { "row": 3, "frames": 9, "loopMs": 1800 },
      "busy":    { "row": 4, "frames": 9, "loopMs": 1800 },
      "failed":  { "row": 5, "frames": 9, "loopMs": 1800 },
      "success": { "row": 6, "frames": 9, "loopMs": 1800 }
    }
  }
}
```

Codex-format `pet.json` manifests are also accepted — the loader fills in
defaults (8×9 grid, 192×208 frames) and translates Codex state names
(`greet` → `typing`, `jump` → `busy`, etc.) automatically. Drop in any pet
from [petdex](https://github.com/crafter-station/petdex) and it works.

Manifests **may not** contain `transitions`, `events`, `triggers`, `eventMap`,
or `onEvent` fields — those are app concerns, not pet-author concerns, and the
loader rejects packages that try.

Pets can also be installed from a `.zip` file or folder via the installer API
(`src/main/pets/installer.ts`).

Generate the built-in placeholder atlas (8×9 grid of colored circles labeled
`row.col`, useful for verifying animation switches):

```bash
node scripts/gen-default-atlas.mjs
```

## Auto-update

The app checks for updates via GitHub Releases using `electron-updater`. The
tray menu shows update status and lets the user download and install new
versions.

To test updates in dev mode:

```bash
cp dev-app-update.yml.example dev-app-update.yml
# Lower the version in package.json so a published release appears as "newer"
npm run dev
# Use the tray → "Check for Updates…" item
```

## Release

```bash
./scripts/release.sh <version|patch|minor|major> <tag>
# e.g. ./scripts/release.sh patch v0.1.1
```

The script bumps `package.json`, commits, and creates an annotated git tag.
Builds are code-signed and notarized for macOS (`scripts/notarize.cjs`,
`scripts/staple.cjs`).

## macOS permissions

| Source | Permission | First-run UX |
|---|---|---|
| `keyboard` | Input Monitoring | Prompt the first time a key is pressed with the app focused. Until granted, the typing rule silently no-ops (no crash). |
| `frontmost` | none | Uses `lsappinfo` — no permission needed. |
| `ai-agent` | none | Uses `ps` via `systeminformation`. |
| `network` | none | Uses `systeminformation.networkStats()`. |

## Status

v0.0.1 released. 97 vitest cases passing.

Not yet:

- Windows platform sources
- Speech bubbles
- Pet marketplace / online installs
- MCP control surface for AI agents

## License

MIT — see [LICENSE](LICENSE).
