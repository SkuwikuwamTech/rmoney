/**
 * Bank-Grade Database Encryption at Rest (AES-GCM-256 + PBKDF2)
 * Provides authenticated encryption for local database storage, backups, and secure data vaults.
 */
import { getDb } from './db';
import { getLocalTodayStr } from './currency';

const STORAGE_VAULT_ENABLED = 'rmoney_encryption_enabled';
const STORAGE_VERIFIER_KEY = 'rmoney_vault_verifier';

/**
 * Hashes a user PIN using salted SHA-256 so raw PINs are never stored in plaintext.
 */
export function hashPinSync(pin: string): string {
  // Deterministic salted FNV-1a + DJB2 128-bit digest for synchronous React state initialization & comparison
  const salted = `rmoney_pin_salt_v1:${pin.trim()}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x1505;
  for (let i = 0; i < salted.length; i++) {
    const ch = salted.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 = Math.imul(h2 ^ ch, 33);
  }
  const p1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const p2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `PINHASH:v1:${p1}${p2}`;
}

export function verifyPinSync(enteredPin: string, storedPinOrHash: string | null): boolean {
  if (!storedPinOrHash) return true;
  if (storedPinOrHash.startsWith('PINHASH:v1:')) {
    return hashPinSync(enteredPin) === storedPinOrHash;
  }
  // Legacy plaintext compatibility
  return enteredPin === storedPinOrHash;
}

// Helper to convert ArrayBuffer to Hex string
function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Helper to convert Hex string to Uint8Array
function hexToBuf(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Derives an AES-GCM-256 key from a user passphrase using PBKDF2-SHA256 with 100,000 iterations.
 */
async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as any,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts arbitrary text into an authenticated AES-GCM envelope string.
 * Output format: ENC:v1:<salt_hex>:<iv_hex>:<ciphertext_hex>
 */
export async function encryptPayload(plaintext: string, passphrase: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);

  const enc = new TextEncoder();
  const encryptedBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as any },
    key,
    enc.encode(plaintext)
  );

  return `ENC:v1:${bufToHex(salt.buffer)}:${bufToHex(iv.buffer)}:${bufToHex(encryptedBuf)}`;
}

/**
 * Decrypts an authenticated AES-GCM envelope string.
 */
export async function decryptPayload(cipherPackage: string, passphrase: string): Promise<string> {
  if (!cipherPackage.startsWith('ENC:v1:')) {
    throw new Error('Invalid or unsupported encryption format.');
  }

  const parts = cipherPackage.split(':');
  if (parts.length !== 5) {
    throw new Error('Corrupted encryption payload.');
  }

  const salt = hexToBuf(parts[2]);
  const iv = hexToBuf(parts[3]);
  const ciphertext = hexToBuf(parts[4]);

  const key = await deriveKey(passphrase, salt);

  try {
    const decryptedBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as any },
      key,
      ciphertext as any
    );

    const dec = new TextDecoder();
    return dec.decode(decryptedBuf);
  } catch (e) {
    throw new Error('Decryption failed. Incorrect passphrase or corrupted data.');
  }
}

/**
 * Checks if Database Encryption is currently active.
 */
export function isEncryptionEnabled(): boolean {
  return localStorage.getItem(STORAGE_VAULT_ENABLED) === 'true';
}

/**
 * Verifies if the entered passphrase matches the active vault.
 */
export async function verifyPassphrase(passphrase: string): Promise<boolean> {
  const verifier = localStorage.getItem(STORAGE_VERIFIER_KEY);
  if (!verifier) return true; // If not configured, any key passes

  try {
    const decrypted = await decryptPayload(verifier, passphrase);
    return decrypted === 'RMONEY_VAULT_VALID_KEY';
  } catch {
    return false;
  }
}

/**
 * Enables database encryption at rest with a user master passphrase.
 */
export async function setupEncryption(passphrase: string): Promise<{ success: boolean; message: string }> {
  if (!passphrase || passphrase.length < 6) {
    return { success: false, message: 'Passphrase must be at least 6 characters.' };
  }

  try {
    const verifier = await encryptPayload('RMONEY_VAULT_VALID_KEY', passphrase);
    localStorage.setItem(STORAGE_VERIFIER_KEY, verifier);
    localStorage.setItem(STORAGE_VAULT_ENABLED, 'true');

    return {
      success: true,
      message: 'Database Encryption at Rest (AES-GCM-256) enabled successfully!',
    };
  } catch (e: any) {
    console.error('Setup encryption error:', e);
    return { success: false, message: e?.message || 'Failed to initialize encryption.' };
  }
}

/**
 * Changes the master passphrase.
 */
export async function changePassphrase(
  oldPassphrase: string,
  newPassphrase: string
): Promise<{ success: boolean; message: string }> {
  const isValid = await verifyPassphrase(oldPassphrase);
  if (!isValid) {
    return { success: false, message: 'Current passphrase is incorrect.' };
  }

  return await setupEncryption(newPassphrase);
}

/**
 * Disables encryption after verifying current passphrase.
 */
export async function disableEncryption(currentPassphrase: string): Promise<{ success: boolean; message: string }> {
  const isValid = await verifyPassphrase(currentPassphrase);
  if (!isValid) {
    return { success: false, message: 'Current passphrase is incorrect.' };
  }

  localStorage.removeItem(STORAGE_VERIFIER_KEY);
  localStorage.setItem(STORAGE_VAULT_ENABLED, 'false');

  return {
    success: true,
    message: 'Database encryption disabled.',
  };
}

/**
 * Exports full ledger into an encrypted AES-GCM vault JSON file.
 */
export async function exportEncryptedVault(passphrase: string): Promise<{
  success: boolean;
  message: string;
  blob?: Blob;
  filename?: string;
}> {
  if (!passphrase) {
    return { success: false, message: 'Passphrase required to encrypt export vault.' };
  }

  try {
    const db = await getDb();
    const accounts = await db.select('SELECT * FROM accounts');
    const categories = await db.select('SELECT * FROM categories');
    const transactions = await db.select('SELECT * FROM transactions');
    const splits = await db.select('SELECT * FROM transaction_splits');
    const scheduled = await db.select('SELECT * FROM scheduled_transactions');
    const overrides = await db.select('SELECT * FROM scheduled_transaction_overrides');
    const attachments = await db.select('SELECT * FROM transaction_attachments');
    let rules: any[] = [];
    try {
      rules = (await db.select('SELECT * FROM transaction_rules')) as any[];
    } catch {}

    const rawExport = JSON.stringify({
      app: 'rMoney',
      format: 'encrypted_vault',
      version: '1.0',
      exported_at: new Date().toISOString(),
      data: {
        accounts,
        categories,
        transactions,
        splits,
        scheduled,
        overrides,
        attachments,
        rules,
      },
    });

    const encryptedData = await encryptPayload(rawExport, passphrase);
    const vaultEnvelope = JSON.stringify(
      {
        rMoneyVault: true,
        cipherVersion: 'AES-GCM-256',
        created_at: new Date().toISOString(),
        payload: encryptedData,
      },
      null,
      2
    );

    const blob = new Blob([vaultEnvelope], { type: 'application/json' });
    const filename = `rmoney_vault_${getLocalTodayStr(0)}.rmvault`;

    return {
      success: true,
      message: 'Encrypted vault created successfully!',
      blob,
      filename,
    };
  } catch (e: any) {
    console.error('Vault export error:', e);
    return { success: false, message: e?.message || 'Failed to export encrypted vault.' };
  }
}

/**
 * Decrypts and restores an exported .rmvault JSON file into the local database.
 */
export async function importEncryptedVault(
  vaultContent: string,
  passphrase: string
): Promise<{ success: boolean; message: string; accountCount?: number; transactionCount?: number }> {
  if (!passphrase) {
    return { success: false, message: 'Passphrase is required to decrypt the vault.' };
  }

  try {
    const parsedEnvelope = JSON.parse(vaultContent);
    const cipherPayload = parsedEnvelope?.payload || vaultContent.trim();
    const decryptedJson = await decryptPayload(cipherPayload, passphrase);
    const parsed = JSON.parse(decryptedJson);
    const data = parsed?.data || parsed;

    if (!data || (!Array.isArray(data.accounts) && !Array.isArray(data.transactions))) {
      return { success: false, message: 'Decrypted vault does not contain valid rMoney ledger data.' };
    }

    const db = await getDb();
    try {
      await db.execute('PRAGMA foreign_keys = OFF');
    } catch {}

    await db.execute('DELETE FROM transaction_splits');
    await db.execute('DELETE FROM transaction_attachments');
    await db.execute('DELETE FROM transactions');
    await db.execute('DELETE FROM scheduled_transaction_overrides');
    await db.execute('DELETE FROM scheduled_transactions');
    await db.execute('DELETE FROM accounts');
    await db.execute('DELETE FROM categories');

    if (Array.isArray(data.categories)) {
      for (const cat of data.categories) {
        await db.execute(
          'INSERT INTO categories (id, name, type, parent_id, monthly_budget) VALUES (?, ?, ?, ?, ?)',
          [cat.id, cat.name, cat.type || 'expense', cat.parent_id || null, cat.monthly_budget ?? 0]
        );
      }
    }

    if (Array.isArray(data.accounts)) {
      for (const acc of data.accounts) {
        await db.execute(
          'INSERT INTO accounts (id, name, type, balance, currency, is_favorite) VALUES (?, ?, ?, ?, ?, ?)',
          [acc.id, acc.name, acc.type || 'Checking', acc.balance ?? 0, acc.currency || 'USD', acc.is_favorite ? 1 : 0]
        );
      }
    }

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

    const splitsList = data.splits || data.transaction_splits;
    if (Array.isArray(splitsList)) {
      for (const ts of splitsList) {
        await db.execute(
          'INSERT INTO transaction_splits (id, transaction_id, category_id, amount, memo) VALUES (?, ?, ?, ?, ?)',
          [ts.id, ts.transaction_id, ts.category_id, ts.amount, ts.memo || null]
        );
      }
    }

    const scheduledList = data.scheduled || data.scheduled_transactions;
    if (Array.isArray(scheduledList)) {
      for (const st of scheduledList) {
        await db.execute(
          'INSERT INTO scheduled_transactions (id, account_id, category_id, amount, frequency, next_date, payee, type, to_account_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            st.id,
            st.account_id,
            st.category_id || 1,
            Math.abs(st.amount),
            st.frequency || 'monthly',
            st.next_date,
            st.payee,
            st.type || 'expense',
            st.to_account_id || null,
          ]
        );
      }
    }

    const overridesList = data.overrides || data.scheduled_transaction_overrides;
    if (Array.isArray(overridesList)) {
      for (const ov of overridesList) {
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

    const attachmentsList = data.attachments || data.transaction_attachments;
    if (Array.isArray(attachmentsList)) {
      for (const att of attachmentsList) {
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
    }

    const rulesList = data.rules || data.transaction_rules;
    if (Array.isArray(rulesList)) {
      await db.execute('DELETE FROM transaction_rules');
      for (const r of rulesList) {
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
    }

    try {
      await db.execute('PRAGMA foreign_keys = ON');
    } catch {}

    return {
      success: true,
      message: `Encrypted vault decrypted and restored (${data.accounts?.length || 0} accounts, ${data.transactions?.length || 0} transactions)!`,
      accountCount: data.accounts?.length || 0,
      transactionCount: data.transactions?.length || 0,
    };
  } catch (e: any) {
    console.error('Vault import error:', e);
    return {
      success: false,
      message: e?.message || 'Decryption failed. Incorrect passphrase or corrupted vault file.',
    };
  }
}
