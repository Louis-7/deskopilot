import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { EventSource } from '../source';
import type { RawSignal } from '@shared/types';
import { getLogger } from '../../logger';

const log = getLogger('ai-agent');

const execFileAsync = promisify(execFile);

const POLL_MS = 2_000;
const NETTOP_TIMEOUT_MS = 5_000;

// Process-name → friendly agent name. Matching is case-insensitive against
// the truncated process name nettop reports (~15 chars, e.g. `Cursor Helper.`).
// Anchored regexes on short common words (claude/codex/gemini) avoid matching
// unrelated processes whose names happen to contain those substrings.
const AGENT_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /^claude/i,   name: 'claude' },      // Claude Code CLI
  { pattern: /^codex/i,    name: 'codex' },       // Codex CLI
  { pattern: /cursor/i,    name: 'cursor' },      // Cursor IDE + helpers
  { pattern: /^gemini/i,   name: 'gemini' },      // Gemini CLI
  { pattern: /antigrav/i,  name: 'antigravity' }, // Google Antigravity desktop app
  { pattern: /copilot/i,   name: 'copilot' },     // Standalone Copilot helper
  { pattern: /ollama/i,    name: 'ollama' },      // Local LLM server
  { pattern: /^aider/i,    name: 'aider' },       // aider CLI
  { pattern: /^continue/i, name: 'continue' },    // Continue.dev
];

function classify(processName: string): string | null {
  for (const { pattern, name } of AGENT_PATTERNS) {
    if (pattern.test(processName)) return name;
  }
  return null;
}

/**
 * Samples per-process network bytes (inbound + outbound) via `nettop` and
 * emits an `ai-agent` RawSignal. We sum both directions because a model
 * exchange is brief outbound (the prompt POST) followed by a longer inbound
 * stream (the generated response); watching either axis alone misses half
 * the conversation.
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
      // No `-t external` filter: nettop excludes processes that have no
      // currently-active external route at sample time, which dropped
      // long-lived HTTP/2 keep-alive clients (e.g. Claude Code) even though
      // their lifetime byte counters were large. Non-AI processes that pass
      // through this snapshot are filtered out later by classify().
      ['-P', '-L', '1', '-J', 'bytes_in,bytes_out', '-x'],
      { timeout: NETTOP_TIMEOUT_MS },
    );
    const out = new Map<string, number>();
    for (const line of stdout.split('\n')) {
      const parts = line.split(',');
      // Format: name.PID,bytes_in,bytes_out,
      if (parts.length < 3) continue;
      const key = parts[0]?.trim();
      const bytesIn = Number(parts[1]);
      const bytesOut = Number(parts[2]);
      if (!key || !Number.isFinite(bytesIn) || !Number.isFinite(bytesOut)) continue;
      out.set(key, bytesIn + bytesOut);
    }
    return out;
  }
}
