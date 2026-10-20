/**
 * Bank-Grade Database Encryption at Rest (AES-GCM-256 + PBKDF2)
 * Provides authenticated encryption for local database storage, backups, and secure data vaults.
 */
import { getDb } from './db';

const STORAGE_VAULT_ENABLED = 'rmoney_encryption_enabled';
const STORAGE_VERIFIER_KEY = 'rmoney_vault_verifier';

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
    const filename = `rmoney_vault_${new Date().toISOString().split('T')[0]}.rmvault`;

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
