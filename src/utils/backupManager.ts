import { getDb } from './db';
import {
  Account,
  Category,
  Transaction,
  ScheduledTransaction,
  ScheduledTransactionOverride,
  TransactionSplit,
  TransactionRule,
  TransactionAttachment,
} from '../types';

export interface RollingBackupMeta {
  id: number;
  created_at: string;
  label: string;
  account_count: number;
  transaction_count: number;
  byte_size?: number;
}

export async function createRollingBackup(
  label: string = 'Manual Snapshot',
  maxBackups: number = 5
): Promise<number> {
  const db = await getDb();

  // Fetch full dataset
  const accounts = (await db.select('SELECT * FROM accounts')) as Account[];
  const categories = (await db.select('SELECT * FROM categories')) as Category[];
  const transactions = (await db.select('SELECT * FROM transactions')) as Transaction[];
  const splits = (await db.select('SELECT * FROM transaction_splits')) as TransactionSplit[];
  const scheduledTransactions = (await db.select('SELECT * FROM scheduled_transactions')) as ScheduledTransaction[];
  const scheduledOverrides = (await db.select('SELECT * FROM scheduled_transaction_overrides')) as ScheduledTransactionOverride[];
  let transactionRules: TransactionRule[] = [];
  let transactionAttachments: TransactionAttachment[] = [];
  try {
    transactionRules = (await db.select('SELECT * FROM transaction_rules')) as TransactionRule[];
  } catch {}
  try {
    transactionAttachments = (await db.select('SELECT * FROM transaction_attachments')) as TransactionAttachment[];
  } catch {}

  const payload = {
    version: '1.0',
    exportDate: new Date().toISOString(),
    accounts,
    categories,
    transactions,
    transaction_splits: splits,
    scheduled_transactions: scheduledTransactions,
    scheduled_transaction_overrides: scheduledOverrides,
    transaction_rules: transactionRules,
    transaction_attachments: transactionAttachments,
  };

  const jsonStr = JSON.stringify(payload);
  const now = new Date().toISOString();

  // Insert snapshot
  const res = (await db.execute(
    `INSERT INTO local_backups (created_at, label, account_count, transaction_count, data_json)
     VALUES (?, ?, ?, ?, ?)`,
    [now, label, accounts.length, transactions.length, jsonStr]
  )) as { lastInsertId?: number };

  // Retain only the most recent `maxBackups`
  await db.execute(
    `DELETE FROM local_backups
     WHERE id NOT IN (
       SELECT id FROM local_backups ORDER BY id DESC LIMIT ?
     )`,
    [maxBackups]
  );

  return res.lastInsertId || 0;
}

export async function listRollingBackups(): Promise<RollingBackupMeta[]> {
  const db = await getDb();
  const rows = (await db.select(
    `SELECT id, created_at, label, account_count, transaction_count, LENGTH(data_json) as byte_size
     FROM local_backups
     ORDER BY id DESC`
  )) as RollingBackupMeta[];
  return rows;
}

export async function deleteRollingBackup(id: number): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM local_backups WHERE id = ?', [id]);
}

export async function restoreRollingBackup(id: number): Promise<boolean> {
  const db = await getDb();
  const rows = (await db.select('SELECT data_json FROM local_backups WHERE id = ?', [id])) as { data_json: string }[];
  if (!rows || rows.length === 0) {
    throw new Error('Backup snapshot not found.');
  }

  const data = JSON.parse(rows[0].data_json);

  try {
    await db.execute('PRAGMA foreign_keys = OFF');
  } catch (err) {
    console.warn('Could not disable PRAGMA foreign_keys:', err);
  }

  // Clear existing records
  await db.execute('DELETE FROM transaction_splits');
  await db.execute('DELETE FROM transaction_attachments');
  await db.execute('DELETE FROM transactions');
  await db.execute('DELETE FROM scheduled_transaction_overrides');
  await db.execute('DELETE FROM scheduled_transactions');
  await db.execute('DELETE FROM accounts');
  await db.execute('DELETE FROM categories');

  // 1. Categories
  if (Array.isArray(data.categories)) {
    for (const cat of data.categories) {
      await db.execute(
        'INSERT INTO categories (id, name, type, parent_id, monthly_budget) VALUES (?, ?, ?, ?, ?)',
        [cat.id, cat.name, cat.type || 'expense', cat.parent_id || null, cat.monthly_budget ?? 0]
      );
    }
  }

  // 2. Accounts
  if (Array.isArray(data.accounts)) {
    for (const acc of data.accounts) {
      await db.execute(
        'INSERT INTO accounts (id, name, type, balance, currency, is_favorite) VALUES (?, ?, ?, ?, ?, ?)',
        [
          acc.id,
          acc.name,
          acc.type || 'Checking',
          acc.balance ?? 0,
          acc.currency || 'USD',
          acc.is_favorite ? 1 : 0,
        ]
      );
    }
  }

  // 3. Transactions
  if (Array.isArray(data.transactions)) {
    for (const tx of data.transactions) {
      await db.execute(
        'INSERT INTO transactions (id, account_id, category_id, date, payee, amount, memo, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          tx.id,
          tx.account_id,
          tx.category_id || 1,
          tx.date,
          tx.payee,
          tx.amount,
          tx.memo || null,
          tx.status || 'cleared',
        ]
      );
    }
  }

  // 4. Transaction Splits
  if (Array.isArray(data.transaction_splits)) {
    for (const ts of data.transaction_splits) {
      await db.execute(
        'INSERT INTO transaction_splits (id, transaction_id, category_id, amount, memo) VALUES (?, ?, ?, ?, ?)',
        [ts.id, ts.transaction_id, ts.category_id, ts.amount, ts.memo || null]
      );
    }
  }

  // 5. Scheduled Transactions
  if (Array.isArray(data.scheduled_transactions)) {
    for (const st of data.scheduled_transactions) {
      await db.execute(
        'INSERT INTO scheduled_transactions (id, account_id, category_id, amount, frequency, next_date, payee, type, to_account_id, is_closed_ended, remaining_count, end_date, auto_enter_days) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          st.id,
          st.account_id,
          st.category_id ?? null,
          Math.abs(st.amount),
          st.frequency || 'monthly',
          st.next_date,
          st.payee,
          st.type || 'expense',
          st.to_account_id || null,
          st.is_closed_ended ? 1 : 0,
          st.remaining_count ?? null,
          st.end_date || null,
          st.auto_enter_days ?? null,
        ]
      );
    }
  }

  // 6. Scheduled Overrides
  if (Array.isArray(data.scheduled_transaction_overrides)) {
    for (const ov of data.scheduled_transaction_overrides) {
      const originalDate = ov.original_date || ov.date;
      const newDate = ov.new_date || null;
      await db.execute(
        'INSERT INTO scheduled_transaction_overrides (id, scheduled_id, original_date, new_date, amount, payee, account_id, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          ov.id,
          ov.scheduled_id,
          originalDate,
          newDate,
          ov.amount !== undefined && ov.amount !== null ? Math.abs(ov.amount) : null,
          ov.payee ?? null,
          ov.account_id ?? null,
          ov.date || originalDate,
        ]
      );
    }
  }

  // 7. Transaction Rules
  if (Array.isArray(data.transaction_rules)) {
    try {
      await db.execute('DELETE FROM transaction_rules');
      for (const r of data.transaction_rules) {
        await db.execute(
          'INSERT INTO transaction_rules (id, name, match_field, match_type, match_value, category_id, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [
            r.id,
            r.name,
            r.match_field || 'payee',
            r.match_type || 'contains',
            r.match_value,
            r.category_id || 1,
            r.is_active ? 1 : 0,
            r.created_at || new Date().toISOString(),
          ]
        );
      }
    } catch (err) {
      console.warn('Could not restore transaction_rules:', err);
    }
  }

  // 8. Transaction Attachments
  if (Array.isArray(data.transaction_attachments)) {
    try {
      for (const att of data.transaction_attachments) {
        await db.execute(
          'INSERT INTO transaction_attachments (id, transaction_id, file_name, file_type, file_size, data_base64, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [
            att.id,
            att.transaction_id,
            att.file_name,
            att.file_type,
            att.file_size,
            att.data_base64,
            att.created_at || new Date().toISOString(),
          ]
        );
      }
    } catch (err) {
      console.warn('Could not restore transaction_attachments:', err);
    }
  }

  try {
    await db.execute('PRAGMA foreign_keys = ON');
  } catch (err) {
    console.warn('Could not re-enable PRAGMA foreign_keys:', err);
  }

  return true;
}

export async function checkAndTriggerAutoBackup(): Promise<boolean> {
  try {
    const db = await getDb();
    const rows = (await db.select(
      'SELECT created_at FROM local_backups ORDER BY id DESC LIMIT 1'
    )) as { created_at: string }[];

    let shouldBackup = false;
    if (rows.length === 0) {
      // First time backup
      shouldBackup = true;
    } else {
      const lastBackupDate = new Date(rows[0].created_at).getTime();
      const now = Date.now();
      const hoursSince = (now - lastBackupDate) / (1000 * 60 * 60);
      if (hoursSince >= 24) {
        shouldBackup = true;
      }
    }

    if (shouldBackup) {
      await createRollingBackup('Automatic Daily Snapshot', 5);
      return true;
    }
  } catch (err) {
    console.error('Error during auto-backup check:', err);
  }
  return false;
}
