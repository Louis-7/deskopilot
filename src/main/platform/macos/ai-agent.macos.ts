import si from 'systeminformation';
import type { EventSource } from '../source';
import type { RawSignal } from '@shared/types';

const POLL_MS = 2_000;

// Process-name → friendly agent name. Anything not on this list is ignored.
// Matching is case-insensitive substring on the process command name.
const AGENT_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /claude/i, name: 'claude' },
  { pattern: /codex/i, name: 'codex' },
  { pattern: /\bcursor\b/i, name: 'cursor' },
  { pattern: /copilot/i, name: 'copilot' },
  { pattern: /gemini/i, name: 'gemini' },
];

function classify(processName: string): string | null {
  for (const { pattern, name } of AGENT_PATTERNS) {
    if (pattern.test(processName)) return name;
  }
  return null;
}

/**
 * Samples running processes and emits an `ai-agent` RawSignal listing any
 * known AI assistant processes and their current CPU%. The interpreter's
 * ai-activity rule turns this into ai-working / ai-finished intents.
 *
 * No special macOS permissions are needed — uses `ps` under the hood.
 */
export class AiAgentSourceMacOS implements EventSource {
  readonly id = 'ai-agent';
  readonly supportedPlatforms = ['macos'] as const;

  private timer: NodeJS.Timeout | null = null;

  async start(emit: (signal: RawSignal) => void): Promise<void> {
    const poll = async () => {
      try {
        const procs = await si.processes();
        const seen = new Map<string, number>();
        for (const p of procs.list) {
          const name = classify(p.name ?? '') ?? classify(p.command ?? '');
          if (!name) continue;
          const cpu = typeof p.cpu === 'number' ? p.cpu : 0;
          // Aggregate by agent (some agents fork worker processes)
          seen.set(name, Math.max(seen.get(name) ?? 0, cpu));
        }
        const agents = [...seen.entries()].map(([name, cpu]) => ({ name, cpu }));
        emit({
          source: this.id,
          timestamp: Date.now(),
          payload: { agents },
        });
      } catch (err) {
        console.warn('[ai-agent] poll failed:', (err as Error).message);
      }
    };
    await poll();
    this.timer = setInterval(poll, POLL_MS);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
