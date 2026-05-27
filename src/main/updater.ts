import { app, dialog } from 'electron';
import { autoUpdater, type UpdateInfo } from 'electron-updater';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { getLogger } from './logger';
import { loadSettings, updateSettings } from './settings';

const DEV_UPDATE_CONFIG = 'dev-app-update.yml';

const log = getLogger('updater');

let initialized = false;
let currentCheckSilent = true;

function describeReleaseNotes(notes: UpdateInfo['releaseNotes']): string {
  if (!notes) return '';
  if (typeof notes === 'string') return notes.replace(/<[^>]+>/g, '').trim();
  return notes
    .map((n) => (typeof n === 'string' ? n : `${n.version}\n${n.note ?? ''}`))
    .join('\n\n')
    .replace(/<[^>]+>/g, '')
    .trim();
}

function devUpdateConfigPath(): string | null {
  const path = join(app.getAppPath(), DEV_UPDATE_CONFIG);
  return existsSync(path) ? path : null;
}

export async function initUpdater(): Promise<void> {
  if (initialized) return;
  initialized = true;

  autoUpdater.logger = log as unknown as Console;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  const settings = await loadSettings();
  autoUpdater.allowPrerelease = settings.update.allowPrerelease;

  if (!app.isPackaged) {
    const devCfg = devUpdateConfigPath();
    if (devCfg) {
      autoUpdater.updateConfigPath = devCfg;
      autoUpdater.forceDevUpdateConfig = true;
      log.info(`dev update config enabled: ${devCfg}`);
    }
  }

  autoUpdater.on('update-available', (info) => {
    void onUpdateAvailable(info);
  });

  autoUpdater.on('update-not-available', (info) => {
    log.info('no update available', info?.version);
    if (currentCheckSilent) return;
    void dialog.showMessageBox({
      type: 'info',
      message: "You're up to date",
      detail: `Deskopilot ${app.getVersion()} is the latest version.`,
      buttons: ['OK'],
      defaultId: 0,
    });
  });

  autoUpdater.on('download-progress', (p) => {
    log.info(`download ${p.percent.toFixed(1)}% (${p.transferred}/${p.total})`);
  });

  autoUpdater.on('update-downloaded', (info) => {
    void onUpdateDownloaded(info);
  });

  autoUpdater.on('error', (err) => {
    log.error('autoUpdater error:', err);
    if (currentCheckSilent) return;
    void dialog.showMessageBox({
      type: 'error',
      message: 'Update check failed',
      detail: err?.message ?? String(err),
      buttons: ['OK'],
      defaultId: 0,
    });
  });
}

async function onUpdateAvailable(info: UpdateInfo): Promise<void> {
  const settings = await loadSettings();
  if (currentCheckSilent && info.version === settings.update.skippedVersion) {
    log.info(`silent check: user skipped ${info.version}, suppressing dialog`);
    return;
  }

  const notes = describeReleaseNotes(info.releaseNotes);
  const detail =
    `Version ${info.version} is available. You are on ${app.getVersion()}.` +
    (notes ? `\n\nRelease notes:\n${notes}` : '');

  const { response } = await dialog.showMessageBox({
    type: 'info',
    message: 'A new version of Deskopilot is available',
    detail,
    buttons: ['Cancel', 'Skip This Version', 'Download'],
    defaultId: 2,
    cancelId: 0,
  });

  if (response === 1) {
    await updateSettings({ update: { skippedVersion: info.version } });
    log.info(`user skipped version ${info.version}`);
  } else if (response === 2) {
    log.info(`user accepted download of ${info.version}`);
    try {
      await autoUpdater.downloadUpdate();
    } catch (err) {
      log.error('downloadUpdate failed:', err);
    }
  } else {
    log.info(`user dismissed update prompt for ${info.version}`);
  }
}

async function onUpdateDownloaded(info: UpdateInfo): Promise<void> {
  const { response } = await dialog.showMessageBox({
    type: 'info',
    message: `Deskopilot ${info.version} is ready to install`,
    detail: 'The update will be applied the next time you quit. Install now to apply it immediately.',
    buttons: ['Later', 'Install and Restart'],
    defaultId: 1,
    cancelId: 0,
  });

  if (response === 1) {
    log.info('user chose to install now; quitting');
    autoUpdater.quitAndInstall();
  } else {
    log.info('user deferred install until next quit');
  }
}

export async function checkForUpdates(opts: { silent: boolean }): Promise<void> {
  if (!app.isPackaged && !devUpdateConfigPath()) {
    log.info('checkForUpdates: skipped (no dev-app-update.yml in dev mode)');
    if (!opts.silent) {
      await dialog.showMessageBox({
        type: 'info',
        message: 'Update checks are disabled in development',
        detail: `Add ${DEV_UPDATE_CONFIG} at the project root to enable dev-mode update testing.`,
        buttons: ['OK'],
        defaultId: 0,
      });
    }
    return;
  }

  currentCheckSilent = opts.silent;
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    log.error('checkForUpdates failed:', err);
  }
}
