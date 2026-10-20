import { getDb } from './db';
import { ScheduledTransaction } from '../types';

const STORAGE_NOTIFICATIONS_KEY = 'rmoney_notifications_enabled';
const STORAGE_LAST_NOTIFIED_KEY = 'rmoney_bills_last_notified';

export function isNotificationEnabled(): boolean {
  const val = localStorage.getItem(STORAGE_NOTIFICATIONS_KEY);
  return val === null ? true : val === 'true';
}

export function setNotificationEnabled(enabled: boolean): void {
  localStorage.setItem(STORAGE_NOTIFICATIONS_KEY, String(enabled));
}

/**
 * Sends a native desktop notification via Tauri with fallback to Web Notifications.
 */
export async function sendDesktopNotification(title: string, body: string): Promise<boolean> {
  if (!isNotificationEnabled()) return false;

  try {
    const { isPermissionGranted, requestPermission, sendNotification } = await import(
      '@tauri-apps/plugin-notification'
    );
    let permissionGranted = await isPermissionGranted();
    if (!permissionGranted) {
      const permission = await requestPermission();
      permissionGranted = permission === 'granted';
    }

    if (permissionGranted) {
      sendNotification({ title, body });
      return true;
    }
  } catch {
    // Web fallback if outside Tauri or running in dev browser
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification(title, { body, icon: '/favicon.ico' });
        return true;
      } else if (Notification.permission !== 'denied') {
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
          new Notification(title, { body, icon: '/favicon.ico' });
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Checks for bills due within the next 3 days and triggers a desktop reminder once per day.
 */
export async function checkAndNotifyUpcomingBills(): Promise<{ count: number; total: number }> {
  if (!isNotificationEnabled()) return { count: 0, total: 0 };

  const todayStr = new Date().toISOString().split('T')[0];
  const lastNotified = localStorage.getItem(STORAGE_LAST_NOTIFIED_KEY);

  // Avoid notifying more than once per calendar day on launch
  if (lastNotified === todayStr) {
    return { count: 0, total: 0 };
  }

  try {
    const db = await getDb();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 3);
    const targetDateStr = futureDate.toISOString().split('T')[0];

    // Find upcoming expense bills
    const upcoming = (await db.select(
      `SELECT st.*, COALESCE(o.new_date, st.next_date) as effective_date, COALESCE(o.new_amount, st.amount) as effective_amount
       FROM scheduled_transactions st
       LEFT JOIN scheduled_transaction_overrides o ON o.scheduled_id = st.id AND o.original_date = st.next_date
       WHERE COALESCE(st.type, 'expense') = 'expense'
         AND COALESCE(o.new_date, st.next_date) <= ?
         AND COALESCE(o.new_date, st.next_date) >= ?
       ORDER BY effective_date ASC`,
      [targetDateStr, todayStr]
    )) as (ScheduledTransaction & { effective_date: string; effective_amount: number })[];

    if (upcoming.length > 0) {
      const total = upcoming.reduce((sum, b) => sum + (b.effective_amount || b.amount), 0);
      const title =
        upcoming.length === 1
          ? `Bill Reminder: ${upcoming[0].payee}`
          : `Upcoming Bills: ${upcoming.length} Payments Due Soon`;
      const body =
        upcoming.length === 1
          ? `Due on ${upcoming[0].effective_date} for $${upcoming[0].effective_amount.toFixed(2)}. Open rMoney to review.`
          : `${upcoming.length} bills due in the next 3 days totaling $${total.toFixed(2)}.`;

      await sendDesktopNotification(title, body);
      localStorage.setItem(STORAGE_LAST_NOTIFIED_KEY, todayStr);
      return { count: upcoming.length, total };
    }
  } catch (e) {
    console.warn('Could not check upcoming bill notifications:', e);
  }

  return { count: 0, total: 0 };
}
