// Re-export the EventSource type for nicer imports from main/platform/*.
// The contract itself lives in @shared/types so layer-3 stays platform-free.
export type { EventSource } from '@shared/types';
