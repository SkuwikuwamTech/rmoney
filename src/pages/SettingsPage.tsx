import { useState, useEffect } from 'react';
import { getDb } from '../utils/db';
import { Category } from '../types';
import {
  Tag,
  Plus,
  Trash2,
  Edit2,
  Download,
  Upload,
  Database,
  CheckCircle,
  AlertTriangle,
  RotateCcw,
  Moon,
  Sun,
  FileSpreadsheet,
  Sparkles,
  Eye,
  EyeOff,
  Lock,
  Key,
  Shield,
  Archive,
  Clock,
  HardDrive,
  Crown,
  Zap,
  Globe,
  Compass,
  ListChecks,
  RefreshCw,
  ArrowUpCircle,
  Check,
  CheckCircle2,
  Paperclip,
  TrendingUp,
  Wallet,
  FileText,
  FolderSync,
  Smartphone,
  QrCode,
  Wifi,
  Cloud,
} from 'lucide-react';
import DeviceSyncModal from '../components/DeviceSyncModal';
import {
  getOrCreateDeviceName,
  getPairedDevices,
  getCloudSyncSettings,
} from '../utils/syncEngine';
import {
  checkForUpdates,
  isAutoCheckEnabled,
  setAutoCheckEnabled,
  getLastCheckTime,
  getMockUpdate,
  AppUpdateInfo,
} from '../utils/updater';
import UpdateModal from '../components/UpdateModal';
import { seedDemoData, resetToCleanSlate } from '../utils/demoData';
import {
  createRollingBackup,
  listRollingBackups,
  restoreRollingBackup,
  deleteRollingBackup,
  RollingBackupMeta,
} from '../utils/backupManager';
import { activateLicense, deactivateLicense, getLicenseInfo } from '../utils/license';
import {
  isEncryptionEnabled,
  setupEncryption,
  disableEncryption,
  exportEncryptedVault,
} from '../utils/encryption';
import {
  getTransactionRules,
  createTransactionRule,
  deleteTransactionRule,
  toggleRuleActive,
  runRulesOnExistingTransactions,
  seedDefaultRulesIfEmpty,
  matchRuleForTransaction,
} from '../utils/rulesEngine';
import { TransactionRule } from '../types';
import {
  useRegionalSettings,
  SUPPORTED_CURRENCIES,
  SUPPORTED_DATE_FORMATS,
  DateFormatOption,
} from '../utils/currency';

interface SettingsPageProps {
  onDataRestored?: () => Promise<void>;
  darkMode?: boolean;
  onToggleDarkMode?: (enabled: boolean) => void;
  privacyMode?: boolean;
  onTogglePrivacyMode?: (enabled: boolean) => void;
  hasPin?: boolean;
  onUpdatePin?: (pin: string | null) => void;
  proStatus?: boolean;
  onTriggerUpgrade?: (reason: 'accounts_limit' | 'what_if_locked' | 'general') => void;
  onLaunchOnboarding?: () => void;
}

const SettingsPage = ({
  onDataRestored,
  darkMode = false,
  onToggleDarkMode,
  privacyMode = false,
  onTogglePrivacyMode,
  hasPin = false,
  onUpdatePin,
  proStatus = false,
  onTriggerUpgrade,
  onLaunchOnboarding,
}: SettingsPageProps) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // Regional & Currency Settings
  const {
    currency,
    dateFormat,
    setCurrency,
    setDateFormat,
    formatCurrency: fmtCurr,
    formatDate: fmtDate,
  } = useRegionalSettings();

  // Auto-Update State
  const [autoCheckUpdates, setAutoCheckUpdatesState] = useState<boolean>(() => isAutoCheckEnabled());
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [activeUpdateInfo, setActiveUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [lastCheckedStr, setLastCheckedStr] = useState<string | null>(() => getLastCheckTime());

  const handleToggleAutoCheck = (enabled: boolean) => {
    setAutoCheckUpdatesState(enabled);
    setAutoCheckEnabled(enabled);
  };

  const handleManualCheckUpdates = async () => {
    setIsCheckingUpdate(true);
    try {
      const upd = await checkForUpdates(true);
      setLastCheckedStr(new Date().toISOString());
      if (upd && upd.available) {
        setActiveUpdateInfo(upd);
      } else {
        const curVer = upd?.currentVersion || '1.0.0';
        showStatus(`You are running the latest version of rMoney (v${curVer})!`);
      }
    } catch (e: any) {
      setLastCheckedStr(new Date().toISOString());
      showStatus(
        'Could not reach update server. Please check your internet connection.'
      );
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const handleSimulateUpdate = () => {
    setActiveUpdateInfo(getMockUpdate());
  };

  // Device Sync State
  const [isDeviceSyncModalOpen, setIsDeviceSyncModalOpen] = useState(false);
  const [syncDeviceName, setSyncDeviceName] = useState(() => getOrCreateDeviceName());
  const [pairedDeviceCount, setPairedDeviceCount] = useState(() => getPairedDevices().length);
  const [cloudSyncConfig, setCloudSyncConfig] = useState(() => getCloudSyncSettings());

  useEffect(() => {
    const handleSyncEvent = () => {
      setSyncDeviceName(getOrCreateDeviceName());
      setPairedDeviceCount(getPairedDevices().length);
      setCloudSyncConfig(getCloudSyncSettings());
    };
    window.addEventListener('rmoney_sync_completed', handleSyncEvent);
    return () => window.removeEventListener('rmoney_sync_completed', handleSyncEvent);
  }, []);

  // License & Edition State
  const [licenseInput, setLicenseInput] = useState('');
  const licenseInfo = getLicenseInfo();

  const handleActivateLicense = () => {
    if (!licenseInput.trim()) {
      showStatus('Please enter a license key.', 'error');
      return;
    }
    const res = activateLicense(licenseInput.trim());
    if (res.success) {
      showStatus(res.message);
      setLicenseInput('');
    } else {
      showStatus(res.message, 'error');
    }
  };

  const handleDeactivateLicense = () => {
    if (confirm('Are you sure you want to deactivate your rMoney Pro license on this device? (You can re-enter your key at any time).')) {
      deactivateLicense();
      showStatus('rMoney Pro license deactivated. Switched to Free tier.');
    }
  };

  // New Category Form
  const [newCatName, setNewCatName] = useState('');
  const [newCatType, setNewCatType] = useState<'expense' | 'income'>('expense');
  const [newCatBudget, setNewCatBudget] = useState('');

  // Edit Category State
  const [editingCatId, setEditingCatId] = useState<number | null>(null);
  const [editingCatName, setEditingCatName] = useState('');
  const [editingCatBudget, setEditingCatBudget] = useState('');

  // Status message
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Security PIN state
  const [isSettingPin, setIsSettingPin] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');

  const handleSavePin = () => {
    if (pinInput.length < 4) {
      showStatus('PIN must be at least 4 digits.', 'error');
      return;
    }
    if (pinInput !== pinConfirm) {
      showStatus('PINs do not match. Please verify.', 'error');
      return;
    }
    if (onUpdatePin) {
      onUpdatePin(pinInput);
      showStatus('Security PIN created successfully!');
    }
    setPinInput('');
    setPinConfirm('');
    setIsSettingPin(false);
  };

  const handleRemovePin = () => {
    if (confirm('Are you sure you want to disable the PIN lock on this device?')) {
      if (onUpdatePin) {
        onUpdatePin(null);
        showStatus('Security PIN removed.');
      }
    }
  };

  // Database Encryption State
  const [vaultEncrypted, setVaultEncrypted] = useState<boolean>(() => isEncryptionEnabled());
  const [isSettingEncryption, setIsSettingEncryption] = useState<boolean>(false);
  const [encInput, setEncInput] = useState<string>('');
  const [encConfirm, setEncConfirm] = useState<string>('');
  const [isExportingVault, setIsExportingVault] = useState<boolean>(false);

  const handleEnableEncryption = async () => {
    if (encInput.length < 6) {
      showStatus('Passphrase must be at least 6 characters.', 'error');
      return;
    }
    if (encInput !== encConfirm) {
      showStatus('Passphrases do not match. Please verify.', 'error');
      return;
    }
    const res = await setupEncryption(encInput);
    if (res.success) {
      setVaultEncrypted(true);
      setIsSettingEncryption(false);
      setEncInput('');
      setEncConfirm('');
      showStatus(res.message);
      window.dispatchEvent(new CustomEvent('rmoney_encryption_changed', { detail: { enabled: true } }));
    } else {
      showStatus(res.message, 'error');
    }
  };

  const handleDisableEncryption = async () => {
    const pass = prompt('Enter your current master passphrase to decrypt and unlock the database:');
    if (!pass) return;
    const res = await disableEncryption(pass);
    if (res.success) {
      setVaultEncrypted(false);
      showStatus(res.message);
      window.dispatchEvent(new CustomEvent('rmoney_encryption_changed', { detail: { enabled: false } }));
    } else {
      showStatus(res.message, 'error');
    }
  };

  const handleExportVault = async () => {
    const pass = prompt('Enter a master passphrase to seal your encrypted vault file (.rmvault):');
    if (!pass) return;
    if (pass.length < 6) {
      showStatus('Vault passphrase must be at least 6 characters.', 'error');
      return;
    }
    setIsExportingVault(true);
    try {
      const res = await exportEncryptedVault(pass);
      if (res.success && res.blob && res.filename) {
        const url = URL.createObjectURL(res.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = res.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showStatus('Encrypted security vault exported successfully!');
      } else {
        showStatus(res.message || 'Export failed.', 'error');
      }
    } catch (err: any) {
      showStatus('Failed to generate vault: ' + (err?.message || 'Unknown error'), 'error');
    } finally {
      setIsExportingVault(false);
    }
  };

  const showStatus = (text: string, type: 'success' | 'error' = 'success') => {
    setStatusMsg({ text, type });
    setTimeout(() => setStatusMsg(null), 3500);
  };

  const [rollingBackups, setRollingBackups] = useState<RollingBackupMeta[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);

  const loadRollingBackupsList = async () => {
    setLoadingBackups(true);
    try {
      const list = await listRollingBackups();
      setRollingBackups(list);
    } catch (e) {
      console.error('Error loading rolling backups:', e);
    } finally {
      setLoadingBackups(false);
    }
  };

  const loadCategories = async () => {
    setLoading(true);
    try {
      const db = await getDb();
      const cats = (await db.select('SELECT * FROM categories ORDER BY type DESC, name ASC')) as Category[];
      setCategories(cats);
    } catch (e) {
      console.error('Error loading categories:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
    loadRollingBackupsList();
    loadRules();
  }, []);

  // Transaction Rules State
  const [rules, setRules] = useState<TransactionRule[]>([]);
  const [loadingRules, setLoadingRules] = useState(false);
  const [isAddingRule, setIsAddingRule] = useState(false);
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleField, setNewRuleField] = useState<'payee' | 'memo'>('payee');
  const [newRuleType, setNewRuleType] = useState<'contains' | 'exact' | 'starts_with'>('contains');
  const [newRuleValue, setNewRuleValue] = useState('');
  const [newRuleCatId, setNewRuleCatId] = useState<number>(1);
  const [isRunningRules, setIsRunningRules] = useState(false);

  // Editing Rule State
  const [editingRule, setEditingRule] = useState<TransactionRule | null>(null);
  const [editRuleName, setEditRuleName] = useState('');
  const [editRuleField, setEditRuleField] = useState<'payee' | 'memo'>('payee');
  const [editRuleType, setEditRuleType] = useState<'contains' | 'exact' | 'starts_with'>('contains');
  const [editRuleValue, setEditRuleValue] = useState('');
  const [editRuleCatId, setEditRuleCatId] = useState<number>(1);

  const handleStartEditRule = (rule: TransactionRule) => {
    setEditingRule(rule);
    setEditRuleName(rule.name);
    setEditRuleField(rule.match_field);
    setEditRuleType(rule.match_type);
    setEditRuleValue(rule.match_value);
    setEditRuleCatId(rule.category_id);
  };

  const handleSaveEditRule = async () => {
    if (!editingRule || !editRuleName.trim() || !editRuleValue.trim()) return;
    try {
      const db = await getDb();
      await db.execute(
        `UPDATE transaction_rules 
         SET name = ?, match_field = ?, match_type = ?, match_value = ?, category_id = ?
         WHERE id = ?`,
        [editRuleName.trim(), editRuleField, editRuleType, editRuleValue.trim(), editRuleCatId, editingRule.id]
      );
      setEditingRule(null);
      showStatus(`Rule "${editRuleName.trim()}" updated successfully!`);
      await loadRules();
    } catch (e: any) {
      showStatus('Failed to update rule: ' + e.message, 'error');
    }
  };

  const loadRules = async () => {
    setLoadingRules(true);
    try {
      await seedDefaultRulesIfEmpty();
      const list = await getTransactionRules();
      setRules(list);
    } catch (e) {
      console.error('Error loading rules:', e);
    } finally {
      setLoadingRules(false);
    }
  };

  const handleCreateRule = async () => {
    if (!newRuleName.trim() || !newRuleValue.trim()) {
      showStatus('Please enter a rule name and match keyword.', 'error');
      return;
    }
    const catId = newRuleCatId || categories[0]?.id || 1;
    const res = await createTransactionRule({
      name: newRuleName.trim(),
      match_field: newRuleField,
      match_type: newRuleType,
      match_value: newRuleValue.trim(),
      category_id: catId,
      is_active: true,
    });
    if (res) {
      showStatus(`Rule "${newRuleName.trim()}" created successfully!`);
      setNewRuleName('');
      setNewRuleValue('');
      setIsAddingRule(false);
      await loadRules();
    } else {
      showStatus('Failed to create rule.', 'error');
    }
  };

  const handleDeleteRule = async (id: number, name: string) => {
    if (!confirm(`Are you sure you want to delete the rule "${name}"?`)) return;
    const ok = await deleteTransactionRule(id);
    if (ok) {
      showStatus(`Rule "${name}" deleted.`);
      await loadRules();
    } else {
      showStatus('Failed to delete rule.', 'error');
    }
  };

  const handleToggleRule = async (id: number, currentActive: boolean) => {
    const ok = await toggleRuleActive(id, !currentActive);
    if (ok) {
      await loadRules();
    }
  };

  const handleExecuteAllRules = async () => {
    setIsRunningRules(true);
    try {
      const res = await runRulesOnExistingTransactions(false);
      showStatus(`Rules evaluation complete! Processed ${res.processed} transactions, auto-categorized ${res.updated} entries.`);
      if (onDataRestored) await onDataRestored();
    } catch (e: any) {
      showStatus('Error running rules: ' + (e?.message || 'Unknown error'), 'error');
    } finally {
      setIsRunningRules(false);
    }
  };

  const handleCreateSnapshot = async () => {
    try {
      await createRollingBackup('Manual Snapshot', 5);
      showStatus('Local backup snapshot created successfully!');
      await loadRollingBackupsList();
    } catch (e) {
      console.error('Error creating snapshot:', e);
      showStatus('Failed to create backup snapshot.', 'error');
    }
  };

  const handleRestoreSnapshot = async (b: RollingBackupMeta) => {
    const formattedDate = new Date(b.created_at).toLocaleString();
    if (
      !confirm(
        `Are you sure you want to restore the snapshot "${b.label}" from ${formattedDate}?\n\nThis will restore ${b.account_count} accounts and ${b.transaction_count} transactions and overwrite your current ledger.`
      )
    ) {
      return;
    }

    try {
      await restoreRollingBackup(b.id);
      showStatus(`Snapshot "${b.label}" restored successfully!`);
      await loadCategories();
      await loadRollingBackupsList();
      if (onDataRestored) {
        await onDataRestored();
      }
    } catch (e) {
      console.error('Error restoring snapshot:', e);
      showStatus('Failed to restore snapshot.', 'error');
    }
  };

  const handleDeleteSnapshot = async (b: RollingBackupMeta) => {
    if (!confirm(`Delete snapshot "${b.label}" from ${new Date(b.created_at).toLocaleString()}?`)) {
      return;
    }
    try {
      await deleteRollingBackup(b.id);
      showStatus('Snapshot removed.');
      await loadRollingBackupsList();
    } catch (e) {
      console.error('Error deleting snapshot:', e);
      showStatus('Failed to delete snapshot.', 'error');
    }
  };

  const handleDownloadSnapshotJSON = async (b: RollingBackupMeta) => {
    try {
      const db = await getDb();
      const rows = (await db.select('SELECT data_json FROM local_backups WHERE id = ?', [b.id])) as { data_json: string }[];
      if (!rows || rows.length === 0) return;

      const blob = new Blob([rows[0].data_json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rmoney_snapshot_${new Date(b.created_at).toISOString().replace(/[:.]/g, '-')}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showStatus('Snapshot downloaded!');
    } catch (e) {
      console.error('Error downloading snapshot:', e);
      showStatus('Failed to download snapshot.', 'error');
    }
  };

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    try {
      const db = await getDb();
      const budgetNum = parseFloat(newCatBudget) || 0;
      await db.execute('INSERT INTO categories (name, type, monthly_budget) VALUES (?, ?, ?)', [
        newCatName.trim(),
        newCatType,
        budgetNum,
      ]);
      setNewCatName('');
      setNewCatBudget('');
      showStatus(`Category "${newCatName.trim()}" added successfully!`);
      await loadCategories();
    } catch (e) {
      console.error('Error adding category:', e);
      showStatus('Failed to add category.', 'error');
    }
  };

  const handleStartEdit = (cat: Category) => {
    setEditingCatId(cat.id);
    setEditingCatName(cat.name);
    setEditingCatBudget(cat.monthly_budget && cat.monthly_budget > 0 ? String(cat.monthly_budget) : '');
  };

  const handleSaveEdit = async () => {
    if (!editingCatId || !editingCatName.trim()) return;
    try {
      const db = await getDb();
      const budgetNum = parseFloat(editingCatBudget) || 0;
      await db.execute('UPDATE categories SET name = ?, monthly_budget = ? WHERE id = ?', [
        editingCatName.trim(),
        budgetNum,
        editingCatId,
      ]);
      setEditingCatId(null);
      setEditingCatName('');
      setEditingCatBudget('');
      showStatus('Category updated successfully!');
      await loadCategories();
    } catch (e) {
      console.error('Error updating category:', e);
      showStatus('Failed to update category.', 'error');
    }
  };

  const handleDeleteCategory = async (cat: Category) => {
    if (
      !confirm(
        `Are you sure you want to delete category "${cat.name}"? Transactions using this category will be reassigned to General.`
      )
    ) {
      return;
    }

    try {
      const db = await getDb();
      // Find fallback General category or create one
      const generals = (await db.select("SELECT id FROM categories WHERE name = 'General' LIMIT 1")) as {
        id: number;
      }[];
      let fallbackId = generals.length > 0 ? generals[0].id : null;

      if (!fallbackId) {
        await db.execute("INSERT INTO categories (name, type) VALUES ('General', 'expense')");
        const newGen = (await db.select("SELECT id FROM categories WHERE name = 'General' LIMIT 1")) as {
          id: number;
        }[];
        fallbackId = newGen[0].id;
      }

      // Reassign transactions
      await db.execute('UPDATE transactions SET category_id = ? WHERE category_id = ?', [
        fallbackId,
        cat.id,
      ]);
      await db.execute('UPDATE scheduled_transactions SET category_id = ? WHERE category_id = ?', [
        fallbackId,
        cat.id,
      ]);

      // Delete the category
      await db.execute('DELETE FROM categories WHERE id = ?', [cat.id]);
      showStatus(`Category "${cat.name}" deleted.`);
      await loadCategories();
    } catch (e) {
      console.error('Error deleting category:', e);
      showStatus('Failed to delete category.', 'error');
    }
  };

  const handleExportJSON = async () => {
    try {
      const db = await getDb();
      const accounts = await db.select('SELECT * FROM accounts');
      const categories = await db.select('SELECT * FROM categories');
      const transactions = await db.select('SELECT * FROM transactions');
      const scheduled = await db.select('SELECT * FROM scheduled_transactions');
      const overrides = await db.select('SELECT * FROM scheduled_transaction_overrides');

      const backupData = {
        exportDate: new Date().toISOString(),
        version: '0.1.0',
        accounts,
        categories,
        transactions,
        scheduled_transactions: scheduled,
        scheduled_transaction_overrides: overrides,
      };

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rmoney_backup_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showStatus('Backup exported as JSON!');
    } catch (e) {
      console.error('Export error:', e);
      showStatus('Failed to export backup.', 'error');
    }
  };

  const handleRestoreJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data || (!data.accounts && !data.categories && !data.transactions)) {
        alert('Invalid backup file. The selected JSON does not contain valid rMoney backup data.');
        return;
      }

      const accountCount = data.accounts?.length || 0;
      const txCount = data.transactions?.length || 0;
      const billsCount = data.scheduled_transactions?.length || 0;
      const catCount = data.categories?.length || 0;

      const confirmMsg = `Are you sure you want to restore this backup?

Export Date: ${data.exportDate ? new Date(data.exportDate).toLocaleString() : 'Unknown'}
• Accounts: ${accountCount}
• Transactions: ${txCount}
• Scheduled Transactions: ${billsCount}
• Categories: ${catCount}

WARNING: This will replace your current data with the contents of this backup file.`;

      if (!confirm(confirmMsg)) {
        e.target.value = '';
        return;
      }

      const db = await getDb();

      // Temporarily disable foreign keys during bulk replacement
      try {
        await db.execute('PRAGMA foreign_keys = OFF');
      } catch (err) {
        console.warn('Could not disable PRAGMA foreign_keys:', err);
      }

      await db.execute('DELETE FROM transactions');
      await db.execute('DELETE FROM scheduled_transaction_overrides');
      await db.execute('DELETE FROM scheduled_transactions');
      await db.execute('DELETE FROM accounts');
      await db.execute('DELETE FROM categories');

      // 1. Categories
      if (Array.isArray(data.categories)) {
        for (const cat of data.categories) {
          await db.execute(
            'INSERT INTO categories (id, name, type, parent_id) VALUES (?, ?, ?, ?)',
            [cat.id, cat.name, cat.type || 'expense', cat.parent_id || null]
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
            'INSERT INTO transactions (id, account_id, category_id, date, payee, amount, memo) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [
              tx.id,
              tx.account_id,
              tx.category_id || 1,
              tx.date,
              tx.payee,
              tx.amount,
              tx.memo || null,
            ]
          );
        }
      }

      // 4. Scheduled Transactions
      if (Array.isArray(data.scheduled_transactions)) {
        for (const st of data.scheduled_transactions) {
          await db.execute(
            'INSERT INTO scheduled_transactions (id, account_id, category_id, amount, frequency, next_date, payee, type, to_account_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
              st.id,
              st.account_id,
              st.category_id || 1,
              st.amount,
              st.frequency || 'monthly',
              st.next_date,
              st.payee,
              st.type || 'expense',
              st.to_account_id || null,
            ]
          );
        }
      }

      // 5. Scheduled Transaction Overrides
      if (Array.isArray(data.scheduled_transaction_overrides)) {
        for (const ov of data.scheduled_transaction_overrides) {
          const originalDate = ov.original_date || ov.date;
          const newDate = ov.new_date || null;
          await db.execute(
            'INSERT INTO scheduled_transaction_overrides (id, scheduled_id, original_date, new_date, date, amount, payee, account_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [
              ov.id,
              ov.scheduled_id,
              originalDate,
              newDate,
              ov.date || originalDate,
              ov.amount ?? null,
              ov.payee ?? null,
              ov.account_id ?? null,
            ]
          );
        }
      }

      // Re-enable foreign keys
      try {
        await db.execute('PRAGMA foreign_keys = ON');
      } catch (err) {
        console.warn('Could not re-enable PRAGMA foreign_keys:', err);
      }

      showStatus(`Backup successfully restored (${accountCount} accounts, ${txCount} transactions)!`);
      await loadCategories();
      if (onDataRestored) {
        await onDataRestored();
      }
    } catch (err) {
      console.error('Restore error:', err);
      showStatus('Failed to restore backup: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      e.target.value = '';
    }
  };

  const handleExportCSV = async () => {
    try {
      const db = await getDb();
      const txs = (await db.select(`
        SELECT 
          t.date, 
          a.name as account, 
          c.name as category, 
          t.payee, 
          t.amount, 
          t.memo
        FROM transactions t
        JOIN accounts a ON t.account_id = a.id
        LEFT JOIN categories c ON t.category_id = c.id
        ORDER BY t.date DESC
      `)) as {
        date: string;
        account: string;
        category: string;
        payee: string;
        amount: number;
        memo: string;
      }[];

      const headers = ['Date', 'Account', 'Category', 'Payee', 'Amount', 'Memo'];
      const rows = txs.map((t) => [
        t.date,
        `"${(t.account || '').replace(/"/g, '""')}"`,
        `"${(t.category || '').replace(/"/g, '""')}"`,
        `"${(t.payee || '').replace(/"/g, '""')}"`,
        t.amount.toFixed(2),
        `"${(t.memo || '').replace(/"/g, '""')}"`,
      ]);

      const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rmoney_transactions_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showStatus('Transactions exported as CSV!');
    } catch (e) {
      console.error('CSV export error:', e);
      showStatus('Failed to export CSV.', 'error');
    }
  };
  const handleImportMSMoney = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const isQif = file.name.toLowerCase().endsWith('.qif') || text.includes('!Type:') || text.includes('!Account');
      const isCsv = file.name.toLowerCase().endsWith('.csv') || text.includes(',') || text.includes('\t');

      if (!isQif && !isCsv) {
        showStatus('Unrecognized format. Please provide a Microsoft Money .qif or .csv export file.', 'error');
        return;
      }

      const db = await getDb();

      // Ensure categories cache
      let existingCats = (await db.select('SELECT * FROM categories')) as Category[];
      const getOrCreateCategory = async (catName: string, isIncome: boolean): Promise<number> => {
        const clean = catName.trim() || 'General';
        const found = existingCats.find((c) => c.name.toLowerCase() === clean.toLowerCase());
        if (found) return found.id;
        const res = await db.execute('INSERT INTO categories (name, type) VALUES (?, ?)', [
          clean,
          isIncome ? 'income' : 'expense',
        ]);
        const newId = (res as { lastInsertId?: number }).lastInsertId || 1;
        existingCats.push({ id: newId, name: clean, type: isIncome ? 'income' : 'expense' });
        return newId;
      };

      // Ensure accounts cache
      let existingAccs = (await db.select('SELECT * FROM accounts')) as { id: number; name: string }[];
      const getOrCreateAccount = async (accName: string, accType: string = 'Checking'): Promise<number> => {
        const clean = accName.trim() || 'Imported MS Money Account';
        const found = existingAccs.find((a) => a.name.toLowerCase() === clean.toLowerCase());
        if (found) return found.id;
        const res = await db.execute(
          'INSERT INTO accounts (name, type, balance, currency, is_favorite) VALUES (?, ?, 0, ?, 1)',
          [clean, accType, 'USD']
        );
        const newId = (res as { lastInsertId?: number }).lastInsertId || 1;
        existingAccs.push({ id: newId, name: clean });
        return newId;
      };

      let importedTxs = 0;
      let defaultAccId = existingAccs.length > 0 ? existingAccs[0].id : await getOrCreateAccount('MS Money Account');
      const activeRules = await getTransactionRules();

      if (isQif) {
        // Parse QIF
        const lines = text.split(/\r?\n/);
        let curAccountName = 'MS Money Account';
        let curAccountType = 'Checking';
        let txDate = '';
        let txAmount = 0;
        let txPayee = '';
        let txMemo = '';
        let txCategory = '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          if (trimmed.startsWith('!Account')) {
            continue;
          } else if (trimmed.startsWith('N') && lines[lines.indexOf(line) - 1]?.includes('!Account')) {
            curAccountName = trimmed.substring(1).trim();
            defaultAccId = await getOrCreateAccount(curAccountName, curAccountType);
          } else if (trimmed.startsWith('T') && lines[lines.indexOf(line) - 2]?.includes('!Account')) {
            curAccountType = trimmed.substring(1).trim() || 'Checking';
          } else if (trimmed.startsWith('!Type:')) {
            continue;
          } else if (trimmed.startsWith('D')) {
            // Date format in MS Money QIF is often M/D/YYYY or M/D'YY
            const rawDate = trimmed.substring(1).trim();
            const cleanD = rawDate.replace("'", '/').replace(/-/g, '/');
            const parts = cleanD.split('/');
            if (parts.length === 3) {
              const m = parts[0].padStart(2, '0');
              const d = parts[1].padStart(2, '0');
              let y = parts[2];
              if (y.length === 2) {
                y = Number(y) > 70 ? `19${y}` : `20${y}`;
              }
              txDate = `${y}-${m}-${d}`;
            } else {
              txDate = new Date().toISOString().split('T')[0];
            }
          } else if (trimmed.startsWith('T')) {
            txAmount = parseFloat(trimmed.substring(1).replace(/,/g, '').trim()) || 0;
          } else if (trimmed.startsWith('P')) {
            txPayee = trimmed.substring(1).trim();
          } else if (trimmed.startsWith('M')) {
            txMemo = trimmed.substring(1).trim();
          } else if (trimmed.startsWith('L')) {
            txCategory = trimmed.substring(1).trim();
          } else if (trimmed === '^') {
            // End of transaction entry
            if (txDate && (txAmount !== 0 || txPayee)) {
              const isIncome = txAmount > 0;
              const matchedRuleCatId = matchRuleForTransaction(txPayee, txMemo, activeRules);
              const catId = matchedRuleCatId || (await getOrCreateCategory(txCategory || (isIncome ? 'Salary' : 'General'), isIncome));
              await db.execute(
                'INSERT INTO transactions (account_id, category_id, date, payee, amount, memo) VALUES (?, ?, ?, ?, ?, ?)',
                [defaultAccId, catId, txDate, txPayee || 'MS Money Transaction', txAmount, txMemo || null]
              );
              await db.execute('UPDATE accounts SET balance = balance + ? WHERE id = ?', [txAmount, defaultAccId]);
              importedTxs++;
            }
            txDate = '';
            txAmount = 0;
            txPayee = '';
            txMemo = '';
            txCategory = '';
          }
        }
      } else {
        // Parse CSV/TSV from MS Money
        const rawLines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
        if (rawLines.length < 2) {
          showStatus('CSV file has no data rows.', 'error');
          return;
        }

        // Detect separator
        const delimiter = rawLines[0].includes('\t') ? '\t' : ',';
        const parseRow = (rowStr: string): string[] => {
          const cells: string[] = [];
          let current = '';
          let insideQuotes = false;
          for (let i = 0; i < rowStr.length; i++) {
            const ch = rowStr[i];
            if (ch === '"') {
              if (insideQuotes && rowStr[i + 1] === '"') {
                current += '"';
                i++;
              } else {
                insideQuotes = !insideQuotes;
              }
            } else if (ch === delimiter && !insideQuotes) {
              cells.push(current.trim());
              current = '';
            } else {
              current += ch;
            }
          }
          cells.push(current.trim());
          return cells;
        };

        const headers = parseRow(rawLines[0]).map((h) => h.toLowerCase().replace(/[^a-z]/g, ''));
        const dateIdx = headers.findIndex((h) => h.includes('date'));
        const payeeIdx = headers.findIndex((h) => h.includes('payee') || h.includes('desc') || h.includes('entity'));
        const amountIdx = headers.findIndex((h) => h.includes('amount') || h.includes('total'));
        const catIdx = headers.findIndex((h) => h.includes('cat'));
        const accIdx = headers.findIndex((h) => h.includes('account'));
        const memoIdx = headers.findIndex((h) => h.includes('memo') || h.includes('note'));

        for (let i = 1; i < rawLines.length; i++) {
          const row = parseRow(rawLines[i]);
          if (row.length < 2) continue;

          const rawDate = dateIdx >= 0 ? row[dateIdx] : '';
          const payee = (payeeIdx >= 0 ? row[payeeIdx] : 'MS Money Transaction') || 'MS Money Transaction';
          const rawAmt = amountIdx >= 0 ? row[amountIdx] : '0';
          const cat = catIdx >= 0 ? row[catIdx] : 'General';
          const acc = accIdx >= 0 && row[accIdx] ? row[accIdx] : 'MS Money Account';
          const memo = memoIdx >= 0 ? row[memoIdx] : '';

          const amt = parseFloat(rawAmt.replace(/[\$,]/g, '').trim()) || 0;
          if (amt === 0 && !payee) continue;

          // Normalize Date
          let txDate = new Date().toISOString().split('T')[0];
          const cleanD = rawDate.replace("'", '/').replace(/-/g, '/').trim();
          const dParts = cleanD.split('/');
          if (dParts.length === 3) {
            const m = dParts[0].padStart(2, '0');
            const d = dParts[1].padStart(2, '0');
            let y = dParts[2];
            if (y.length === 2) {
              y = Number(y) > 70 ? `19${y}` : `20${y}`;
            }
            txDate = `${y}-${m}-${d}`;
          }

          const accId = await getOrCreateAccount(acc);
          const isIncome = amt > 0;
          const matchedRuleCatId = matchRuleForTransaction(payee, memo, activeRules);
          const catId = matchedRuleCatId || (await getOrCreateCategory(cat, isIncome));

          await db.execute(
            'INSERT INTO transactions (account_id, category_id, date, payee, amount, memo) VALUES (?, ?, ?, ?, ?, ?)',
            [accId, catId, txDate, payee, amt, memo || null]
          );
          await db.execute('UPDATE accounts SET balance = balance + ? WHERE id = ?', [amt, accId]);
          importedTxs++;
        }
      }

      showStatus(`Migration complete! Successfully imported ${importedTxs} transactions from Microsoft Money.`);
      await loadCategories();
      if (onDataRestored) {
        await onDataRestored();
      }
    } catch (err) {
      console.error('MS Money migration error:', err);
      showStatus('Failed to import Microsoft Money file: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally {
      e.target.value = '';
    }
  };

  const handleResetDefaults = async () => {
    if (
      !confirm(
        'WARNING: This will reset categories to defaults (General, Salary, Rent, Utilities, Food, Entertainment). Proceed?'
      )
    ) {
      return;
    }

    try {
      const db = await getDb();
      const defaults = [
        ['General', 'expense'],
        ['Salary', 'income'],
        ['Rent', 'expense'],
        ['Utilities', 'expense'],
        ['Food', 'expense'],
        ['Entertainment', 'expense'],
        ['Healthcare', 'expense'],
        ['Transportation', 'expense'],
        ['Investments', 'income'],
      ];

      for (const [name, type] of defaults) {
        const existing = await db.select('SELECT id FROM categories WHERE name = ?', [name]) as Category[];
        if (existing.length === 0) {
          await db.execute('INSERT INTO categories (name, type) VALUES (?, ?)', [name, type]);
        }
      }
      showStatus('Default categories restored!');
      await loadCategories();
    } catch (e) {
      console.error('Reset categories error:', e);
      showStatus('Failed to restore defaults.', 'error');
    }
  };

  const handleLoadDemoData = async () => {
    if (
      !confirm(
        'Generate Demo Dataset?\n\nThis will populate realistic demo accounts (Checking, Savings, Credit Card, Investment), 30+ transactions, recurring bills, and categorized expenses for testing and demonstration.\n\nProceed?'
      )
    ) {
      return;
    }

    try {
      const res = await seedDemoData(true);
      showStatus(res.message);
      await loadCategories();
      if (onDataRestored) {
        await onDataRestored();
      }
    } catch (e) {
      console.error('Demo data seed error:', e);
      showStatus('Failed to generate demo dataset.', 'error');
    }
  };

  const handleResetToCleanSlate = async () => {
    if (
      !confirm(
        'WARNING: This will permanently delete all accounts, transactions, bills, and budget targets, returning rMoney to a clean slate with default categories.\n\nAre you sure you want to proceed?'
      )
    ) {
      return;
    }

    try {
      const res = await resetToCleanSlate();
      showStatus(res.message);
      await loadCategories();
      if (onDataRestored) {
        await onDataRestored();
      }
    } catch (e) {
      console.error('Reset clean slate error:', e);
      showStatus('Failed to reset clean slate.', 'error');
    }
  };

  const handleResetChecklist = () => {
    localStorage.removeItem('rmoney_checklist_dismissed');
    localStorage.removeItem('rmoney_checklist_collapsed');
    localStorage.removeItem('rmoney_checklist_forecast');
    localStorage.removeItem('rmoney_checklist_reports');
    localStorage.removeItem('rmoney_checklist_privacy');
    showStatus('Getting Started checklist restored to Dashboard!');
  };

  const expenseCategories = categories.filter((c) => c.type === 'expense');
  const incomeCategories = categories.filter((c) => c.type === 'income');

  return (
    <div className="space-y-8 max-w-5xl">
      <header>
        <h1 className="text-3xl font-bold text-slate-800">Settings & Configuration</h1>
        <p className="text-slate-500">Manage categories, data backups, and application preferences</p>
      </header>

      {statusMsg && (
        <div
          className={`p-4 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-200 ${
            statusMsg.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-700'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}
        >
          {statusMsg.type === 'success' ? <CheckCircle size={20} /> : <AlertTriangle size={20} />}
          <span className="font-medium text-sm">{statusMsg.text}</span>
        </div>
      )}

      {/* Licensing & Edition */}
      <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="flex items-center gap-3.5">
            <div
              className={`p-3.5 rounded-2xl ${
                proStatus
                  ? 'bg-gradient-to-br from-amber-500 via-orange-500 to-indigo-600 text-white shadow-md shadow-amber-500/20 ring-1 ring-white/20'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              <Crown size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-800">Licensing & Edition</h2>
                {proStatus ? (
                  <span className="px-3 py-0.5 text-xs font-black uppercase tracking-wider rounded-full bg-gradient-to-r from-amber-500 to-indigo-600 text-white shadow-xs">
                    PRO LIFETIME ACTIVE
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                    FREE EDITION
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-500 mt-0.5">
                {proStatus
                  ? 'Your lifetime rMoney Pro license is activated and permanently unlocked on this device.'
                  : 'You are using rMoney Free. Unlock the complete suite of commercial power tools with a $29 lifetime license.'}
              </p>
            </div>
          </div>

          {!proStatus && (
            <button
              onClick={() => onTriggerUpgrade?.('general')}
              className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-700 hover:to-pink-700 text-white font-bold rounded-xl text-sm transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer"
            >
              <Zap size={16} className="text-amber-300 fill-amber-300" />
              <span>Upgrade to Pro ($29 Lifetime)</span>
            </button>
          )}
        </div>

        {/* Pro Active Banner */}
        {proStatus ? (
          <div className="space-y-5">
            <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-5 border border-indigo-900/60 shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-400">
                  <Shield size={15} />
                  <span>Verified License Key</span>
                </div>
                <div className="font-mono text-base font-black text-white tracking-wider flex items-center gap-2">
                  <span className="bg-slate-800/80 px-3 py-1 rounded-lg border border-slate-700/80">
                    {licenseInfo.key ? licenseInfo.key : 'RMONEY-PRO-ACTIVE'}
                  </span>
                  <CheckCircle2 size={18} className="text-emerald-400" />
                </div>
                <p className="text-xs text-slate-300">
                  100% Offline &bull; Zero recurring monthly fees &bull; Unlimited updates & devices
                </p>
              </div>

              <button
                onClick={handleDeactivateLicense}
                className="px-3.5 py-2 border border-slate-700 text-slate-400 hover:text-rose-400 hover:border-rose-800 hover:bg-rose-950/30 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                title="Deactivate Pro on this device"
              >
                Deactivate License
              </button>
            </div>

            {/* Active Pro Perks Grid */}
            <div>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Sparkles size={14} className="text-amber-500" />
                <span>Unlocked Pro Perks on this Device</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                <div className="p-3.5 bg-emerald-50/50 border border-emerald-100 rounded-xl flex items-start gap-3">
                  <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg shrink-0 mt-0.5">
                    <Wallet size={16} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">Unlimited Accounts</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Connect unlimited checking, savings, credit cards, loans, and investment ledgers.
                    </p>
                  </div>
                </div>

                <div className="p-3.5 bg-purple-50/50 border border-purple-100 rounded-xl flex items-start gap-3">
                  <div className="p-2 bg-purple-100 text-purple-700 rounded-lg shrink-0 mt-0.5">
                    <TrendingUp size={16} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">What-If Cash Flow Simulator</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Simulate salary raises, rent/mortgage changes, and loans in sandbox projections.
                    </p>
                  </div>
                </div>

                <div className="p-3.5 bg-blue-50/50 border border-blue-100 rounded-xl flex items-start gap-3">
                  <div className="p-2 bg-blue-100 text-blue-700 rounded-lg shrink-0 mt-0.5">
                    <Paperclip size={16} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">Unlimited Receipt Attachments</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Drag-and-drop receipts, invoices, and warranties with zoom viewer and audit proofs.
                    </p>
                  </div>
                </div>

                <div className="p-3.5 bg-indigo-50/50 border border-indigo-100 rounded-xl flex items-start gap-3">
                  <div className="p-2 bg-indigo-100 text-indigo-700 rounded-lg shrink-0 mt-0.5">
                    <FileText size={16} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">Advanced Statements & PDF Export</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Budget Variance, Net Worth, P&L, and Tax Deductions with executive grayscale PDF generator.
                    </p>
                  </div>
                </div>

                <div className="p-3.5 bg-amber-50/50 border border-amber-100 rounded-xl flex items-start gap-3">
                  <div className="p-2 bg-amber-100 text-amber-700 rounded-lg shrink-0 mt-0.5">
                    <Database size={16} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">Database Security Vault</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      AES-GCM-256 encryption at rest, PBKDF2 100k key derivation, and sealed .rmvault exports.
                    </p>
                  </div>
                </div>

                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-start gap-3">
                  <div className="p-2 bg-slate-200 text-slate-700 rounded-lg shrink-0 mt-0.5">
                    <Shield size={16} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">Lifetime Perpetual License</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      One-time $29 purchase. 100% offline-first with zero cloud subscription fees.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Feature Comparison Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
              {/* Free Tier Card */}
              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 text-slate-700 flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                    <div>
                      <span className="font-bold text-slate-900 text-sm block">rMoney Free Edition</span>
                      <span className="text-[11px] text-slate-400">Default installation</span>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-200 text-slate-700">
                      Active
                    </span>
                  </div>

                  <ul className="space-y-2.5 mt-3.5 text-slate-600">
                    <li className="flex items-center gap-2">
                      <Check size={14} className="text-slate-400 shrink-0" />
                      <span>Up to 2 connected accounts</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check size={14} className="text-slate-400 shrink-0" />
                      <span>Standard cash flow projection curve</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check size={14} className="text-slate-400 shrink-0" />
                      <span>Overview Cash Flow report & PDF</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check size={14} className="text-slate-400 shrink-0" />
                      <span>Up to 3 sample receipt attachments</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check size={14} className="text-slate-400 shrink-0" />
                      <span>Local SQLite ledger & privacy masking</span>
                    </li>
                  </ul>
                </div>

                <div className="pt-3 border-t border-slate-200 text-slate-400 text-[11px]">
                  Basic financial management for single account households.
                </div>
              </div>

              {/* Pro Tier Perks Card */}
              <div className="p-5 rounded-2xl bg-gradient-to-br from-amber-50/80 via-indigo-50/40 to-purple-50/60 border border-amber-200/80 text-slate-800 flex flex-col justify-between space-y-4 shadow-xs">
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-amber-200/60">
                    <div>
                      <span className="font-black text-slate-900 text-sm block flex items-center gap-1.5">
                        <span>rMoney Pro Lifetime Perks</span>
                        <Crown size={15} className="text-amber-500" />
                      </span>
                      <span className="text-[11px] text-amber-700 font-semibold">$29 one-time payment &bull; Own it forever</span>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-black bg-gradient-to-r from-amber-500 to-indigo-600 text-white shadow-2xs">
                      $29 LIFETIME
                    </span>
                  </div>

                  <ul className="space-y-2 mt-3 text-slate-700">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 size={15} className="text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-slate-900">Unlimited Accounts:</strong> Connect all checking, savings, credit cards, loans & mortgages.
                      </div>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 size={15} className="text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-slate-900">What-If Scenario Simulator:</strong> Test hypothetical salary raises, purchases & debt payoff curves.
                      </div>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 size={15} className="text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-slate-900">Unlimited Receipt & PDF Attachments:</strong> Link receipts, invoices, and warranties with audit proofs.
                      </div>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 size={15} className="text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-slate-900">Advanced Statements & PDF Export:</strong> Budget Variance, Net Worth, P&L, and Tax Schedule with clean grayscale printing.
                      </div>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 size={15} className="text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-slate-900">AES-GCM-256 Database Security Vault:</strong> Sealed local ledger encryption & encrypted .rmvault snapshots.
                      </div>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 size={15} className="text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-slate-900">100% Offline & No Subscriptions:</strong> Zero cloud lock-in, zero monthly fees.
                      </div>
                    </li>
                  </ul>
                </div>

                <button
                  onClick={() => onTriggerUpgrade?.('general')}
                  className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-indigo-600 hover:from-amber-600 hover:to-indigo-700 text-white font-bold rounded-xl text-xs transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Crown size={14} />
                  <span>Unlock All Pro Perks Now ($29)</span>
                </button>
              </div>
            </div>

            {/* License Key Activation Form */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
              <div className="flex items-center gap-2">
                <Key size={16} className="text-indigo-600" />
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Already Have a License Key?
                </h4>
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                <div className="relative flex-1">
                  <input
                    type="text"
                    placeholder="Enter license key (e.g. RMONEY-PRO-XXXX-XXXX-XXXX)"
                    value={licenseInput}
                    onChange={(e) => setLicenseInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === 'Enter' && handleActivateLicense()}
                    className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-xs font-mono bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                  />
                </div>
                <button
                  onClick={handleActivateLicense}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition-colors shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Check size={14} />
                  <span>Activate Key</span>
                </button>
              </div>
              <p className="text-[11px] text-slate-400">
                Enter your 24-character license key sent to your email upon purchase.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Appearance & Theme */}
      <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-xl ${darkMode ? 'bg-indigo-900/50 text-indigo-400' : 'bg-amber-50 text-amber-500'}`}>
              {darkMode ? <Moon size={22} /> : <Sun size={22} />}
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Appearance</h2>
              <p className="text-sm text-slate-500">
                {darkMode ? 'Dark theme is active' : 'Light theme is active'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-slate-600">
              {darkMode ? 'Dark Mode' : 'Light Mode'}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={darkMode}
              onClick={() => onToggleDarkMode && onToggleDarkMode(!darkMode)}
              className={`relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                darkMode ? 'bg-blue-600' : 'bg-slate-300'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out flex items-center justify-center text-slate-600 ${
                  darkMode ? 'translate-x-7 text-blue-600' : 'translate-x-0'
                }`}
              >
                {darkMode ? <Moon size={13} /> : <Sun size={13} />}
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* Regional & Currency Preferences */}
      <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-teal-50 text-teal-600">
              <Globe size={22} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Regional & Currency Preferences</h2>
              <p className="text-sm text-slate-500">
                Configure your monetary currency, decimal styling, and localized date format
              </p>
            </div>
          </div>
          <span className="px-3 py-1 bg-slate-100 text-slate-700 text-xs font-mono font-bold rounded-xl border border-slate-200">
            {currency.code} ({currency.symbol.trim()})
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Currency Selector */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
              Default Monetary Unit
            </label>
            <select
              value={currency.code}
              onChange={(e) => {
                setCurrency(e.target.value);
                const found = SUPPORTED_CURRENCIES.find((c) => c.code === e.target.value);
                showStatus(`Currency changed to ${found?.name || e.target.value} (${found?.symbol})`);
              }}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-teal-500 transition-colors"
            >
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} ({c.symbol.trim()}) — {c.name}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400">
              Affects all accounts, transaction logs, budget variances, and generated financial statements.
            </p>
          </div>

          {/* Date Format Selector */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
              Calendar Date Representation
            </label>
            <select
              value={dateFormat}
              onChange={(e) => {
                setDateFormat(e.target.value as DateFormatOption);
                showStatus(`Date format updated to ${e.target.value}`);
              }}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-teal-500 transition-colors"
            >
              {SUPPORTED_DATE_FORMATS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label} — Ex: {f.sample}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400">
              Applies across transaction ledgers, bills timetable, and export documents.
            </p>
          </div>
        </div>

        {/* Live Formatting Preview */}
        <div className="bg-gradient-to-r from-teal-50/50 via-slate-50 to-indigo-50/40 p-4 rounded-xl border border-teal-100 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div>
            <span className="font-bold text-slate-800 block text-xs">Real-Time Formatting Preview</span>
            <span className="text-[11px] text-slate-500">Live demonstration of numbers and dates with your current configuration:</span>
          </div>

          <div className="flex flex-wrap items-center gap-4 font-mono font-bold">
            <div className="bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs">
              <span className="text-[10px] text-slate-400 font-sans font-medium block">Balance</span>
              <span className="text-slate-900">{fmtCurr(12450.8)}</span>
            </div>
            <div className="bg-white px-3 py-1.5 rounded-lg border border-emerald-200 shadow-2xs text-emerald-700">
              <span className="text-[10px] text-slate-400 font-sans font-medium block">Cash Inflow</span>
              <span>{fmtCurr(3200, { showSign: true })}</span>
            </div>
            <div className="bg-white px-3 py-1.5 rounded-lg border border-red-200 shadow-2xs text-red-600">
              <span className="text-[10px] text-slate-400 font-sans font-medium block">Outflow</span>
              <span>{fmtCurr(-184.25, { showSign: true })}</span>
            </div>
            <div className="bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs text-slate-700">
              <span className="text-[10px] text-slate-400 font-sans font-medium block">Formatted Date</span>
              <span>{fmtDate('2026-10-19')}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Onboarding & Getting Started Guide */}
      <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-blue-50 text-blue-600">
              <Compass size={22} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Onboarding & Getting Started</h2>
              <p className="text-sm text-slate-500">
                Re-run the welcome tour, restore the dashboard checklist, or start fresh
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 border border-blue-100 bg-blue-50/30 rounded-xl flex flex-col justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-blue-600" />
                <h3 className="font-bold text-slate-800 text-sm">Welcome Wizard</h3>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Launch the step-by-step setup wizard to configure your currency, date format, and starting path.
              </p>
            </div>
            <button
              onClick={() => onLaunchOnboarding?.()}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors shadow-2xs cursor-pointer"
            >
              <Compass size={15} />
              Launch Welcome Wizard
            </button>
          </div>

          <div className="p-4 border border-slate-200 rounded-xl flex flex-col justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <ListChecks size={16} className="text-emerald-600" />
                <h3 className="font-bold text-slate-800 text-sm">Dashboard Checklist</h3>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Restore the interactive "Getting Started with rMoney" checklist to your main dashboard.
              </p>
            </div>
            <button
              onClick={handleResetChecklist}
              className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <RotateCcw size={14} />
              Restore Checklist to Dashboard
            </button>
          </div>

          <div className="p-4 border border-purple-100 bg-purple-50/20 rounded-xl flex flex-col justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-purple-600" />
                <h3 className="font-bold text-slate-800 text-sm">Generate Sample Data</h3>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Populate realistic checking, savings, credit cards, bills, and 30+ transactions for testing.
              </p>
            </div>
            <button
              onClick={handleLoadDemoData}
              className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors shadow-2xs cursor-pointer"
            >
              <Sparkles size={15} />
              Load Sample Dataset
            </button>
          </div>

          <div className="p-4 border border-rose-100 bg-rose-50/20 rounded-xl flex flex-col justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Trash2 size={16} className="text-rose-600" />
                <h3 className="font-bold text-slate-800 text-sm">Start Clean (Wipe Data)</h3>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Remove all accounts, transactions, bills, and budgets while preserving default categories.
              </p>
            </div>
            <button
              onClick={handleResetToCleanSlate}
              className="w-full py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors shadow-2xs cursor-pointer"
            >
              <Trash2 size={15} />
              Wipe Data & Start Fresh
            </button>
          </div>
        </div>
      </section>

      {/* Privacy & Security */}
      <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-6">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Shield size={20} className="text-emerald-600" />
            Privacy & Device Security
          </h2>
          <p className="text-sm text-slate-500">
            Keep your financial numbers shielded and secure your app with a local device PIN
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Privacy Masking Card */}
          <div className="p-5 border border-slate-200 rounded-2xl flex flex-col justify-between space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${privacyMode ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                  {privacyMode ? <EyeOff size={20} /> : <Eye size={20} />}
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">Privacy Mode</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Gently blurs balances across the app. Hover to peek.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onTogglePrivacyMode && onTogglePrivacyMode(!privacyMode)}
                className={`relative inline-flex h-6 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                  privacyMode ? 'bg-amber-500' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                    privacyMode ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-400 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
              <span>Shortcut anywhere:</span>
              <kbd className="px-2 py-0.5 bg-white border border-slate-200 rounded font-mono text-[11px] font-bold text-slate-700 shadow-2xs">
                Ctrl + H
              </kbd>
            </div>
          </div>

          {/* App PIN Lock Card */}
          <div className="p-5 border border-slate-200 rounded-2xl flex flex-col justify-between space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${hasPin ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                  {hasPin ? <Lock size={20} /> : <Key size={20} />}
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">App PIN Lock</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {hasPin ? 'PIN is configured. App requires PIN on startup.' : 'Lock rMoney with a 4 to 8 digit device PIN.'}
                  </p>
                </div>
              </div>
              {hasPin && (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                  Protected
                </span>
              )}
            </div>

            {isSettingPin ? (
              <div className="space-y-3 pt-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={8}
                    placeholder="New PIN (4-8 digits)"
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value)}
                    className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white outline-none focus:ring-2 focus:ring-blue-500 font-mono tracking-widest text-center"
                  />
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={8}
                    placeholder="Confirm PIN"
                    value={pinConfirm}
                    onChange={(e) => setPinConfirm(e.target.value)}
                    className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white outline-none focus:ring-2 focus:ring-blue-500 font-mono tracking-widest text-center"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsSettingPin(false);
                      setPinInput('');
                      setPinConfirm('');
                    }}
                    className="px-3 py-1 text-xs text-slate-500 hover:text-slate-700 font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSavePin}
                    className="px-4 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs"
                  >
                    Set PIN
                  </button>
                </div>
              </div>
            ) : hasPin ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsSettingPin(true)}
                  className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors"
                >
                  Change PIN
                </button>
                <button
                  type="button"
                  onClick={handleRemovePin}
                  className="px-4 py-2 border border-red-200 text-red-600 hover:bg-red-50 rounded-xl text-xs font-bold transition-colors"
                >
                  Disable PIN
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsSettingPin(true)}
                className="w-full py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-colors shadow-xs flex items-center justify-center gap-1.5"
              >
                <Lock size={14} />
                <span>Enable Security PIN</span>
              </button>
            )}
          </div>

          {/* Database Encryption at Rest (AES-GCM-256) Card */}
          <div className="p-5 border border-slate-200 rounded-2xl flex flex-col justify-between space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${vaultEncrypted ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'}`}>
                  <Database size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">Database Encryption at Rest</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {vaultEncrypted
                      ? 'Bank-grade AES-GCM-256 vault active with PBKDF2 100,000-round key.'
                      : 'Lock your local SQLite database with an AES-256 master key.'}
                  </p>
                </div>
              </div>
              {vaultEncrypted ? (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800 whitespace-nowrap">
                  AES-256 Active
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600 whitespace-nowrap">
                  Standard Local
                </span>
              )}
            </div>

            {isSettingEncryption ? (
              <div className="space-y-3 pt-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="password"
                    placeholder="Master Passphrase (min 6)"
                    value={encInput}
                    onChange={(e) => setEncInput(e.target.value)}
                    className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white outline-none focus:ring-2 focus:ring-purple-500 font-mono"
                  />
                  <input
                    type="password"
                    placeholder="Confirm Master Passphrase"
                    value={encConfirm}
                    onChange={(e) => setEncConfirm(e.target.value)}
                    className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white outline-none focus:ring-2 focus:ring-purple-500 font-mono"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsSettingEncryption(false);
                      setEncInput('');
                      setEncConfirm('');
                    }}
                    className="px-3 py-1 text-xs text-slate-500 hover:text-slate-700 font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleEnableEncryption}
                    className="px-4 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer"
                  >
                    Seal & Encrypt
                  </button>
                </div>
              </div>
            ) : vaultEncrypted ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExportVault}
                    disabled={isExportingVault}
                    className="flex-1 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Download size={14} />
                    <span>{isExportingVault ? 'Sealing...' : 'Export Vault (.rmvault)'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDisableEncryption}
                    className="px-3 py-2 border border-red-200 text-red-600 hover:bg-red-50 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    Disable
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsSettingEncryption(true)}
                  className="flex-1 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Shield size={14} />
                  <span>Enable AES-256 Vault</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportVault}
                  disabled={isExportingVault}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
                  title="Export an encrypted standalone backup file"
                >
                  <Download size={13} />
                  <span>Vault Export</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Category Management */}
      <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Tag size={20} className="text-blue-500" />
              Category Management
            </h2>
            <p className="text-sm text-slate-500">Customize expense and income categories</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              placeholder="New category name"
              className="px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm flex-1 min-w-[140px]"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
            />
            <select
              className="px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white font-medium"
              value={newCatType}
              onChange={(e) => setNewCatType(e.target.value as 'expense' | 'income')}
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
            {newCatType === 'expense' && (
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">$</span>
                <input
                  type="number"
                  step="10"
                  min="0"
                  placeholder="Budget/mo"
                  className="pl-6 pr-2.5 py-2 w-28 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  value={newCatBudget}
                  onChange={(e) => setNewCatBudget(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                />
              </div>
            )}
            <button
              onClick={handleAddCategory}
              className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-semibold flex items-center gap-1.5 text-sm shadow-sm"
            >
              <Plus size={16} />
              Add
            </button>
          </div>
        </div>

        {/* Categories Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
          {/* Expense Categories */}
          <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/50">
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center justify-between">
              <span>Expense Categories ({expenseCategories.length})</span>
            </h3>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {loading ? (
                <p className="text-xs text-slate-400 italic">Loading...</p>
              ) : expenseCategories.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No expense categories</p>
              ) : (
                expenseCategories.map((cat) => (
                  <div
                    key={cat.id}
                    className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-slate-200/80 shadow-xs"
                  >
                    {editingCatId === cat.id ? (
                      <div className="flex items-center gap-2 flex-1 mr-2">
                        <input
                          type="text"
                          className="px-2 py-1 border border-blue-500 rounded text-sm flex-1 outline-none"
                          value={editingCatName}
                          onChange={(e) => setEditingCatName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()}
                          autoFocus
                        />
                        <div className="relative w-24">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">$</span>
                          <input
                            type="number"
                            placeholder="Budget"
                            className="pl-5 pr-1 py-1 border border-slate-300 rounded text-xs w-full outline-none font-bold tabular-nums"
                            value={editingCatBudget}
                            onChange={(e) => setEditingCatBudget(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()}
                          />
                        </div>
                        <button
                          onClick={handleSaveEdit}
                          className="px-2 py-1 bg-blue-600 text-white text-xs rounded font-bold"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingCatId(null)}
                          className="px-2 py-1 text-slate-500 text-xs hover:text-slate-700"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-800">{cat.name}</span>
                          {cat.monthly_budget && cat.monthly_budget > 0 ? (
                            <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded-md">
                              ${cat.monthly_budget.toLocaleString()}/mo
                            </span>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleStartEdit(cat)}
                            className="p-1 text-slate-400 hover:text-blue-600 rounded"
                            title="Edit"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteCategory(cat)}
                            className="p-1 text-slate-400 hover:text-red-600 rounded"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Income Categories */}
          <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/50">
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center justify-between">
              <span>Income Categories ({incomeCategories.length})</span>
            </h3>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {loading ? (
                <p className="text-xs text-slate-400 italic">Loading...</p>
              ) : incomeCategories.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No income categories</p>
              ) : (
                incomeCategories.map((cat) => (
                  <div
                    key={cat.id}
                    className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-slate-200/80 shadow-xs"
                  >
                    {editingCatId === cat.id ? (
                      <div className="flex items-center gap-2 flex-1 mr-2">
                        <input
                          type="text"
                          className="px-2 py-1 border border-blue-500 rounded text-sm w-full outline-none"
                          value={editingCatName}
                          onChange={(e) => setEditingCatName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()}
                          autoFocus
                        />
                        <button
                          onClick={handleSaveEdit}
                          className="px-2 py-1 bg-blue-600 text-white text-xs rounded font-bold"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingCatId(null)}
                          className="px-2 py-1 text-slate-500 text-xs hover:text-slate-700"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="text-sm font-medium text-slate-800">{cat.name}</span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleStartEdit(cat)}
                            className="p-1 text-slate-400 hover:text-blue-600 rounded"
                            title="Edit"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteCategory(cat)}
                            className="p-1 text-slate-400 hover:text-red-600 rounded"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Transaction Rules & Auto-Categorization Engine */}
      <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Sparkles size={20} className="text-amber-500" />
              Transaction Rules & Auto-Categorization
            </h2>
            <p className="text-sm text-slate-500">
              Automatically assign categories based on merchant names or memo keywords when importing statements or recording transactions
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExecuteAllRules}
              disabled={isRunningRules || rules.length === 0}
              className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
              title="Re-run all active categorization rules across your existing transaction ledger"
            >
              <RefreshCw size={13} className={isRunningRules ? 'animate-spin' : ''} />
              <span>{isRunningRules ? 'Evaluating...' : 'Run Rules on Ledger'}</span>
            </button>
            <button
              onClick={() => setIsAddingRule(!isAddingRule)}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Plus size={14} />
              <span>{isAddingRule ? 'Cancel' : 'New Rule'}</span>
            </button>
          </div>
        </div>

        {/* Add Rule Form */}
        {isAddingRule && (
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-4 animate-in fade-in duration-150">
            <div className="font-bold text-xs uppercase tracking-wider text-slate-600">
              Create New Auto-Categorization Rule
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-500">Rule Name</label>
                <input
                  type="text"
                  placeholder="e.g. Starbucks Coffee"
                  value={newRuleName}
                  onChange={(e) => setNewRuleName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-500">If Field</label>
                <select
                  value={newRuleField}
                  onChange={(e) => setNewRuleField(e.target.value as any)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="payee">Payee / Merchant</option>
                  <option value="memo">Memo / Note</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-500">Condition</label>
                <select
                  value={newRuleType}
                  onChange={(e) => setNewRuleType(e.target.value as any)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="contains">Contains</option>
                  <option value="exact">Exactly Matches</option>
                  <option value="starts_with">Starts With</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-500">Match Keyword</label>
                <input
                  type="text"
                  placeholder="e.g. starbucks"
                  value={newRuleValue}
                  onChange={(e) => setNewRuleValue(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-500">Assign Category</label>
                <select
                  value={newRuleCatId}
                  onChange={(e) => setNewRuleCatId(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.type})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsAddingRule(false)}
                className="px-3.5 py-1.5 text-xs text-slate-500 hover:text-slate-700 font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateRule}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs"
              >
                Save Rule
              </button>
            </div>
          </div>
        )}

        {/* Edit Rule Form */}
        {editingRule && (
          <div className="p-4 bg-indigo-50/70 border border-indigo-200 rounded-2xl space-y-4 animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <div className="font-bold text-xs uppercase tracking-wider text-indigo-900">
                Edit Auto-Categorization Rule (#{editingRule.id})
              </div>
              <button
                type="button"
                onClick={() => setEditingRule(null)}
                className="text-slate-400 hover:text-slate-600 text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-500">Rule Name</label>
                <input
                  type="text"
                  value={editRuleName}
                  onChange={(e) => setEditRuleName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-500">If Field</label>
                <select
                  value={editRuleField}
                  onChange={(e) => setEditRuleField(e.target.value as any)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                >
                  <option value="payee">Payee / Merchant</option>
                  <option value="memo">Memo / Note</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-500">Condition</label>
                <select
                  value={editRuleType}
                  onChange={(e) => setEditRuleType(e.target.value as any)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                >
                  <option value="contains">Contains</option>
                  <option value="exact">Exactly Matches</option>
                  <option value="starts_with">Starts With</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-500">Match Keyword</label>
                <input
                  type="text"
                  value={editRuleValue}
                  onChange={(e) => setEditRuleValue(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-500">Assign Category</label>
                <select
                  value={editRuleCatId}
                  onChange={(e) => setEditRuleCatId(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.type})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setEditingRule(null)}
                className="px-3.5 py-1.5 text-xs text-slate-500 hover:text-slate-700 font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEditRule}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs"
              >
                Save Changes
              </button>
            </div>
          </div>
        )}

        {/* Rules Table / Cards */}
        <div className="overflow-x-auto border border-slate-200 rounded-2xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3 px-4 w-12 text-center">Active</th>
                <th className="py-3 px-4">Rule Name</th>
                <th className="py-3 px-4">Condition</th>
                <th className="py-3 px-4">Assigned Category</th>
                <th className="py-3 px-4 text-center w-20">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {loadingRules ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400 italic">
                    Loading rules...
                  </td>
                </tr>
              ) : rules.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400 italic">
                    No rules configured yet. Click "New Rule" to set up auto-categorization.
                  </td>
                </tr>
              ) : (
                rules.map((rule) => (
                  <tr key={rule.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 text-center">
                      <input
                        type="checkbox"
                        checked={Boolean(rule.is_active)}
                        onChange={() => handleToggleRule(rule.id!, Boolean(rule.is_active))}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-800">
                      {rule.name}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      <span className="font-mono bg-slate-100 px-2 py-0.5 rounded text-[11px] border border-slate-200 text-slate-700">
                        {rule.match_field.toUpperCase()} {rule.match_type.replace('_', ' ')} "{rule.match_value}"
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-md font-semibold text-[11px] bg-indigo-50 text-indigo-700 border border-indigo-100">
                        {rule.category_name || 'General'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleStartEditRule(rule)}
                          className="p-1 text-slate-400 hover:text-blue-600 rounded transition-colors cursor-pointer"
                          title="Edit rule"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => handleDeleteRule(rule.id!, rule.name)}
                          className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors cursor-pointer"
                          title="Delete rule"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Data Backup & Export Section */}
      <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Database size={20} className="text-blue-500" />
            Data Backup & Portability
          </h2>
          <p className="text-sm text-slate-500">
            Export your financial records for safekeeping or spreadsheet analysis
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
          <div className="p-4 border border-purple-200 bg-purple-50/40 rounded-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <Sparkles size={16} className="text-purple-600" />
                <h3 className="font-semibold text-slate-800">Demo Dataset</h3>
              </div>
              <p className="text-xs text-slate-500 mb-4">
                Populate sample checking, savings, investment accounts, bills, and recent transactions for demonstration.
              </p>
            </div>
            <button
              onClick={handleLoadDemoData}
              className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors shadow-xs"
            >
              <Sparkles size={16} />
              Load Demo Dataset
            </button>
          </div>

          <div className="p-4 border border-slate-200 rounded-xl flex flex-col justify-between">
            <div>
              <h3 className="font-semibold text-slate-800 mb-1">Full JSON Backup</h3>
              <p className="text-xs text-slate-500 mb-4">
                Export all accounts, categories, transactions, and bills into a single JSON file.
              </p>
            </div>
            <button
              onClick={handleExportJSON}
              className="w-full py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors shadow-xs"
            >
              <Download size={16} />
              Export JSON
            </button>
          </div>

          <div className="p-4 border border-blue-200 bg-blue-50/30 rounded-xl flex flex-col justify-between">
            <div>
              <h3 className="font-semibold text-slate-800 mb-1">Restore JSON Backup</h3>
              <p className="text-xs text-slate-500 mb-4">
                Load a previous JSON backup file to restore accounts, categories, and transactions.
              </p>
            </div>
            <label className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors shadow-xs cursor-pointer text-center">
              <Upload size={16} />
              <span>Select Backup File</span>
              <input
                type="file"
                accept=".json,application/json"
                onChange={handleRestoreJSON}
                className="hidden"
              />
            </label>
          </div>

          <div className="p-4 border border-slate-200 rounded-xl flex flex-col justify-between">
            <div>
              <h3 className="font-semibold text-slate-800 mb-1">Transactions CSV</h3>
              <p className="text-xs text-slate-500 mb-4">
                Export transaction history as a CSV spreadsheet compatible with Excel and Google Sheets.
              </p>
            </div>
            <button
              onClick={handleExportCSV}
              className="w-full py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors shadow-xs"
            >
              <Download size={16} />
              Export CSV
            </button>
          </div>

          <div className="p-4 border border-slate-200 rounded-xl flex flex-col justify-between">
            <div>
              <h3 className="font-semibold text-slate-800 mb-1">Restore Default Categories</h3>
              <p className="text-xs text-slate-500 mb-4">
                Re-seeds default expense and income categories if any were accidentally deleted.
              </p>
            </div>
            <button
              onClick={handleResetDefaults}
              className="w-full py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              <RotateCcw size={16} />
              Restore Defaults
            </button>
          </div>
        </div>
      </section>

      {/* Automated Rolling Local Backups Section */}
      <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Archive size={20} className="text-indigo-600" />
              Automated Rolling Local Backups
            </h2>
            <p className="text-sm text-slate-500">
              rMoney automatically retains the 5 most recent snapshots of your database on your computer
            </p>
          </div>
          <button
            onClick={handleCreateSnapshot}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-sm cursor-pointer self-start sm:self-auto"
          >
            <Plus size={16} />
            <span>Create Snapshot Now</span>
          </button>
        </div>

        <div className="space-y-2.5 pt-1">
          {loadingBackups ? (
            <p className="text-xs text-slate-400 italic py-3">Loading backup snapshots...</p>
          ) : rollingBackups.length === 0 ? (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center space-y-1">
              <p className="text-xs font-semibold text-slate-600">No rolling backup snapshots found.</p>
              <p className="text-[11px] text-slate-400">
                Click "Create Snapshot Now" above or rMoney will automatically generate daily rolling backups.
              </p>
            </div>
          ) : (
            rollingBackups.map((b) => {
              const formattedDate = new Date(b.created_at).toLocaleString();
              const sizeKb = b.byte_size ? (b.byte_size / 1024).toFixed(1) : '< 1';
              const isAuto = b.label.toLowerCase().includes('auto');

              return (
                <div
                  key={b.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-slate-50/70 border border-slate-200/80 rounded-xl hover:bg-slate-100/50 transition-colors gap-3"
                >
                  <div className="flex items-start sm:items-center gap-3">
                    <div
                      className={`p-2 rounded-xl mt-0.5 sm:mt-0 ${
                        isAuto ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      <HardDrive size={18} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800 text-sm">{b.label}</span>
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                            isAuto ? 'bg-indigo-100 text-indigo-800' : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {isAuto ? 'Auto-Daily' : 'Manual'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                        <Clock size={12} />
                        <span>{formattedDate}</span>
                        <span>•</span>
                        <span>{b.account_count} accounts</span>
                        <span>•</span>
                        <span>{b.transaction_count} transactions</span>
                        <span>•</span>
                        <span>~{sizeKb} KB</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    <button
                      onClick={() => handleDownloadSnapshotJSON(b)}
                      className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-white rounded-lg transition-colors border border-transparent hover:border-slate-200 cursor-pointer"
                      title="Download JSON Snapshot file"
                    >
                      <Download size={15} />
                    </button>
                    <button
                      onClick={() => handleRestoreSnapshot(b)}
                      className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                      title="Restore entire ledger to this snapshot"
                    >
                      <RotateCcw size={13} className="text-blue-600" />
                      <span>Restore</span>
                    </button>
                    <button
                      onClick={() => handleDeleteSnapshot(b)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                      title="Delete Snapshot"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Device Synchronization & Mobile Pairing Section */}
      <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <FolderSync size={20} className="text-blue-600" />
                Device Synchronization & Mobile Pairing
              </h2>
              <span className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shadow-2xs">
                Hybrid Sync
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Synchronize your ledger with mobile apps (iOS & Android) and other computers using Local Wi-Fi Direct pairing or encrypted cloud folders.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsDeviceSyncModalOpen(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-2 shadow-xs cursor-pointer shrink-0"
          >
            <QrCode size={15} />
            Pair & Sync Devices
          </button>
        </div>

        {/* Sync Status Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Current Device
            </span>
            <div className="flex items-center gap-2">
              <Wifi size={15} className="text-blue-500" />
              <span className="font-bold text-slate-800 text-sm truncate">{syncDeviceName}</span>
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">
              Direct peer-to-peer Wi-Fi ready
            </span>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Connected Instances
            </span>
            <div className="flex items-center gap-2">
              <Smartphone size={15} className="text-indigo-500" />
              <span className="font-bold text-slate-800 text-sm">
                {pairedDeviceCount} paired device{pairedDeviceCount === 1 ? '' : 's'}
              </span>
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">
              Auto-merges new mobile transactions
            </span>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Cloud Folder Sync
            </span>
            <div className="flex items-center gap-2">
              <Cloud size={15} className="text-emerald-500" />
              <span className="font-bold text-slate-800 text-sm">
                {cloudSyncConfig.enabled && cloudSyncConfig.folderPath
                  ? `${cloudSyncConfig.providerName} (Automated)`
                  : 'Disabled'}
              </span>
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block truncate font-mono">
              {cloudSyncConfig.enabled && cloudSyncConfig.folderPath
                ? cloudSyncConfig.folderPath
                : 'Zero-knowledge background sync'}
            </span>
          </div>
        </div>
      </section>

      {/* Microsoft Money Migration Section */}
      <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <FileSpreadsheet size={20} className="text-emerald-600" />
              Migrate from Microsoft Money
            </h2>
            <p className="text-sm text-slate-500">
              Import your existing financial history from Microsoft Money (.qif or exported .csv)
            </p>
          </div>
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 self-start sm:self-auto">
            QIF & CSV Supported
          </span>
        </div>

        <div className="bg-slate-50/70 border border-slate-200/80 rounded-xl p-4 text-xs text-slate-600 space-y-2">
          <p className="font-semibold text-slate-700">How to export from Microsoft Money:</p>
          <ol className="list-decimal list-inside space-y-1 text-slate-500">
            <li>In Microsoft Money, open <strong>File → Export... → Loose QIF</strong> or export an account to <strong>CSV</strong>.</li>
            <li>Select the date range and accounts you wish to export, then save the file to your computer.</li>
            <li>Click <strong>Import Microsoft Money File</strong> below to bring in accounts, categories, and transaction ledger.</li>
          </ol>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <label className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-sm cursor-pointer">
            <Upload size={16} />
            <span>Import Microsoft Money File (.qif, .csv)</span>
            <input
              type="file"
              accept=".qif,.csv,text/plain,text/csv,application/csv"
              onChange={handleImportMSMoney}
              className="hidden"
            />
          </label>
        </div>
      </section>

      {/* Application Updates Section */}
      <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-blue-50 text-blue-600">
              <ArrowUpCircle size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-800">Application Updates</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                  v0.1.0 Stable
                </span>
              </div>
              <p className="text-sm text-slate-500">
                Seamless background update delivery powered by signed release binaries
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={handleManualCheckUpdates}
              disabled={isCheckingUpdate}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw size={14} className={isCheckingUpdate ? 'animate-spin' : ''} />
              <span>{isCheckingUpdate ? 'Checking Server...' : 'Check for Updates Now'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-slate-50/70 border border-slate-200/80 rounded-xl flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Automatic Startup Check</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Silently check for new versions and security patches whenever rMoney launches
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={autoCheckUpdates}
              onClick={() => handleToggleAutoCheck(!autoCheckUpdates)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                autoCheckUpdates ? 'bg-blue-600' : 'bg-slate-300'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  autoCheckUpdates ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="p-4 bg-slate-50/70 border border-slate-200/80 rounded-xl flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Update Channel & Status</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {lastCheckedStr
                  ? `Last checked: ${new Date(lastCheckedStr).toLocaleString()}`
                  : 'Has not checked for updates yet'}
              </p>
            </div>
            <button
              onClick={handleSimulateUpdate}
              className="text-xs text-slate-500 hover:text-blue-600 border border-slate-200 bg-white hover:bg-slate-50 px-2.5 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer"
              title="Test update dialog in development"
            >
              Test Dialog
            </button>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="font-bold text-slate-800">rMoney Desktop</h3>
          <p className="text-xs text-slate-500">
            Version 0.1.0 • Tauri v2 • Local SQLite Storage (`rmoney.db`)
          </p>
          <p className="text-xs text-slate-400">
            All your financial data remains completely offline on your personal computer.
          </p>
        </div>
      </section>

      {/* Update Available Modal */}
      <UpdateModal
        isOpen={Boolean(activeUpdateInfo)}
        onClose={() => setActiveUpdateInfo(null)}
        updateInfo={activeUpdateInfo}
        onSuccess={() => {
          showStatus('rMoney updated successfully!');
        }}
      />

      {/* Device Synchronization Modal */}
      <DeviceSyncModal
        isOpen={isDeviceSyncModalOpen}
        onClose={() => setIsDeviceSyncModalOpen(false)}
        onSyncCompleted={onDataRestored}
      />
    </div>
  );
};

export default SettingsPage;
