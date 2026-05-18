import type { PetIntent, RawSignal, Rule } from '@shared/types';

const ACTIVE_WINDOW_MS = 3_000;
const IDLE_THRESHOLD_MS = 10_000;
const CPU_THRESHOLD = 10;

// Stateful: we remember whether we recently said "ai-working" so we can fire
// "ai-finished" exactly once when activity stops, rather than every tick.
let lastWasWorking = false;

interface AgentSample {
  name: string;
  cpu: number;
}

export const aiActivityRule: Rule = {
  id: 'ai-activity',
  subscribes: ['ai-agent'],
  evaluate(window: readonly RawSignal[], now: number): PetIntent | null {
    const aiSignals = window.filter((s) => s.source === 'ai-agent');
    if (aiSignals.length === 0) {
      // No data yet — neither working nor finished.
      return null;
    }

    const recent = aiSignals.filter((s) => now - s.timestamp <= ACTIVE_WINDOW_MS);
    const hotAgents = recent.flatMap((s) => extractAgents(s.payload))
      .filter((a) => a.cpu >= CPU_THRESHOLD);

    if (hotAgents.length > 0) {
      lastWasWorking = true;
      const pick = hotAgents[0];
      const intent: PetIntent = pick
        ? { kind: 'ai-working', agent: pick.name }
        : { kind: 'ai-working' };
      return intent;
    }

    // No hot agents recently — has it been long enough to call it finished?
    const newestActivity = aiSignals[aiSignals.length - 1];
    if (!newestActivity) return null;
    const sinceLastActive = now - newestActivity.timestamp;
    if (lastWasWorking && sinceLastActive >= IDLE_THRESHOLD_MS) {
      lastWasWorking = false;
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
    const cpu = typeof o['cpu'] === 'number' ? o['cpu'] : null;
    if (name && cpu !== null) out.push({ name, cpu });
  }
  return out;
}

// Test seam: reset the rule's stateful flag between test cases.
export function _resetAiActivityRule(): void {
  lastWasWorking = false;
}
