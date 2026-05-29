import { powerSaveBlocker } from 'electron';
import { currentPlatform } from '@shared/platform';
import type { MouseJiggle } from './platform/jiggle';
import { MouseJiggleMacOS } from './platform/macos/jiggle.macos';
import { getLogger } from './logger';

const log = getLogger('caffeinate');

const JIGGLE_INTERVAL_MS = 60_000;

function getMouseJiggle(): MouseJiggle | null {
  const platform = currentPlatform();
  if (platform === 'macos') return new MouseJiggleMacOS();
  return null;
}

let preventSleepId: number | null = null;
let jiggleTimer: NodeJS.Timeout | null = null;
let jiggler: MouseJiggle | null = null;

export function isPreventingSleep(): boolean {
  return preventSleepId !== null;
}

export function startPreventSleep(): void {
  if (preventSleepId !== null) return;
  preventSleepId = powerSaveBlocker.start('prevent-display-sleep');
  log.info('prevent-sleep started, id=%d', preventSleepId);
}

export function stopPreventSleep(): void {
  if (preventSleepId === null) return;
  powerSaveBlocker.stop(preventSleepId);
  log.info('prevent-sleep stopped, id=%d', preventSleepId);
  preventSleepId = null;
}

export function isKeepingActive(): boolean {
  return jiggleTimer !== null;
}

export function startKeepActive(): void {
  if (jiggleTimer !== null) return;
  jiggler = getMouseJiggle();
  if (!jiggler) {
    log.warn('keep-active not supported on this platform');
    return;
  }
  jiggler.jiggle();
  const j = jiggler;
  jiggleTimer = setInterval(() => j.jiggle(), JIGGLE_INTERVAL_MS);
  log.info('keep-active started (interval=%dms)', JIGGLE_INTERVAL_MS);
}

export function stopKeepActive(): void {
  if (jiggleTimer === null) return;
  clearInterval(jiggleTimer);
  jiggleTimer = null;
  jiggler = null;
  log.info('keep-active stopped');
}

export function stopAll(): void {
  stopPreventSleep();
  stopKeepActive();
}
