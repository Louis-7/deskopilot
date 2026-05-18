# deskopilot

A desktop pet that reacts to what's happening on your machine: typing bursts,
AI coding agents working in the background, network activity, app focus
changes.

macOS first. Windows planned.

Inspired by the [Codex Pets](https://github.com/codex-pets/codex-pets) ecosystem
— pet packages use the same 8×9 / 192×208 sprite-sheet atlas, so existing
Codex pets work as-is. Unlike Codex Pets, deskopilot owns the event→animation
table; pet packages are pure art.

## What it does

| Trigger | Pet reaction |
|---|---|
| You start typing | `greet` |
| Claude Code / Cursor / Copilot / Codex / Gemini are crunching | `working` |
| AI agent stops crunching | `success` |
| Network burst (>5 MB/s) | `jump` |
| 5+ minutes with no input | `waiting` |

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
│   └── pets/                   # loader + installer + registry
├── renderer/                   # Layer 3 (Electron renderer + PixiJS)
│   ├── state-machine.ts        # pure reducer
│   ├── animator.ts             # frame advancement
│   └── pet-stage.ts            # PixiJS Application
├── preload/                    # contextBridge
└── shared/                     # types, atlas spec, IPC constants
pets/
└── default/                    # built-in pet (placeholder atlas)
```

## Run

```bash
npm install
npm run dev            # real macOS sources (will prompt for Input Monitoring)
DESKOPILOT_MOCK_SOURCES=1 npm run dev   # no OS perms; mock keyboard only
npm test               # vitest, ~100 tests covering reducer + rules + loader
npm run typecheck
npm run build          # produces out/
npx electron-builder   # produces dist/*.dmg
```

Devtools hooks (in the renderer console):

```js
pet.state()                                   // current PetState
pet.setState('working')                       // force a state for visual checks
pet.dispatch({ kind: 'user-typing', intensity: 'heavy' })
```

## Pet packages

deskopilot loads pets from:

- **Built-in**: `pets/default/` in the repo (or `Contents/Resources/pets/`
  when packaged).
- **User**: `~/Library/Application Support/deskopilot/pets/<id>/`.

A pet package is two files:

```
<pet-id>/
├── manifest.json
└── spritesheet.png    (or .webp)
```

`manifest.json` is compatible with Codex Pets' `pet.json` — drop in any 8×9 /
192×208 pet from [petdex](https://github.com/crafter-station/petdex) and it
works. Manifests **may not** contain `transitions`, `events`, `triggers`,
`eventMap`, or `onEvent` fields — those are app concerns, not pet-author
concerns, and the loader rejects packages that try.

Generate the built-in placeholder atlas (8×9 grid of colored circles labeled
`row.col`, useful for verifying animation switches):

```bash
node scripts/gen-default-atlas.mjs
```

## macOS permissions

| Source | Permission | First-run UX |
|---|---|---|
| `keyboard` | Input Monitoring | Prompt the first time a key is pressed with the app focused. Until granted, the typing rule silently no-ops (no crash). |
| `frontmost` | none | Uses `lsappinfo` — no permission needed. |
| `ai-agent` | none | Uses `ps` via `systeminformation`. |
| `network` | none | Uses `systeminformation.networkStats()`. |

The unsigned DMG triggers Gatekeeper on first launch — right-click the .app →
Open.

## Status

v1 complete: all eight milestones (M0–M7) shipped. 97 vitest cases passing.

Not yet:

- Windows platform sources
- Speech bubbles
- Pet marketplace / online installs
- MCP control surface for AI agents
- Code signing + notarization

## License

MIT — see [LICENSE](LICENSE).
