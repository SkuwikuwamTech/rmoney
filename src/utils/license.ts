// rMoney Licensing & Payment System
// Integrated with Lemon Squeezy / Gumroad Merchant of Record APIs

const LICENSE_KEY_STORAGE = 'rmoney_license_key';
const LICENSE_ACTIVATED_STORAGE = 'rmoney_license_activated_at';
const LICENSE_EMAIL_STORAGE = 'rmoney_license_email';
const LICENSE_INSTANCE_STORAGE = 'rmoney_license_instance_id';

// Default Lemon Squeezy hosted checkout link for rMoney Pro ($29 Lifetime)
export const DEFAULT_CHECKOUT_URL =
  'https://skuwikuwamtech.lemonsqueezy.com/checkout/buy/485af06a-9388-44c7-a506-fd1cd2c4f3e5';
export const FALLBACK_CHECKOUT_URL = 'https://skuwikuwamtech.com/pricing.html';

export interface LicenseInfo {
  isPro: boolean;
  tier: 'free' | 'pro';
  key: string | null;
  activatedAt: string | null;
  customerEmail?: string | null;
  instanceId?: string | null;
}

/**
 * Returns a persistent or newly generated unique hardware/device instance ID
 */
export function getOrCreateInstanceId(): string {
  let id = localStorage.getItem(LICENSE_INSTANCE_STORAGE);
  if (!id) {
    id = 'rmoney-inst-' + Math.random().toString(36).substring(2, 10) + '-' + Date.now().toString(36);
    localStorage.setItem(LICENSE_INSTANCE_STORAGE, id);
  }
  return id;
}

/**
 * Returns active checkout URL
 */
export function getCheckoutUrl(): string {
  return DEFAULT_CHECKOUT_URL;
}

/**
 * Opens checkout link in the user's default system browser using Tauri plugin-opener
 */
export async function openCheckoutPage(): Promise<void> {
  const url = getCheckoutUrl();
  try {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
  } catch {
    if ((window as any).LemonSqueezy?.Url?.Open) {
      (window as any).LemonSqueezy.Url.Open(url);
    } else {
      window.open(url, '_blank');
    }
  }
}

/**
 * Retrieves the currently active license information
 */
export function getLicenseInfo(): LicenseInfo {
  const key = localStorage.getItem(LICENSE_KEY_STORAGE);
  const activatedAt = localStorage.getItem(LICENSE_ACTIVATED_STORAGE);
  const customerEmail = localStorage.getItem(LICENSE_EMAIL_STORAGE);
  const instanceId = localStorage.getItem(LICENSE_INSTANCE_STORAGE);

  if (key && validateKeyFormat(key)) {
    return {
      isPro: true,
      tier: 'pro',
      key,
      activatedAt,
      customerEmail,
      instanceId,
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
 * Validates license key format against supported patterns:
 * 1. Standard Lemon Squeezy UUID format (e.g. 8a05e26b-6b21-4f10-9b41-9457635678cd)
 * 2. Gumroad key format (XXXXXX-XXXXXX-XXXXXX-XXXXXX)
 * 3. Custom offline format (RMONEY-PRO-XXXX-XXXX-XXXX or RMONEY-LIFETIME-XXXX-XXXX)
 * 4. Master developer / gift keys
 */
export function validateKeyFormat(rawKey: string): boolean {
  const clean = rawKey.trim();
  if (!clean) return false;

  // 1. UUID format (Lemon Squeezy default)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(clean)) return true;

  const upper = clean.toUpperCase();

  // 2. Master demo/developer keys
  if (
    upper === 'RMONEY-PRO-TESTER' ||
    upper === 'RMONEY-PRO-EARLY-BIRD' ||
    upper === 'RMONEY-PRO-LIFETIME' ||
    upper === 'RMONEY-PRO-DEMO'
  ) {
    return true;
  }

  // 3. Segmented RMONEY prefix format
  if (upper.startsWith('RMONEY-')) {
    const parts = upper.split('-');
    if (parts.length >= 4 && (parts[1] === 'PRO' || parts[1] === 'LIFETIME')) {
      return parts.slice(2).every((p) => p.length >= 3 && /^[A-Z0-9]+$/.test(p));
    }
  }

  // 4. Standard 16-32 character alphanumeric keys (e.g. Gumroad / Stripe license format)
  const genericKeyRegex = /^[A-Z0-9]{4,8}(-[A-Z0-9]{4,8}){2,5}$/i;
  if (genericKeyRegex.test(clean)) {
    return true;
  }

  return false;
}

/**
 * Activates a license key with Lemon Squeezy cloud verification and offline resilience
 */
export async function activateLicense(rawKey: string): Promise<{ success: boolean; message: string; customerEmail?: string }> {
  const clean = rawKey.trim();
  if (!clean) {
    return { success: false, message: 'Please enter a license key.' };
  }

  if (!validateKeyFormat(clean)) {
    return {
      success: false,
      message: 'Invalid license key format. Keys should look like a Lemon Squeezy key or RMONEY-PRO-XXXX-XXXX.',
    };
  }

  const instanceId = getOrCreateInstanceId();
  const upper = clean.toUpperCase();

  // Bypass cloud check for offline master developer keys
  if (
    upper === 'RMONEY-PRO-TESTER' ||
    upper === 'RMONEY-PRO-EARLY-BIRD' ||
    upper === 'RMONEY-PRO-LIFETIME' ||
    upper === 'RMONEY-PRO-DEMO'
  ) {
    saveLicenseLocally(clean, 'developer@skuwikuwamtech.com');
    return {
      success: true,
      message: 'rMoney Pro activated via master developer key! All features unlocked.',
    };
  }

  // Attempt online validation via Lemon Squeezy License Activation API
  try {
    const formData = new URLSearchParams();
    formData.append('license_key', clean);
    formData.append('instance_name', instanceId);

    const response = await fetch('https://api.lemonsqueezy.com/v1/licenses/activate', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
      },
      body: formData,
    });

    if (response.ok) {
      const data = await response.json();
      if (data.activated) {
        const customerEmail = data.meta?.customer_email || 'Customer';
        saveLicenseLocally(clean, customerEmail);
        return {
          success: true,
          message: `rMoney Pro activated successfully! Licensed to ${customerEmail}.`,
          customerEmail,
        };
      } else if (data.error) {
        return {
          success: false,
          message: data.error || 'The entered license key could not be activated.',
        };
      }
    } else {
      const errData = await response.json().catch(() => null);
      if (errData?.error) {
        return {
          success: false,
          message: errData.error,
        };
      }
    }
  } catch (netErr) {
    console.warn('[rMoney Licensing] Online verification unavailable, testing offline compatibility:', netErr);
  }

  // Graceful Offline Activation fallback:
  // If the user is offline but provides a valid structural key, activate locally
  saveLicenseLocally(clean, null);
  return {
    success: true,
    message: 'rMoney Pro activated in offline mode! All Pro features unlocked.',
  };
}

function saveLicenseLocally(key: string, customerEmail?: string | null): void {
  const now = new Date().toISOString();
  localStorage.setItem(LICENSE_KEY_STORAGE, key);
  localStorage.setItem(LICENSE_ACTIVATED_STORAGE, now);
  if (customerEmail) {
    localStorage.setItem(LICENSE_EMAIL_STORAGE, customerEmail);
  }

  window.dispatchEvent(
    new CustomEvent('rmoney_license_changed', {
      detail: { isPro: true, key, customerEmail },
    })
  );
}

/**
 * Deactivates active license on this device
 */
export async function deactivateLicense(): Promise<{ success: boolean; message: string }> {
  const key = localStorage.getItem(LICENSE_KEY_STORAGE);
  const instanceId = localStorage.getItem(LICENSE_INSTANCE_STORAGE);

  if (key && instanceId) {
    // Notify Lemon Squeezy to free up the activation slot if connected
    try {
      const formData = new URLSearchParams();
      formData.append('license_key', key);
      formData.append('instance_id', instanceId);

      await fetch('https://api.lemonsqueezy.com/v1/licenses/deactivate', {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: formData,
      });
    } catch (e) {
      console.warn('[rMoney Licensing] Remote deactivation failed or offline:', e);
    }
  }

  localStorage.removeItem(LICENSE_KEY_STORAGE);
  localStorage.removeItem(LICENSE_ACTIVATED_STORAGE);
  localStorage.removeItem(LICENSE_EMAIL_STORAGE);

  window.dispatchEvent(
    new CustomEvent('rmoney_license_changed', {
      detail: { isPro: false, key: null },
    })
  );

  return { success: true, message: 'License deactivated on this device.' };
}
