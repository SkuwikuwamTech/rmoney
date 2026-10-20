// rMoney Licensing System

const LICENSE_KEY_STORAGE = 'rmoney_license_key';
const LICENSE_ACTIVATED_STORAGE = 'rmoney_license_activated_at';

export interface LicenseInfo {
  isPro: boolean;
  tier: 'free' | 'pro';
  key: string | null;
  activatedAt: string | null;
}

export function getLicenseInfo(): LicenseInfo {
  const key = localStorage.getItem(LICENSE_KEY_STORAGE);
  const activatedAt = localStorage.getItem(LICENSE_ACTIVATED_STORAGE);

  if (key && validateKeyFormat(key)) {
    return {
      isPro: true,
      tier: 'pro',
      key,
      activatedAt,
    };
  }

  return {
    isPro: false,
    tier: 'free',
    key: null,
    activatedAt: null,
  };
}

export function isPro(): boolean {
  return getLicenseInfo().isPro;
}

/**
 * Validates license key format.
 * Accepts keys in the format:
 * - RMONEY-PRO-XXXX-XXXX-XXXX
 * - RMONEY-LIFETIME-XXXX-XXXX
 * - Or developer master keys (e.g. RMONEY-PRO-TESTER, RMONEY-PRO-EARLY-BIRD)
 */
export function validateKeyFormat(rawKey: string): boolean {
  const clean = rawKey.trim().toUpperCase();
  if (!clean.startsWith('RMONEY-')) return false;

  // Master demo/developer keys
  if (
    clean === 'RMONEY-PRO-TESTER' ||
    clean === 'RMONEY-PRO-EARLY-BIRD' ||
    clean === 'RMONEY-PRO-LIFETIME' ||
    clean === 'RMONEY-PRO-DEMO'
  ) {
    return true;
  }

  // Segment format: RMONEY-(PRO|LIFETIME)-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}
  const parts = clean.split('-');
  if (parts.length >= 4 && (parts[1] === 'PRO' || parts[1] === 'LIFETIME')) {
    // Check that segments contain alphanumeric characters
    return parts.slice(2).every((p) => p.length >= 3 && /^[A-Z0-9]+$/.test(p));
  }

  return false;
}

export function activateLicense(rawKey: string): { success: boolean; message: string } {
  const clean = rawKey.trim().toUpperCase();
  if (!clean) {
    return { success: false, message: 'Please enter a license key.' };
  }

  if (!validateKeyFormat(clean)) {
    return {
      success: false,
      message: 'Invalid license key format. Keys should look like RMONEY-PRO-XXXX-XXXX-XXXX',
    };
  }

  const now = new Date().toISOString();
  localStorage.setItem(LICENSE_KEY_STORAGE, clean);
  localStorage.setItem(LICENSE_ACTIVATED_STORAGE, now);

  // Dispatch custom event so all active components instantly react
  window.dispatchEvent(new CustomEvent('rmoney_license_changed', { detail: { isPro: true, key: clean } }));

  return { success: true, message: 'rMoney Pro activated successfully! All limits unlocked.' };
}

export function deactivateLicense(): void {
  localStorage.removeItem(LICENSE_KEY_STORAGE);
  localStorage.removeItem(LICENSE_ACTIVATED_STORAGE);

  window.dispatchEvent(new CustomEvent('rmoney_license_changed', { detail: { isPro: false, key: null } }));
}
