import type { Platform } from './platform';

// =============================================================================
// Layer 1 → Layer 2 : RawSignal
// =============================================================================
// Platform-specific sources emit RawSignals. The shape of `payload` is private
// to a (source, rule) pair — the interpreter rules know how to read them.

export interface RawSignal {
  source: string;
  timestamp: number;
  payload: Readonly<Record<string, unknown>>;
}

export interface EventSource {
  readonly id: string;
  readonly supportedPlatforms: readonly Platform[];
  start(emit: (signal: RawSignal) => void): Promise<void>;
  stop(): Promise<void>;
}

// =============================================================================
// Layer 2 → Layer 3 : PetIntent (semantic, platform-agnostic)
// =============================================================================
// The state machine only ever sees these. It does not know typing comes from a
// keyboard or AI activity comes from a process scan.

export type PetIntent =
  | { kind: 'user-typing'; intensity: 'light' | 'heavy' }
  | { kind: 'ai-working'; agent?: string }
  | { kind: 'ai-finished' }
  | { kind: 'context-switch'; toBundleId: string }
  | { kind: 'network-burst' }
  | { kind: 'idle-too-long' }
  | { kind: 'celebrate' }
  | { kind: 'oops' }
  // Internal — emitted by the animator when a one-shot animation finishes,
  // so the reducer can transition out of a NON_INTERRUPTIBLE state.
  | { kind: 'animation-finished'; from: PetState };

export type PetIntentKind = PetIntent['kind'];

// A Rule sees a sliding window of RawSignals it subscribed to, and may emit
// one PetIntent (or null) per evaluation tick.
export interface Rule {
  readonly id: string;
  readonly subscribes: readonly string[]; // RawSignal.source values
  evaluate(window: readonly RawSignal[], now: number): PetIntent | null;
}

// =============================================================================
// Layer 3 : PetState + Reducer (pure)
// =============================================================================

export type PetState =
  | 'idle'
  | 'greet'
  | 'working'
  | 'waiting'
  | 'review'
  | 'failed'
  | 'success'
  | 'jump';

export type Reducer = (state: PetState, intent: PetIntent) => PetState;

// States that play their full loop before they can be overridden by a new
// intent. The animator emits `animation-finished` when the loop completes.
export const NON_INTERRUPTIBLE: ReadonlySet<PetState> = new Set([
  'greet',
  'jump',
  'success',
  'failed',
]);

// =============================================================================
// Pet manifest (input to the loader)
// =============================================================================
// Compatible with Codex Pets `pet.json` — fields the loader fills with defaults
// if absent are noted. See src/main/pets/loader.ts.

export interface PetManifest {
  $schema?: string;
  id: string;
  name: string;
  version?: string;
  author?: string;
  spritesheet: SpritesheetSpec;
  compat?: { codexPets?: boolean };
}

export interface SpritesheetSpec {
  file: string;
  cols: number;
  rows: number;
  frameWidth: number;
  frameHeight: number;
  rowMap: Partial<Record<PetState, AnimationRow>>;
}

export interface AnimationRow {
  row: number;
  frames: number;
  loopMs: number;
}

// =============================================================================
// IPC channel names (used by both main and renderer)
// =============================================================================

export const IPC = {
  IntentToRenderer: 'deskopilot:intent',
  LoadPet: 'deskopilot:load-pet',
  DevtoolsIntent: 'deskopilot:devtools-intent', // for manual injection in dev
} as const;

// =============================================================================
// API surface exposed on window.deskopilot by the preload script.
// Defined here so the renderer doesn't have to import the preload file
// (which would drag `electron` into the renderer bundle).
// =============================================================================

export interface LoadPetMessage {
  petId: string;
}

export interface DeskopilotApi {
  onIntent(handler: (intent: PetIntent) => void): () => void;
  onLoadPet(handler: (msg: LoadPetMessage) => void): () => void;
  devSendIntent(intent: PetIntent): void;
}
