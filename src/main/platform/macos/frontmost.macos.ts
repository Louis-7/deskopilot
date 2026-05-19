import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { EventSource } from '../source';
import type { RawSignal } from '@shared/types';
import { getLogger } from '../../logger';

const log = getLogger('frontmost');

const exec = promisify(execFile);
const POLL_MS = 2_000;

/**
 * Reads the frontmost app's bundleId via `lsappinfo`, which works without any
 * Privacy permissions on macOS (active-win@8 was rejected because it requires
 * Screen Recording — too invasive for just reading a bundleId).
 *
 * Two-call protocol:
 *   1. `lsappinfo front`  → returns the app's ASN (e.g. "ASN:0x0-0xa1a01a:")
 *   2. `lsappinfo info -only bundleID <ASN>` → returns "CFBundleIdentifier"="com.foo"
 */
export class FrontmostSourceMacOS implements EventSource {
  readonly id = 'frontmost';
  readonly supportedPlatforms = ['macos'] as const;

  private timer: NodeJS.Timeout | null = null;
  private lastBundleId: string | null = null;

  async start(emit: (signal: RawSignal) => void): Promise<void> {
    const poll = async () => {
      try {
        const bundleId = await readFrontmostBundleId();
        if (!bundleId || bundleId === this.lastBundleId) return;
        this.lastBundleId = bundleId;
        emit({
          source: this.id,
          timestamp: Date.now(),
          payload: { bundleId },
        });
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
  }
}

async function readFrontmostBundleId(): Promise<string | null> {
  const { stdout: asnRaw } = await exec('/usr/bin/lsappinfo', ['front']);
  const asn = asnRaw.trim();
  if (!asn) return null;

  const { stdout } = await exec('/usr/bin/lsappinfo', ['info', '-only', 'bundleID', asn]);
  // Example output:  "CFBundleIdentifier"="com.apple.Terminal"
  const m = stdout.match(/"CFBundleIdentifier"="([^"]+)"/);
  return m ? m[1] ?? null : null;
}
