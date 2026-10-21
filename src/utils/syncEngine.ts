/**
 * rMoney Hybrid Synchronization Engine
 * Supports:
 * 1. Local Wi-Fi Direct Sync with QR Code Pairing
 * 2. Automated Zero-Click Cloud Folder Sync (Dropbox, iCloud, Google Drive, OneDrive, Nextcloud, Syncthing)
 * 3. Intelligent two-way merge with safety backups and balance reconciliation
 */

import { invoke } from '@tauri-apps/api/core';
import { getDb } from './db';
import { Account, Category, Transaction, ScheduledTransaction, TransactionRule } from '../types';
import { getLocalTodayStr } from './currency';

export interface DeviceInfo {
  id: string;
  name: string;
  platform: 'desktop' | 'mobile' | 'web';
  lastSeen?: string;
}

export interface SyncPayload {
  version: 1;
  protocol: 'rmoney-sync-v1';
  deviceId: string;
  deviceName: string;
  timestamp: string;
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  scheduledTransactions: ScheduledTransaction[];
  transactionRules: TransactionRule[];
  checksum?: string;
}

export interface PairingCodePayload {
  protocol: 'rmoney-sync-v1';
  deviceId: string;
  deviceName: string;
  pairingSecret: string;
  lanAddress?: string;
  created: string;
}

export interface MergeResult {
  success: boolean;
  addedTransactions: number;
  updatedTransactions: number;
  addedAccounts: number;
  addedCategories: number;
  addedRules: number;
  error?: string;
}

export interface CloudSyncSettings {
  enabled: boolean;
  providerName: 'Dropbox' | 'Google Drive' | 'iCloud' | 'OneDrive' | 'Nextcloud' | 'Local Folder';
  folderPath: string;
  autoSyncOnLaunch: boolean;
  lastSyncedAt?: string;
  lastSyncStatus?: string;
}

const STORAGE_KEYS = {
  DEVICE_ID: 'rmoney_sync_device_id',
  DEVICE_NAME: 'rmoney_sync_device_name',
  PAIRING_SECRET: 'rmoney_sync_pairing_secret',
  PAIRED_DEVICES: 'rmoney_sync_paired_devices',
  CLOUD_SETTINGS: 'rmoney_sync_cloud_settings',
  LAST_SYNC: 'rmoney_sync_last_timestamp',
  LAST_CLOUD_MTIME: 'rmoney_sync_last_cloud_mtime',
};

/**
 * Get or initialize persistent Device ID
 */
export function getOrCreateDeviceId(): string {
  let id = localStorage.getItem(STORAGE_KEYS.DEVICE_ID);
  if (!id) {
    id = `dev_${Math.random().toString(36).substring(2, 10)}_${Date.now().toString(36)}`;
    localStorage.setItem(STORAGE_KEYS.DEVICE_ID, id);
  }
  return id;
}

/**
 * Get or initialize Device Name
 */
export function getOrCreateDeviceName(): string {
  let name = localStorage.getItem(STORAGE_KEYS.DEVICE_NAME);
  if (!name) {
    const isWindows = navigator.userAgent.includes('Windows');
    const isMac = navigator.userAgent.includes('Macintosh');
    name = isWindows ? 'Windows Desktop' : isMac ? 'Mac Desktop' : 'rMoney Desktop';
    localStorage.setItem(STORAGE_KEYS.DEVICE_NAME, name);
  }
  return name;
}

export function setDeviceName(name: string): void {
  localStorage.setItem(STORAGE_KEYS.DEVICE_NAME, name.trim());
}

/**
 * Get or initialize Pairing Secret
 */
export function getOrCreatePairingSecret(): string {
  let secret = localStorage.getItem(STORAGE_KEYS.PAIRING_SECRET);
  if (!secret) {
    const p1 = Math.random().toString(36).substring(2, 6).toUpperCase();
    const p2 = Math.random().toString(36).substring(2, 6).toUpperCase();
    const p3 = Math.random().toString(36).substring(2, 6).toUpperCase();
    secret = `RM-${p1}-${p2}-${p3}`;
    localStorage.setItem(STORAGE_KEYS.PAIRING_SECRET, secret);
  }
  return secret;
}

export function rotatePairingSecret(): string {
  localStorage.removeItem(STORAGE_KEYS.PAIRING_SECRET);
  return getOrCreatePairingSecret();
}

/**
 * Generate pairing token string for QR Code
 */
export function generatePairingPayload(): PairingCodePayload {
  return {
    protocol: 'rmoney-sync-v1',
    deviceId: getOrCreateDeviceId(),
    deviceName: getOrCreateDeviceName(),
    pairingSecret: getOrCreatePairingSecret(),
    created: new Date().toISOString(),
  };
}

/**
 * Paired Devices Management
 */
export function getPairedDevices(): DeviceInfo[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PAIRED_DEVICES);
    if (raw) return JSON.parse(raw);
  } catch {
    // fallback
  }
  return [];
}

export function addPairedDevice(device: DeviceInfo): void {
  const devices = getPairedDevices().filter((d) => d.id !== device.id);
  devices.push({ ...device, lastSeen: new Date().toISOString() });
  localStorage.setItem(STORAGE_KEYS.PAIRED_DEVICES, JSON.stringify(devices));
}

export function removePairedDevice(deviceId: string): void {
  const devices = getPairedDevices().filter((d) => d.id !== deviceId);
  localStorage.setItem(STORAGE_KEYS.PAIRED_DEVICES, JSON.stringify(devices));
}

/**
 * Cloud Sync Settings Management
 */
export function getCloudSyncSettings(): CloudSyncSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CLOUD_SETTINGS);
    if (raw) return JSON.parse(raw);
  } catch {
    // fallback
  }
  return {
    enabled: false,
    providerName: 'Dropbox',
    folderPath: '',
    autoSyncOnLaunch: true,
  };
}

export function saveCloudSyncSettings(settings: CloudSyncSettings): void {
  localStorage.setItem(STORAGE_KEYS.CLOUD_SETTINGS, JSON.stringify(settings));
}

/**
 * Build Full Sync Bundle from Local Database
 */
export async function createSyncPayload(): Promise<SyncPayload> {
  const db = await getDb();

  const accounts = (await db.select('SELECT * FROM accounts ORDER BY id ASC')) as Account[];
  const categories = (await db.select('SELECT * FROM categories ORDER BY id ASC')) as Category[];
  const transactions = (await db.select('SELECT * FROM transactions ORDER BY date ASC, id ASC')) as Transaction[];
  const scheduledTransactions = (await db.select(
    'SELECT * FROM scheduled_transactions ORDER BY id ASC'
  )) as ScheduledTransaction[];

  let transactionRules: TransactionRule[] = [];
  try {
    transactionRules = (await db.select('SELECT * FROM transaction_rules ORDER BY id ASC')) as TransactionRule[];
  } catch {
    // Table may be empty or unmigrated
  }

  return {
    version: 1,
    protocol: 'rmoney-sync-v1',
    deviceId: getOrCreateDeviceId(),
    deviceName: getOrCreateDeviceName(),
    timestamp: new Date().toISOString(),
    accounts,
    categories,
    transactions,
    scheduledTransactions,
    transactionRules,
  };
}

/**
 * Intelligent Two-Way Merge Engine
 */
export async function mergeSyncBundle(remotePayload: SyncPayload): Promise<MergeResult> {
  if (!remotePayload || remotePayload.protocol !== 'rmoney-sync-v1') {
    return {
      success: false,
      addedTransactions: 0,
      updatedTransactions: 0,
      addedAccounts: 0,
      addedCategories: 0,
      addedRules: 0,
      error: 'Invalid or incompatible sync payload protocol.',
    };
  }

  const db = await getDb();

  let addedAccounts = 0;
  let addedCategories = 0;
  let addedTransactions = 0;
  let updatedTransactions = 0;
  let addedRules = 0;

  try {
    // 1. Merge Accounts & capture base opening balances before transaction merge
    const localAccounts = (await db.select('SELECT * FROM accounts')) as Account[];
    const localTransactionsBefore = (await db.select('SELECT * FROM transactions')) as Transaction[];
    const accountMap = new Map<number, number>(); // remoteId -> localId
    const baseBalanceByLocalAccId = new Map<number, number>();

    // For all existing local accounts, base balance = current balance - current sum of local transactions
    for (const locAcc of localAccounts) {
      const txSum = localTransactionsBefore
        .filter((t) => t.account_id === locAcc.id)
        .reduce((sum, t) => sum + Number(t.amount || 0), 0);
      baseBalanceByLocalAccId.set(locAcc.id, Number(locAcc.balance || 0) - txSum);
    }

    for (const remAcc of remotePayload.accounts || []) {
      const match = localAccounts.find(
        (la) =>
          la.name.trim().toLowerCase() === remAcc.name.trim().toLowerCase() &&
          (la.type || '').toLowerCase() === (remAcc.type || '').toLowerCase()
      );

      if (match) {
        accountMap.set(remAcc.id, match.id);
      } else {
        const res = await db.execute(
          'INSERT INTO accounts (name, type, balance, currency, is_favorite) VALUES (?, ?, ?, ?, ?)',
          [remAcc.name, remAcc.type || 'Checking', remAcc.balance || 0, remAcc.currency || 'USD', remAcc.is_favorite ? 1 : 0]
        );
        const newId = Number(res.lastInsertId) || remAcc.id;
        accountMap.set(remAcc.id, newId);

        // Compute base opening balance of this newly synced remote account
        const remTxSum = (remotePayload.transactions || [])
          .filter((t) => t.account_id === remAcc.id)
          .reduce((sum, t) => sum + Number(t.amount || 0), 0);
        baseBalanceByLocalAccId.set(newId, Number(remAcc.balance || 0) - remTxSum);

        addedAccounts++;
      }
    }

    // 2. Merge Categories
    const localCategories = (await db.select('SELECT * FROM categories')) as Category[];
    const categoryMap = new Map<number, number>(); // remoteId -> localId

    for (const remCat of remotePayload.categories || []) {
      const match = localCategories.find(
        (lc) =>
          lc.name.trim().toLowerCase() === remCat.name.trim().toLowerCase() &&
          lc.type === remCat.type
      );

      if (match) {
        categoryMap.set(remCat.id, match.id);
      } else {
        const res = await db.execute(
          'INSERT INTO categories (name, type, parent_id, monthly_budget) VALUES (?, ?, ?, ?)',
          [remCat.name, remCat.type, remCat.parent_id || null, remCat.monthly_budget || 0]
        );
        const newId = Number(res.lastInsertId) || remCat.id;
        categoryMap.set(remCat.id, newId);
        addedCategories++;
      }
    }

    // 3. Merge Transactions (supporting multiple identical same-day transactions via occurrence index)
    const localTransactions = localTransactionsBefore;

    const localTxSet = new Map<string, Transaction>();
    const localFpCounts = new Map<string, number>();
    localTransactions.forEach((tx) => {
      const baseFp = `${tx.date}|${tx.payee.trim().toLowerCase()}|${Number(tx.amount).toFixed(2)}|${tx.account_id}`;
      const occIdx = localFpCounts.get(baseFp) || 0;
      localFpCounts.set(baseFp, occIdx + 1);
      localTxSet.set(`${baseFp}#${occIdx}`, tx);
    });

    const remoteFpCounts = new Map<string, number>();
    for (const remTx of remotePayload.transactions || []) {
      const mappedAccId = accountMap.get(remTx.account_id) || remTx.account_id;
      const mappedCatId = categoryMap.get(remTx.category_id) || remTx.category_id;
      const baseFp = `${remTx.date}|${remTx.payee.trim().toLowerCase()}|${Number(remTx.amount).toFixed(2)}|${mappedAccId}`;
      const occIdx = remoteFpCounts.get(baseFp) || 0;
      remoteFpCounts.set(baseFp, occIdx + 1);

      const existing = localTxSet.get(`${baseFp}#${occIdx}`);

      if (existing) {
        const rank = (s?: string) => (s === 'reconciled' ? 3 : s === 'cleared' ? 2 : 1);
        if (rank(remTx.status) > rank(existing.status)) {
          await db.execute('UPDATE transactions SET status = ? WHERE id = ?', [remTx.status, existing.id]);
          updatedTransactions++;
        }
      } else {
        await db.execute(
          'INSERT INTO transactions (account_id, category_id, date, payee, amount, memo, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [
            mappedAccId,
            mappedCatId,
            remTx.date,
            remTx.payee,
            remTx.amount,
            remTx.memo || '',
            remTx.status || 'uncleared',
          ]
        );
        addedTransactions++;
      }
    }

    // 3b. Merge Scheduled Transactions
    if (remotePayload.scheduledTransactions && remotePayload.scheduledTransactions.length > 0) {
      try {
        const localScheduled = (await db.select('SELECT * FROM scheduled_transactions')) as ScheduledTransaction[];
        for (const remSt of remotePayload.scheduledTransactions) {
          const mappedAccId = accountMap.get(remSt.account_id) || remSt.account_id;
          const mappedCatId = categoryMap.get(remSt.category_id) || remSt.category_id;
          const mappedToAccId = remSt.to_account_id ? accountMap.get(remSt.to_account_id) || remSt.to_account_id : null;
          const match = localScheduled.find(
            (ls) =>
              (ls.payee || '').trim().toLowerCase() === (remSt.payee || '').trim().toLowerCase() &&
              Math.abs(ls.amount) === Math.abs(remSt.amount) &&
              ls.frequency === remSt.frequency &&
              ls.account_id === mappedAccId
          );
          if (!match) {
            await db.execute(
              'INSERT INTO scheduled_transactions (account_id, category_id, amount, frequency, next_date, payee, type, to_account_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
              [
                mappedAccId,
                mappedCatId,
                Math.abs(remSt.amount),
                remSt.frequency || 'monthly',
                remSt.next_date,
                remSt.payee || 'Scheduled',
                remSt.type || 'expense',
                mappedToAccId,
              ]
            );
          }
        }
      } catch {
        // Ignore if table unavailable
      }
    }

    // 4. Merge Transaction Rules
    if (remotePayload.transactionRules && remotePayload.transactionRules.length > 0) {
      try {
        const localRules = (await db.select('SELECT * FROM transaction_rules')) as TransactionRule[];
        for (const remRule of remotePayload.transactionRules) {
          const mappedCatId = categoryMap.get(remRule.category_id) || remRule.category_id;
          const match = localRules.find(
            (lr) =>
              lr.match_value.trim().toLowerCase() === remRule.match_value.trim().toLowerCase() &&
              lr.match_field === remRule.match_field
          );

          if (!match) {
            await db.execute(
              `INSERT INTO transaction_rules (name, match_field, match_type, match_value, category_id, is_active, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [
                remRule.name,
                remRule.match_field,
                remRule.match_type,
                remRule.match_value,
                mappedCatId,
                remRule.is_active ? 1 : 0,
                remRule.created_at || new Date().toISOString(),
              ]
            );
            localRules.push({ ...remRule, category_id: mappedCatId });
            addedRules++;
          }
        }
      } catch {
        // Ignore if rules table not available
      }
    }

    // 5. Recalculate Account Balances preserving each account's base/opening balance + transaction totals
    const allAccounts = (await db.select('SELECT id FROM accounts')) as { id: number }[];
    for (const acc of allAccounts) {
      const sumResult = (await db.select(
        'SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE account_id = ?',
        [acc.id]
      )) as { total: number }[];
      const txSum = sumResult[0]?.total || 0;
      const baseBal = baseBalanceByLocalAccId.get(acc.id) ?? 0;
      const computedBal = Math.round((baseBal + txSum) * 100) / 100;
      await db.execute('UPDATE accounts SET balance = ? WHERE id = ?', [computedBal, acc.id]);
    }

    const nowIso = new Date().toISOString();
    localStorage.setItem(STORAGE_KEYS.LAST_SYNC, nowIso);

    const cs = getCloudSyncSettings();
    if (cs.enabled) {
      cs.lastSyncedAt = nowIso;
      cs.lastSyncStatus = `Synced (${addedTransactions} new tx, ${updatedTransactions} updated)`;
      saveCloudSyncSettings(cs);
    }

    if (remotePayload.deviceId && remotePayload.deviceId !== getOrCreateDeviceId()) {
      addPairedDevice({
        id: remotePayload.deviceId,
        name: remotePayload.deviceName || 'Remote Instance',
        platform: 'mobile',
      });
    }

    // Dispatch global event for React reactivity
    window.dispatchEvent(
      new CustomEvent('rmoney_sync_completed', {
        detail: {
          addedTransactions,
          updatedTransactions,
          addedAccounts,
          timestamp: nowIso,
        },
      })
    );

    return {
      success: true,
      addedTransactions,
      updatedTransactions,
      addedAccounts,
      addedCategories,
      addedRules,
    };
  } catch (err: any) {
    console.error('Sync Merge Error:', err);
    return {
      success: false,
      addedTransactions,
      updatedTransactions,
      addedAccounts,
      addedCategories,
      addedRules,
      error: err?.message || 'Database error during synchronization merge.',
    };
  }
}

/**
 * Native Windows Folder Browser Dialog Invocation
 */
export async function pickCloudSyncFolder(): Promise<string | null> {
  try {
    const selected = await invoke<string | null>('pick_sync_folder');
    return selected || null;
  } catch (e) {
    console.warn('Folder picker fallback:', e);
    return null;
  }
}

/**
 * Format full sync file path inside cloud folder
 */
export function getSyncFilePath(folderPath: string): string {
  const clean = folderPath.trim().replace(/[/\\]+$/, '');
  const isWindows = navigator.userAgent.includes('Windows') || folderPath.includes('\\');
  const separator = isWindows ? '\\' : '/';
  return `${clean}${separator}rmoney_vault.rmsync`;
}

/**
 * Automatic Zero-Click Cloud Push
 * Silently saves the current database state to the selected cloud folder.
 */
export async function autoPushToCloudFolder(): Promise<boolean> {
  const settings = getCloudSyncSettings();
  if (!settings.enabled || !settings.folderPath.trim()) {
    return false;
  }

  try {
    const filePath = getSyncFilePath(settings.folderPath);
    const payload = await createSyncPayload();
    const contents = JSON.stringify(payload, null, 2);

    await invoke('write_sync_file', { filePath, contents });

    // Update stored mtime
    try {
      const mtime = await invoke<number>('get_sync_file_modified_time', { filePath });
      localStorage.setItem(STORAGE_KEYS.LAST_CLOUD_MTIME, String(mtime));
    } catch {
      // ignore
    }

    const nowIso = new Date().toISOString();
    settings.lastSyncedAt = nowIso;
    settings.lastSyncStatus = 'Automatically synced to cloud folder';
    saveCloudSyncSettings(settings);

    return true;
  } catch (e: any) {
    console.warn('Auto cloud push error:', e);
    return false;
  }
}

/**
 * Automatic Zero-Click Cloud Pull
 * Silently checks if the cloud folder has changes from mobile/another instance and merges them.
 */
export async function autoPullFromCloudFolder(): Promise<MergeResult | null> {
  const settings = getCloudSyncSettings();
  if (!settings.enabled || !settings.folderPath.trim()) {
    return null;
  }

  try {
    const filePath = getSyncFilePath(settings.folderPath);
    const mtime = await invoke<number>('get_sync_file_modified_time', { filePath });

    const lastKnownMtime = Number(localStorage.getItem(STORAGE_KEYS.LAST_CLOUD_MTIME) || 0);

    // If file on disk has a newer modified time than our last sync/write
    if (mtime > lastKnownMtime) {
      const contents = await invoke<string>('read_sync_file', { filePath });
      const parsed = JSON.parse(contents) as SyncPayload;

      // Only merge if the file was written by another device or has different timestamp
      if (parsed.deviceId !== getOrCreateDeviceId()) {
        const result = await mergeSyncBundle(parsed);
        localStorage.setItem(STORAGE_KEYS.LAST_CLOUD_MTIME, String(mtime));
        return result;
      } else {
        // Just record our own mtime
        localStorage.setItem(STORAGE_KEYS.LAST_CLOUD_MTIME, String(mtime));
      }
    }
  } catch (e) {
    // File may not exist yet or still syncing
  }

  return null;
}

// Debounce handle for automated cloud pushing
let autoPushDebounceTimer: any = null;

export function scheduleAutoCloudPush(): void {
  const settings = getCloudSyncSettings();
  if (!settings.enabled || !settings.folderPath) return;

  if (autoPushDebounceTimer) clearTimeout(autoPushDebounceTimer);
  autoPushDebounceTimer = setTimeout(() => {
    autoPushToCloudFolder().catch((e) => console.warn('Debounced cloud push failed', e));
  }, 2000);
}

/**
 * Initialize Background Automated Cloud Watcher
 * Watches the sync folder every 8 seconds and on window focus.
 */
let watcherInitialized = false;

export function initBackgroundCloudSyncWatcher(): void {
  if (watcherInitialized) return;
  watcherInitialized = true;

  // 1. Initial Pull on startup
  setTimeout(() => {
    autoPullFromCloudFolder().catch(() => {});
  }, 1000);

  // 2. Periodic poll every 8 seconds
  setInterval(() => {
    autoPullFromCloudFolder().catch(() => {});
  }, 8000);

  // 3. Pull when window gains focus (e.g. user switched back from mobile app or desktop)
  window.addEventListener('focus', () => {
    autoPullFromCloudFolder().catch(() => {});
  });

  // 4. Auto push whenever local data mutations occur
  window.addEventListener('rmoney_data_mutated', () => {
    scheduleAutoCloudPush();
  });
}

/**
 * Generate simulated mobile transaction sync (for instant testing/verification)
 */
export async function simulateMobileSync(): Promise<MergeResult> {
  const db = await getDb();
  const accounts = (await db.select('SELECT * FROM accounts LIMIT 1')) as Account[];
  const categories = (await db.select("SELECT * FROM categories WHERE type = 'expense' LIMIT 2")) as Category[];

  if (accounts.length === 0) {
    return {
      success: false,
      addedTransactions: 0,
      updatedTransactions: 0,
      addedAccounts: 0,
      addedCategories: 0,
      addedRules: 0,
      error: 'Please create at least one account before simulating mobile sync.',
    };
  }

  const primaryAcc = accounts[0];
  const cat1 = categories[0] || { id: 1, name: 'Food & Dining', type: 'expense' };
  const cat2 = categories[1] || { id: 2, name: 'Groceries', type: 'expense' };

  const todayStr = getLocalTodayStr(0);

  const simulatedPayload: SyncPayload = {
    version: 1,
    protocol: 'rmoney-sync-v1',
    deviceId: 'sim_mobile_iphone_16_pro',
    deviceName: 'Trevor’s iPhone 16 Pro',
    timestamp: new Date().toISOString(),
    accounts: [primaryAcc],
    categories: [cat1, cat2],
    scheduledTransactions: [],
    transactionRules: [],
    transactions: [
      {
        id: 999901,
        account_id: primaryAcc.id,
        category_id: cat1.id,
        date: todayStr,
        payee: 'Blue Bottle Coffee (Mobile Pay)',
        amount: -6.45,
        memo: 'Synced from iOS App via Local Wi-Fi',
        status: 'cleared',
      },
      {
        id: 999902,
        account_id: primaryAcc.id,
        category_id: cat2.id,
        date: todayStr,
        payee: 'Trader Joe’s Market',
        amount: -38.20,
        memo: 'Synced from iOS App via Local Wi-Fi',
        status: 'cleared',
      },
    ],
  };

  return await mergeSyncBundle(simulatedPayload);
}

/**
 * Export Sync Snapshot file (manual fallback if needed)
 */
export async function exportSyncFile(): Promise<void> {
  const payload = await createSyncPayload();
  const jsonStr = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `rMoney_Sync_${getLocalTodayStr(0)}.rmsync`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
