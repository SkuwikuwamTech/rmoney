import { check, Update } from '@tauri-apps/plugin-updater';

export interface AppUpdateInfo {
  available: boolean;
  currentVersion: string;
  version: string;
  date?: string;
  body?: string;
  downloadUrl?: string;
  rawUpdate?: Update;
}

function isNewerVersion(remote: string, current: string): boolean {
  const rParts = remote.split('.').map((n) => parseInt(n, 10) || 0);
  const cParts = current.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(rParts.length, cParts.length); i++) {
    const r = rParts[i] || 0;
    const c = cParts[i] || 0;
    if (r > c) return true;
    if (r < c) return false;
  }
  return false;
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
 * with fallback to GitHub Releases API if Tauri updater endpoint is not found or in dev mode.
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
    } else if (update && !update.available) {
      return {
        available: false,
        currentVersion: update.currentVersion,
        version: update.currentVersion,
      };
    }
  } catch (tauriError) {
    console.warn('[rMoney Updater] Native updater check failed, attempting GitHub Releases check:', tauriError);
  }

  // Graceful fallback: query GitHub Releases API
  try {
    const res = await fetch('https://api.github.com/repos/skuwikuwamtech/rmoney/releases/latest', {
      headers: { Accept: 'application/vnd.github.v3+json' },
    });
    if (res.ok) {
      const data = await res.json();
      const latestTag = (data.tag_name || '').replace(/^v/, '');
      const currentVersion = '1.0.0';

      if (latestTag && isNewerVersion(latestTag, currentVersion)) {
        return {
          available: true,
          currentVersion,
          version: latestTag,
          date: data.published_at,
          body: data.body || 'A new release of rMoney is available.',
          downloadUrl: data.html_url,
        };
      } else {
        return {
          available: false,
          currentVersion,
          version: latestTag || currentVersion,
        };
      }
    }
  } catch (fallbackError) {
    console.warn('[rMoney Updater] GitHub fallback check also failed:', fallbackError);
  }

  if (isManual) {
    return {
      available: false,
      currentVersion: '1.0.0',
      version: '1.0.0',
    };
  }
  return null;
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
