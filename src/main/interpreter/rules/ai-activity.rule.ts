import type { PetIntent, RawSignal, Rule } from '@shared/types';

const ACTIVE_WINDOW_MS = 3_000;
const IDLE_THRESHOLD_MS = 10_000;
// Total network throughput (bytes_in + bytes_out) for AI tools while actively
// exchanging with a model. Cursor's background telemetry/sync sits around
// 3 KB/s even when idle, so we sit above that floor.
const BYTES_PER_SEC_THRESHOLD = 5_000;

// Stateful: we remember whether we recently said "ai-working" and when the
// last hot sample was seen, so we can fire "ai-finished" exactly once after
// activity quiets down. We can't infer "quiet" from the newest signal alone
// because the source emits a heartbeat every poll even with zero traffic.
let lastWasWorking = false;
let lastHotAt: number | null = null;

interface AgentSample {
  name: string;
  bytesPerSec: number;
}

export const aiActivityRule: Rule = {
  id: 'ai-activity',
  subscribes: ['ai-agent'],
  evaluate(window: readonly RawSignal[], now: number): PetIntent | null {
    const aiSignals = window.filter((s) => s.source === 'ai-agent');
    if (aiSignals.length === 0) {
      return null;
    }

    const recent = aiSignals.filter((s) => now - s.timestamp <= ACTIVE_WINDOW_MS);
    const hotAgents = recent
      .flatMap((s) => extractAgents(s.payload))
      .filter((a) => a.bytesPerSec >= BYTES_PER_SEC_THRESHOLD);

    if (hotAgents.length > 0) {
      lastWasWorking = true;
      lastHotAt = now;
      const pick = hotAgents[0];
      const intent: PetIntent = pick
        ? { kind: 'ai-working', agent: pick.name }
        : { kind: 'ai-working' };
      return intent;
    }

    if (lastWasWorking && lastHotAt !== null && now - lastHotAt >= IDLE_THRESHOLD_MS) {
      lastWasWorking = false;
      lastHotAt = null;
      return { kind: 'ai-finished' };
    }
    return null;
  },
};

function extractAgents(payload: Readonly<Record<string, unknown>>): AgentSample[] {
  const raw = payload['agents'];
  if (!Array.isArray(raw)) return [];
  const out: AgentSample[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const o = entry as Record<string, unknown>;
    const name = typeof o['name'] === 'string' ? o['name'] : null;
    const bytesPerSec = typeof o['bytesPerSec'] === 'number' ? o['bytesPerSec'] : null;
    if (name && bytesPerSec !== null) out.push({ name, bytesPerSec });
  }
  return out;
}

// Test seam: reset the rule's stateful flag between test cases.
export function _resetAiActivityRule(): void {
  lastWasWorking = false;
  lastHotAt = null;
}
