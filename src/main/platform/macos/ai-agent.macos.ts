import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { EventSource } from '../source';
import type { RawSignal } from '@shared/types';
import { getLogger } from '../../logger';

const log = getLogger('ai-agent');

const execFileAsync = promisify(execFile);

const POLL_MS = 2_000;
const NETTOP_TIMEOUT_MS = 5_000;

// Process-name → friendly agent name. Matching is case-insensitive substring
// on the truncated process name nettop reports (e.g., `Cursor Helper.71973`).
const AGENT_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /claude/i, name: 'claude' },
  { pattern: /codex/i, name: 'codex' },
  { pattern: /cursor/i, name: 'cursor' },
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
 * Samples per-process outbound network bytes via `nettop` and emits an
 * `ai-agent` RawSignal containing AI tool processes whose egress rate
 * indicates an active request to a model API. Idle AI tools (Cursor open
 * but not generating) produce near-zero traffic and won't trigger.
 *
 * No special macOS permissions are needed — `nettop` works for the current
 * user's own processes.
 */
export class AiAgentSourceMacOS implements EventSource {
  readonly id = 'ai-agent';
  readonly supportedPlatforms = ['macos'] as const;

  private timer: NodeJS.Timeout | null = null;
  private lastBytes = new Map<string, number>();
  private lastSampleAt: number | null = null;

  async start(emit: (signal: RawSignal) => void): Promise<void> {
    const poll = async () => {
      try {
        const now = Date.now();
        const snapshot = await this.sample();

        if (this.lastSampleAt !== null) {
          const dtSec = Math.max((now - this.lastSampleAt) / 1000, 0.001);
          const byAgent = new Map<string, number>();
          for (const [key, bytes] of snapshot) {
            const prev = this.lastBytes.get(key);
            if (prev === undefined) continue;
            const delta = bytes - prev;
            if (delta <= 0) continue;
            const procName = key.replace(/\.\d+$/, '');
            const agent = classify(procName);
            if (!agent) continue;
            byAgent.set(agent, (byAgent.get(agent) ?? 0) + delta / dtSec);
          }
          const agents = [...byAgent.entries()].map(([name, bytesPerSec]) => ({
            name,
            bytesPerSec,
          }));
          emit({ source: this.id, timestamp: now, payload: { agents } });
        }

        this.lastBytes = snapshot;
        this.lastSampleAt = now;
      } catch (err) {
        log.warn('poll failed:', (err as Error).message);
      }
    };
    await poll();
    this.timer = setInterval(poll, POLL_MS);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.lastBytes.clear();
    this.lastSampleAt = null;
  }

  private async sample(): Promise<Map<string, number>> {
    const { stdout } = await execFileAsync(
      'nettop',
      ['-P', '-L', '1', '-J', 'bytes_out', '-x', '-t', 'external'],
      { timeout: NETTOP_TIMEOUT_MS },
    );
    const out = new Map<string, number>();
    for (const line of stdout.split('\n')) {
      const parts = line.split(',');
      if (parts.length < 2) continue;
      const key = parts[0]?.trim();
      const bytes = Number(parts[1]);
      if (!key || !Number.isFinite(bytes)) continue;
      out.set(key, bytes);
    }
    return out;
  }
}
