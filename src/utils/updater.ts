import { check, Update } from '@tauri-apps/plugin-updater';

export interface AppUpdateInfo {
  available: boolean;
  currentVersion: string;
  version: string;
  date?: string;
  body?: string;
  rawUpdate?: Update;
}

const AUTO_CHECK_KEY = 'rmoney_auto_check_updates';
const LAST_CHECK_KEY = 'rmoney_last_update_check';

export function isAutoCheckEnabled(): boolean {
  const val = localStorage.getItem(AUTO_CHECK_KEY);
  return val === null ? true : val === 'true';
}

export function setAutoCheckEnabled(enabled: boolean): void {
  localStorage.setItem(AUTO_CHECK_KEY, String(enabled));
}

export function getLastCheckTime(): string | null {
  return localStorage.getItem(LAST_CHECK_KEY);
}

export function recordCheckTime(): void {
  localStorage.setItem(LAST_CHECK_KEY, new Date().toISOString());
}

/**
 * Checks configured endpoints for new releases using @tauri-apps/plugin-updater
 */
export async function checkForUpdates(isManual: boolean = false): Promise<AppUpdateInfo | null> {
  recordCheckTime();

  try {
    const update = await check();
    if (update && update.available) {
      return {
        available: true,
        currentVersion: update.currentVersion,
        version: update.version,
        date: update.date,
        body: update.body || 'This update includes functional improvements, security patches, and performance optimizations.',
        rawUpdate: update,
      };
    }
    return null;
  } catch (error) {
    // In dev mode, browser mode, or offline, Tauri updater check may fail gracefully
    console.warn('[rMoney Updater] Check failed or running in non-packaged environment:', error);
    if (isManual) {
      throw error;
    }
    return null;
  }
}

/**
 * Downloads and installs the given update with progress reporting
 */
export async function installAppUpdate(
  update: Update,
  onProgress?: (progressPct: number, downloadedBytes: number, totalBytes?: number) => void
): Promise<void> {
  let totalLength = 0;
  let downloadedLength = 0;

  await update.download((event) => {
    if (event.event === 'Started') {
      totalLength = event.data.contentLength || 0;
      if (onProgress) onProgress(0, 0, totalLength);
    } else if (event.event === 'Progress') {
      downloadedLength += event.data.chunkLength;
      const pct = totalLength > 0 ? Math.min(100, Math.round((downloadedLength / totalLength) * 100)) : 50;
      if (onProgress) onProgress(pct, downloadedLength, totalLength);
    } else if (event.event === 'Finished') {
      if (onProgress) onProgress(100, downloadedLength, totalLength);
    }
  });

  await update.install({ restartAfterInstall: true });
}

/**
 * Generates a mock update object for test preview in development or demonstration
 */
export function getMockUpdate(): AppUpdateInfo {
  return {
    available: true,
    currentVersion: '0.1.0',
    version: '0.2.0',
    date: new Date().toISOString(),
    body: '### What’s New in rMoney v0.2.0\n• Bank-grade database encryption at rest (SQLCipher)\n• Drag-and-drop receipt and invoice attachments\n• Enhanced print-ready executive financial reports\n• Performance optimizations and bug fixes',
  };
}
