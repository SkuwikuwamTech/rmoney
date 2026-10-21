import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Wallet,
  Calendar,
  BarChart3,
  Settings,
  PlusCircle,
  ArrowUpCircle,
  ArrowDownCircle,
  ArrowRightLeft,
  Receipt,
  Star,
  Edit2,
  Trash2,
  X,
  ChevronRight,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  PieChart as ReportsIcon,
  Crown,
  Target,
  Shield,
  TrendingUp,
  Menu,
} from 'lucide-react';
import { initDb, getDb } from './utils/db';
import { checkAndTriggerAutoBackup } from './utils/backupManager';
import { isPro } from './utils/license';
import { isEncryptionEnabled, verifyPassphrase, hashPinSync, verifyPinSync } from './utils/encryption';
import { Account, Transaction } from './types';
import TransactionModal from './components/TransactionModal';
import UpgradeModal from './components/UpgradeModal';
import OnboardingModal from './components/OnboardingModal';
import UpdateModal from './components/UpdateModal';
import AccountDetailModal from './components/AccountDetailModal';
import GettingStartedChecklist from './components/GettingStartedChecklist';
import TransactionsPage from './pages/TransactionsPage';
import BudgetPage from './pages/BudgetPage';
import BillsPage from './pages/BillsPage';
import ForecastPage from './pages/ForecastPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import { useRegionalSettings, getLocalTodayStr, toLocalDateStr, isTransferPayee } from './utils/currency';
import { isAutoCheckEnabled, checkForUpdates, AppUpdateInfo } from './utils/updater';
import { checkAndNotifyUpcomingBills } from './utils/notifications';
import { initBackgroundCloudSyncWatcher } from './utils/syncEngine';

const App = () => {
  const [activePage, setActivePage] = useState('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  // Pro License State
  const [proStatus, setProStatus] = useState<boolean>(() => isPro());
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<
    'accounts_limit' | 'what_if_locked' | 'reports_locked' | 'general' | 'receipts_locked'
  >('general');

  const triggerUpgradeModal = (
    reason: 'accounts_limit' | 'what_if_locked' | 'reports_locked' | 'general' | 'receipts_locked' = 'general'
  ) => {
    setUpgradeReason(reason);
    setIsUpgradeModalOpen(true);
  };

  // Account Detail Modal State
  const [selectedAccountForDetail, setSelectedAccountForDetail] = useState<Account | null>(null);
  const [isAccountDetailOpen, setIsAccountDetailOpen] = useState(false);
  const [transactionsFilterAccountId, setTransactionsFilterAccountId] = useState<number | 'all'>('all');

  const handleOpenAccountDetail = (acc: Account) => {
    setSelectedAccountForDetail(acc);
    setIsAccountDetailOpen(true);
  };

  const handleNavigateToLedger = (accId: number) => {
    setTransactionsFilterAccountId(accId);
    setActivePage('transactions');
  };

  useEffect(() => {
    const handleLicenseChange = (e: any) => {
      setProStatus(Boolean(e.detail?.isPro));
    };
    window.addEventListener('rmoney_license_changed', handleLicenseChange);
    return () => window.removeEventListener('rmoney_license_changed', handleLicenseChange);
  }, []);

  // Dark Mode State
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('rmoney_theme');
    if (saved) return saved === 'dark';
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  });

  const toggleDarkMode = (enabled: boolean) => {
    setDarkMode(enabled);
    localStorage.setItem('rmoney_theme', enabled ? 'dark' : 'light');
    if (enabled) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Privacy Mode State (masks balances)
  const [privacyMode, setPrivacyMode] = useState<boolean>(() => {
    return localStorage.getItem('rmoney_privacy_mode') === 'true';
  });

  const togglePrivacyMode = (enabled?: boolean) => {
    setPrivacyMode((prev) => {
      const next = enabled !== undefined ? enabled : !prev;
      localStorage.setItem('rmoney_privacy_mode', String(next));
      if (next) {
        document.documentElement.classList.add('privacy-mode');
      } else {
        document.documentElement.classList.remove('privacy-mode');
      }
      return next;
    });
  };

  useEffect(() => {
    if (privacyMode) {
      document.documentElement.classList.add('privacy-mode');
    } else {
      document.documentElement.classList.remove('privacy-mode');
    }

    // Keyboard shortcut: Ctrl+H or Cmd+H toggles Privacy Mode
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        togglePrivacyMode();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [privacyMode]);

  // App Lock PIN State
  const [pinHash, setPinHash] = useState<string | null>(() => {
    const raw = localStorage.getItem('rmoney_app_pin');
    if (raw && !raw.startsWith('PINHASH:v1:')) {
      const hashed = hashPinSync(raw);
      localStorage.setItem('rmoney_app_pin', hashed);
      return hashed;
    }
    return raw;
  });
  const [isLocked, setIsLocked] = useState<boolean>(() => {
    return Boolean(localStorage.getItem('rmoney_app_pin'));
  });
  const [enteredPin, setEnteredPin] = useState('');
  const [lockError, setLockError] = useState('');

  const handleUnlock = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!pinHash) {
      setIsLocked(false);
      return;
    }
    if (verifyPinSync(enteredPin, pinHash)) {
      setIsLocked(false);
      setLockError('');
      setEnteredPin('');
    } else {
      setLockError('Incorrect PIN code. Please try again.');
      setEnteredPin('');
    }
  };

  const handleLockNow = () => {
    if (pinHash) {
      setIsLocked(true);
      setEnteredPin('');
      setLockError('');
    }
  };

  const handleUpdatePin = (newPin: string | null) => {
    if (newPin) {
      const hashed = hashPinSync(newPin);
      localStorage.setItem('rmoney_app_pin', hashed);
      setPinHash(hashed);
    } else {
      localStorage.removeItem('rmoney_app_pin');
      setPinHash(null);
      setIsLocked(false);
    }
  };

  // Database Encryption Vault Lock State
  const [vaultActive, setVaultActive] = useState<boolean>(() => isEncryptionEnabled());
  const [isVaultLocked, setIsVaultLocked] = useState<boolean>(() => isEncryptionEnabled());
  const [enteredVaultPassphrase, setEnteredVaultPassphrase] = useState('');
  const [vaultError, setVaultError] = useState('');

  useEffect(() => {
    const handleEncryptionChange = (e: any) => {
      const enabled = Boolean(e.detail?.enabled);
      setVaultActive(enabled);
      if (!enabled) {
        setIsVaultLocked(false);
      }
    };
    window.addEventListener('rmoney_encryption_changed', handleEncryptionChange);
    return () => window.removeEventListener('rmoney_encryption_changed', handleEncryptionChange);
  }, []);

  const handleUnlockVault = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      const valid = await verifyPassphrase(enteredVaultPassphrase);
      if (valid) {
        setIsVaultLocked(false);
        setVaultError('');
        setEnteredVaultPassphrase('');
        // Re-load accounts once unlocked
        refreshAccounts();
      } else {
        setVaultError('Invalid master passphrase. Access denied.');
        setEnteredVaultPassphrase('');
      }
    } catch {
      setVaultError('Failed to verify encryption key.');
    }
  };

  const handleLockVaultNow = () => {
    if (vaultActive) {
      setIsVaultLocked(true);
      setAccounts([]); // Clear memory representation while locked
      setEnteredVaultPassphrase('');
      setVaultError('');
    }
  };

  // Modal State
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [txType, setTxType] = useState<'income' | 'expense' | 'transfer'>('expense');
  const [selectedAccountId, setSelectedAccountId] = useState<number | undefined>(undefined);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [availableUpdate, setAvailableUpdate] = useState<AppUpdateInfo | null>(null);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);

  const refreshAccounts = async () => {
    const db = await getDb();
    const result = (await db.select('SELECT * FROM accounts ORDER BY name ASC')) as Account[];
    setAccounts(result);
    // Notify automated background cloud sync watcher
    window.dispatchEvent(new CustomEvent('rmoney_data_mutated'));
  };

  useEffect(() => {
    const handleSyncComplete = () => {
      refreshAccounts().catch(() => {});
    };
    window.addEventListener('rmoney_sync_completed', handleSyncComplete);
    return () => window.removeEventListener('rmoney_sync_completed', handleSyncComplete);
  }, []);

  useEffect(() => {
    async function setup() {
      try {
        await initDb();
        const db = await getDb();
        const result = (await db.select('SELECT * FROM accounts ORDER BY name ASC')) as Account[];
        if (!isEncryptionEnabled()) {
          setAccounts(result);
        }
        await checkAndTriggerAutoBackup();
        checkAndNotifyUpcomingBills().catch(() => {});
        initBackgroundCloudSyncWatcher();

        const onboardingDone = localStorage.getItem('rmoney_onboarding_completed') === 'true';
        if (!onboardingDone) {
          if (result.length > 0) {
            localStorage.setItem('rmoney_onboarding_completed', 'true');
          } else {
            setIsOnboardingOpen(true);
          }
        }

        // Silent background update check on app launch
        if (isAutoCheckEnabled()) {
          checkForUpdates(false).then((upd) => {
            if (upd && upd.available) {
              setAvailableUpdate(upd);
              setIsUpdateModalOpen(true);
            }
          }).catch(() => {});
        }
      } catch (e) {
        console.error('DB Init Error:', e);
      } finally {
        setLoading(false);
      }
    }
    setup();
  }, []);

  const handleOnboardingComplete = async (action?: 'demo' | 'clean' | 'import') => {
    await refreshAccounts();
    if (action === 'import') {
      setActivePage('settings');
    }
  };

  const openTransactionModal = (type: 'income' | 'expense' | 'transfer', accId?: number) => {
    if (accounts.length === 0) {
      alert('Please add at least one account first!');
      setActivePage('accounts');
      return;
    }
    setSelectedAccountId(accId || accounts[0].id);
    setTxType(type);
    setIsTxModalOpen(true);
  };

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard':
        return (
          <Dashboard
            accounts={accounts}
            onAddIncome={() => openTransactionModal('income')}
            onAddExpense={() => openTransactionModal('expense')}
            onTransfer={() => openTransactionModal('transfer')}
            onNavigate={setActivePage}
            onRefresh={refreshAccounts}
            privacyMode={privacyMode}
            onTogglePrivacyMode={togglePrivacyMode}
            onLaunchOnboarding={() => setIsOnboardingOpen(true)}
            onOpenAccountDetail={handleOpenAccountDetail}
          />
        );
      case 'accounts':
        return (
          <AccountsPage
            accounts={accounts}
            onRefresh={refreshAccounts}
            proStatus={proStatus}
            onTriggerUpgrade={triggerUpgradeModal}
            onOpenDetail={handleOpenAccountDetail}
          />
        );
      case 'transactions':
        return (
          <TransactionsPage
            proStatus={proStatus}
            onTriggerUpgrade={triggerUpgradeModal}
            initialAccountId={transactionsFilterAccountId}
          />
        );
      case 'budget':
        return <BudgetPage />;
      case 'bills':
        return <BillsPage />;
      case 'forecast':
        return <ForecastPage proStatus={proStatus} onTriggerUpgrade={triggerUpgradeModal} />;
      case 'reports':
        return <ReportsPage proStatus={proStatus} onTriggerUpgrade={triggerUpgradeModal} />;
      case 'settings':
        return (
          <SettingsPage
            onDataRestored={refreshAccounts}
            darkMode={darkMode}
            onToggleDarkMode={toggleDarkMode}
            privacyMode={privacyMode}
            onTogglePrivacyMode={togglePrivacyMode}
            hasPin={Boolean(pinHash)}
            onUpdatePin={handleUpdatePin}
            proStatus={proStatus}
            onTriggerUpgrade={triggerUpgradeModal}
            onLaunchOnboarding={() => setIsOnboardingOpen(true)}
          />
        );
      default:
        return (
          <Dashboard
            accounts={accounts}
            onAddIncome={() => openTransactionModal('income')}
            onAddExpense={() => openTransactionModal('expense')}
            onTransfer={() => openTransactionModal('transfer')}
            onNavigate={setActivePage}
            onRefresh={refreshAccounts}
            privacyMode={privacyMode}
            onTogglePrivacyMode={togglePrivacyMode}
            onLaunchOnboarding={() => setIsOnboardingOpen(true)}
          />
        );
    }
  };

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-900 text-white font-sans">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="font-semibold text-slate-300">Loading rMoney...</p>
        </div>
      </div>
    );
  }

  // Database Security Vault Lock Screen
  if (vaultActive && isVaultLocked) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-950 text-white font-sans p-4">
        <div className="bg-slate-900 border border-purple-900/60 p-8 rounded-3xl shadow-2xl max-w-sm w-full text-center space-y-6">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-tr from-purple-700 via-indigo-600 to-purple-500 flex items-center justify-center text-white shadow-lg shadow-purple-500/25 ring-1 ring-white/20">
            <Shield size={28} />
          </div>

          <div>
            <h2 className="text-2xl font-black text-white tracking-tight">Security Vault Locked</h2>
            <p className="text-xs text-slate-400 mt-1">
              This ledger is sealed with AES-GCM-256 database encryption. Enter your master passphrase to unlock.
            </p>
          </div>

          <form onSubmit={handleUnlockVault} className="space-y-4">
            <input
              type="password"
              autoFocus
              placeholder="Master Passphrase"
              value={enteredVaultPassphrase}
              onChange={(e) => setEnteredVaultPassphrase(e.target.value)}
              className="w-full text-center text-sm font-medium py-3 px-4 bg-slate-950 border border-purple-800/60 rounded-xl text-white outline-none focus:ring-2 focus:ring-purple-500 placeholder:text-slate-600"
            />

            {vaultError && (
              <p className="text-xs text-rose-400 font-medium animate-in fade-in duration-200">
                {vaultError}
              </p>
            )}

            <button
              type="submit"
              disabled={!enteredVaultPassphrase}
              className="w-full py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white font-bold rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
            >
              <Unlock size={18} />
              <span>Unlock Ledger</span>
            </button>
          </form>

          <p className="text-[11px] text-slate-500">
            PBKDF2-SHA256 • 100,000 Key Derivations • Offline Vault
          </p>
        </div>
      </div>
    );
  }

  // App Lock PIN Screen
  if (isLocked && pinHash) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-900 text-white font-sans p-4">
        <div className="bg-slate-800 border border-slate-700/80 p-8 rounded-3xl shadow-2xl max-w-sm w-full text-center space-y-6">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-700 via-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/25 ring-1 ring-white/20">
            <Lock size={28} />
          </div>

          <div>
            <h2 className="text-2xl font-black text-white tracking-tight">rMoney Locked</h2>
            <p className="text-xs text-slate-400 mt-1">Enter your 4 to 8 digit security PIN to continue</p>
          </div>

          <form onSubmit={handleUnlock} className="space-y-4">
            <input
              type="password"
              inputMode="numeric"
              maxLength={8}
              autoFocus
              placeholder="••••"
              value={enteredPin}
              onChange={(e) => setEnteredPin(e.target.value)}
              className="w-full text-center tracking-[0.5em] text-2xl font-bold py-3 px-4 bg-slate-900 border border-slate-700 rounded-xl text-white outline-none focus:ring-2 focus:ring-blue-500"
            />

            {lockError && (
              <p className="text-xs text-red-400 font-medium animate-in fade-in duration-200">
                {lockError}
              </p>
            )}

            <button
              type="submit"
              disabled={enteredPin.length < 4}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:hover:bg-blue-600 text-white font-bold rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
            >
              <Unlock size={18} />
              <span>Unlock App</span>
            </button>
          </form>

          <p className="text-[11px] text-slate-400">
            Local device protection • Offline private storage
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-100 text-slate-900 font-sans flex-col md:flex-row overflow-hidden">
      {/* Desktop Sidebar (Hidden on mobile) */}
      <aside className="hidden md:flex md:w-64 bg-slate-900 text-slate-300 flex-col shadow-xl border-r border-slate-800/80 shrink-0">
        <div className="relative overflow-hidden p-5 pb-6 border-b border-slate-800/80 mb-2 bg-gradient-to-b from-blue-950/40 via-indigo-950/20 to-transparent">
          {/* Ambient gradient glow behind the logo */}
          <div className="absolute -top-10 -left-10 w-44 h-44 bg-gradient-to-br from-blue-500/25 via-indigo-500/15 to-transparent rounded-full blur-2xl pointer-events-none" />
          <div className="absolute top-2 left-20 w-28 h-28 bg-emerald-500/10 rounded-full blur-xl pointer-events-none" />

          <div className="relative z-10 flex items-center gap-3.5">
            <div className="relative flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-700 via-blue-600 to-indigo-500 text-white shadow-xl shadow-blue-500/30 ring-1 ring-white/25 shrink-0">
              <span className="font-brand font-bold italic text-4xl select-none leading-none pr-0.5 pb-0.5">r</span>
              <span className="text-emerald-300 font-brand font-bold italic text-base absolute -bottom-1 -right-1 bg-slate-900/90 rounded-full px-1.5 ring-1 ring-slate-800 leading-tight shadow-sm">$</span>
            </div>
            <div>
              <div className="flex items-baseline tracking-normal leading-none font-brand italic">
                <span className="text-blue-400 font-bold text-[40px] lowercase">r</span>
                <span className="text-white font-bold text-[38px] tracking-tight ml-0.5">Money</span>
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <p className="text-[11px] uppercase font-bold tracking-widest text-slate-400 not-italic">Personal Finance</p>
                {proStatus ? (
                  <span className="bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded shadow-2xs">
                    PRO
                  </span>
                ) : (
                  <button
                    onClick={() => triggerUpgradeModal('general')}
                    className="bg-slate-800 hover:bg-slate-700 text-amber-400 border border-amber-500/40 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded cursor-pointer transition-colors"
                    title="Click to upgrade to Pro"
                  >
                    FREE
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-4 space-y-1.5">
          <NavItem
            active={activePage === 'dashboard'}
            onClick={() => setActivePage('dashboard')}
            icon={<LayoutDashboard size={20} />}
            label="Dashboard"
          />
          <NavItem
            active={activePage === 'accounts'}
            onClick={() => setActivePage('accounts')}
            icon={<Wallet size={20} />}
            label="Accounts"
          />
          <NavItem
            active={activePage === 'transactions'}
            onClick={() => setActivePage('transactions')}
            icon={<Receipt size={20} />}
            label="Transactions"
          />
          <NavItem
            active={activePage === 'budget'}
            onClick={() => setActivePage('budget')}
            icon={<Target size={20} />}
            label="Budget"
          />
          <NavItem
            active={activePage === 'bills'}
            onClick={() => setActivePage('bills')}
            icon={<Calendar size={20} />}
            label="Bills"
          />
          <NavItem
            active={activePage === 'forecast'}
            onClick={() => setActivePage('forecast')}
            icon={<BarChart3 size={20} />}
            label="Forecast"
          />
          <NavItem
            active={activePage === 'reports'}
            onClick={() => setActivePage('reports')}
            icon={<ReportsIcon size={20} />}
            label="Reports"
          />
        </nav>

        <div className="p-3 border-t border-slate-800 space-y-1.5">
          {/* Privacy Mode Quick Toggle */}
          <button
            onClick={() => togglePrivacyMode()}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl transition-all text-xs font-semibold ${
              privacyMode
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'hover:bg-slate-800 text-slate-400 hover:text-white'
            }`}
            title="Toggle Privacy Masking (Ctrl+H / Cmd+H)"
          >
            <div className="flex items-center gap-2.5">
              {privacyMode ? <EyeOff size={16} /> : <Eye size={16} />}
              <span>{privacyMode ? 'Privacy Active' : 'Privacy Mode'}</span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono bg-slate-800/80 px-1.5 py-0.5 rounded">Ctrl+H</span>
          </button>

          {/* Quick Lock Button if PIN is configured */}
          {pinHash && (
            <button
              onClick={handleLockNow}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 rounded-xl transition-all text-xs font-semibold text-slate-400 hover:bg-slate-800 hover:text-white"
              title="Lock rMoney with PIN"
            >
              <Lock size={15} />
              <span>Lock App</span>
            </button>
          )}

          {/* Quick Lock Button if Vault Encryption is configured */}
          {vaultActive && (
            <button
              onClick={handleLockVaultNow}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 rounded-xl transition-all text-xs font-semibold text-purple-300 hover:bg-purple-950/60 hover:text-white cursor-pointer"
              title="Lock Database Security Vault"
            >
              <Shield size={15} />
              <span>Lock Vault</span>
            </button>
          )}

          <NavItem
            active={activePage === 'settings'}
            onClick={() => setActivePage('settings')}
            icon={<Settings size={18} />}
            label="Settings"
          />
        </div>
      </aside>

      {/* Main App Container */}
      <div className="flex-1 flex flex-col overflow-hidden relative min-w-0">
        {/* Mobile Top Header (Shown only on < md screens) */}
        <header className="flex md:hidden items-center justify-between px-3.5 py-2.5 bg-slate-900 text-white border-b border-slate-800 shadow-sm shrink-0 z-30 pt-[max(0.625rem,env(safe-area-inset-top))]">
          <div className="flex items-center gap-2.5">
            <div className="relative flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-700 via-blue-600 to-indigo-500 text-white shadow-md shadow-blue-500/20 ring-1 ring-white/20 shrink-0">
              <span className="font-brand font-bold italic text-xl select-none leading-none pr-0.5 pb-0.5">r</span>
              <span className="text-emerald-300 font-brand font-bold italic text-[9px] absolute -bottom-1 -right-1 bg-slate-900/90 rounded-full px-1 ring-1 ring-slate-800 leading-tight">$</span>
            </div>
            <div className="flex items-center gap-1.5 font-brand italic">
              <span className="text-blue-400 font-bold text-2xl lowercase">r</span>
              <span className="text-white font-bold text-xl tracking-tight ml-0.5">Money</span>
              {proStatus ? (
                <span className="ml-1 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded not-italic shadow-xs">
                  PRO
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Mobile Privacy Toggle */}
            <button
              onClick={() => togglePrivacyMode()}
              className={`p-2 rounded-xl border transition-colors ${
                privacyMode
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:text-white'
              }`}
              title="Toggle Privacy Mode"
              aria-label="Toggle Privacy Mode"
            >
              {privacyMode ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>

            {/* Quick Add Expense Button */}
            <button
              onClick={() => openTransactionModal('expense')}
              className="flex items-center gap-1 bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-xl font-bold text-xs shadow-md shadow-blue-600/30 transition-transform active:scale-95"
              title="Add Expense"
            >
              <PlusCircle size={15} />
              <span>Add</span>
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-3.5 pb-32 sm:p-6 sm:pb-28 md:p-8 md:pb-8 min-w-0">
          {renderPage()}
        </main>

        {/* Mobile Bottom Navigation Bar */}
        <nav className="flex md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-lg border-t border-slate-800/90 px-1 py-1 justify-around items-center pb-[max(0.4rem,env(safe-area-inset-bottom))] shadow-2xl">
          <button
            onClick={() => { setActivePage('dashboard'); setIsMobileMenuOpen(false); }}
            className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all ${
              activePage === 'dashboard'
                ? 'text-blue-400 font-bold scale-105'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <LayoutDashboard size={19} />
            <span className="text-[10px] mt-0.5">Dashboard</span>
          </button>

          <button
            onClick={() => { setActivePage('accounts'); setIsMobileMenuOpen(false); }}
            className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all ${
              activePage === 'accounts'
                ? 'text-blue-400 font-bold scale-105'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Wallet size={19} />
            <span className="text-[10px] mt-0.5">Accounts</span>
          </button>

          <button
            onClick={() => { setActivePage('transactions'); setIsMobileMenuOpen(false); }}
            className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all ${
              activePage === 'transactions'
                ? 'text-blue-400 font-bold scale-105'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Receipt size={19} />
            <span className="text-[10px] mt-0.5">Transactions</span>
          </button>

          <button
            onClick={() => { setActivePage('budget'); setIsMobileMenuOpen(false); }}
            className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all ${
              activePage === 'budget'
                ? 'text-blue-400 font-bold scale-105'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Target size={19} />
            <span className="text-[10px] mt-0.5">Budget</span>
          </button>

          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all ${
              isMobileMenuOpen || ['bills', 'forecast', 'reports', 'settings'].includes(activePage)
                ? 'text-blue-400 font-bold scale-105'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Menu size={19} />
            <span className="text-[10px] mt-0.5">More</span>
          </button>
        </nav>

        {/* Mobile More Drawer Sheet */}
        {isMobileMenuOpen && (
          <div className="fixed inset-0 z-50 md:hidden flex flex-col justify-end">
            <div
              className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity"
              onClick={() => setIsMobileMenuOpen(false)}
            />
            <div className="relative z-10 bg-slate-900 border-t border-slate-800 rounded-t-3xl p-5 shadow-2xl max-h-[85vh] overflow-y-auto space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-base">More Features</span>
                  <span className="text-xs text-slate-400">rMoney</span>
                </div>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  onClick={() => { setActivePage('bills'); setIsMobileMenuOpen(false); }}
                  className={`flex items-center gap-3 p-3 rounded-xl text-left font-semibold text-xs transition-colors ${
                    activePage === 'bills'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <Calendar size={18} className="text-blue-400" />
                  <span>Bills & Subs</span>
                </button>

                <button
                  onClick={() => { setActivePage('forecast'); setIsMobileMenuOpen(false); }}
                  className={`flex items-center gap-3 p-3 rounded-xl text-left font-semibold text-xs transition-colors ${
                    activePage === 'forecast'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <BarChart3 size={18} className="text-emerald-400" />
                  <span>Cash Forecast</span>
                </button>

                <button
                  onClick={() => { setActivePage('reports'); setIsMobileMenuOpen(false); }}
                  className={`flex items-center gap-3 p-3 rounded-xl text-left font-semibold text-xs transition-colors ${
                    activePage === 'reports'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <ReportsIcon size={18} className="text-purple-400" />
                  <span>Reports</span>
                </button>

                <button
                  onClick={() => { setActivePage('settings'); setIsMobileMenuOpen(false); }}
                  className={`flex items-center gap-3 p-3 rounded-xl text-left font-semibold text-xs transition-colors ${
                    activePage === 'settings'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <Settings size={18} className="text-amber-400" />
                  <span>Settings & Sync</span>
                </button>
              </div>

              {/* Quick Security & Vault Options */}
              {(pinHash || vaultActive) && (
                <div className="pt-2 border-t border-slate-800/80 space-y-2">
                  {pinHash && (
                    <button
                      onClick={() => { handleLockNow(); setIsMobileMenuOpen(false); }}
                      className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-800/60 hover:bg-slate-800 text-xs text-slate-300 font-semibold"
                    >
                      <div className="flex items-center gap-2.5">
                        <Lock size={16} className="text-amber-400" />
                        <span>Lock App with PIN</span>
                      </div>
                      <ChevronRight size={14} className="text-slate-500" />
                    </button>
                  )}

                  {vaultActive && (
                    <button
                      onClick={() => { handleLockVaultNow(); setIsMobileMenuOpen(false); }}
                      className="w-full flex items-center justify-between p-3 rounded-xl bg-purple-950/40 hover:bg-purple-950/70 text-xs text-purple-200 font-semibold"
                    >
                      <div className="flex items-center gap-2.5">
                        <Shield size={16} className="text-purple-400" />
                        <span>Lock Security Vault</span>
                      </div>
                      <ChevronRight size={14} className="text-slate-500" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Transaction Modal */}
      <TransactionModal
        isOpen={isTxModalOpen}
        onClose={() => setIsTxModalOpen(false)}
        accounts={accounts}
        defaultAccountId={selectedAccountId}
        type={txType}
        onSuccess={refreshAccounts}
        proStatus={proStatus}
        onTriggerUpgrade={triggerUpgradeModal}
      />

      {/* Upgrade to Pro Modal */}
      <UpgradeModal
        isOpen={isUpgradeModalOpen}
        onClose={() => setIsUpgradeModalOpen(false)}
        reason={upgradeReason}
        onSuccess={() => setProStatus(true)}
      />

      {/* Onboarding Welcome Wizard */}
      <OnboardingModal
        isOpen={isOnboardingOpen}
        onClose={() => setIsOnboardingOpen(false)}
        onComplete={handleOnboardingComplete}
      />

      {/* In-App Auto Update Modal */}
      <UpdateModal
        isOpen={isUpdateModalOpen}
        onClose={() => setIsUpdateModalOpen(false)}
        updateInfo={availableUpdate}
      />

      {/* Account Detail Running Balance Modal */}
      <AccountDetailModal
        account={selectedAccountForDetail}
        isOpen={isAccountDetailOpen}
        onClose={() => setIsAccountDetailOpen(false)}
        onNavigateToLedger={handleNavigateToLedger}
      />
    </div>
  );
};

const NavItem = ({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
      active ? 'bg-blue-600 text-white shadow-md font-semibold' : 'hover:bg-slate-800 hover:text-white text-slate-400 font-medium'
    }`}
  >
    {icon}
    <span>{label}</span>
  </button>
);

interface DashboardProps {
  accounts: Account[];
  onAddIncome: () => void;
  onAddExpense: () => void;
  onTransfer: () => void;
  onNavigate: (page: string) => void;
  onRefresh: () => Promise<void>;
  privacyMode: boolean;
  onTogglePrivacyMode: () => void;
  onLaunchOnboarding: () => void;
  onOpenAccountDetail?: (acc: Account) => void;
}

const Dashboard = ({
  accounts,
  onAddIncome,
  onAddExpense,
  onTransfer,
  onNavigate,
  onRefresh,
  privacyMode,
  onTogglePrivacyMode,
  onLaunchOnboarding,
  onOpenAccountDetail,
}: DashboardProps) => {
  const { formatCurrency, formatDate } = useRegionalSettings();
  const [stats, setStats] = useState({
    upcomingBills: 0,
    monthlySpending: 0,
    monthlyIncome: 0,
  });
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const [budgetOverview, setBudgetOverview] = useState<{
    totalBudget: number;
    totalSpent: number;
    pct: number;
    topCategories: { id: number; name: string; budget: number; spent: number; pct: number; isOver: boolean }[];
    overCount: number;
  }>({
    totalBudget: 0,
    totalSpent: 0,
    pct: 0,
    topCategories: [],
    overCount: 0,
  });

  const fetchDashboardData = async () => {
    try {
      const db = await getDb();

      // 1. Calculate Upcoming Bills (Next 30 days)
      const today = getLocalTodayStr(0);
      const dateLimit = getLocalTodayStr(30);

      const upcoming = (await db.select(
        'SELECT SUM(ABS(amount)) as total FROM scheduled_transactions WHERE next_date >= ? AND next_date <= ? AND type != ?',
        [today, dateLimit, 'income']
      )) as { total: number }[];
      const upcomingTotal = upcoming[0]?.total || 0;

      // 2. Monthly Spending & Income (Current calendar month, excluding internal transfers & opening balances)
      const now = new Date();
      const firstDayOfMonth = toLocalDateStr(new Date(now.getFullYear(), now.getMonth(), 1));
      const lastDayOfMonth = toLocalDateStr(new Date(now.getFullYear(), now.getMonth() + 1, 0));

      const monthTxs = (await db.select(
        'SELECT id, category_id, payee, amount FROM transactions WHERE date >= ? AND date <= ?',
        [firstDayOfMonth, lastDayOfMonth]
      )) as { id: number; category_id: number; payee: string; amount: number }[];

      const monthSplits = (await db.select(
        `SELECT ts.transaction_id, ts.category_id, ts.amount
         FROM transaction_splits ts
         JOIN transactions t ON ts.transaction_id = t.id
         WHERE t.date >= ? AND t.date <= ?`,
        [firstDayOfMonth, lastDayOfMonth]
      )) as { transaction_id: number; category_id: number; amount: number }[];

      const splitMap: { [txId: number]: { category_id: number; amount: number }[] } = {};
      for (const sp of monthSplits) {
        if (!splitMap[sp.transaction_id]) splitMap[sp.transaction_id] = [];
        splitMap[sp.transaction_id].push(sp);
      }

      let spendingTotal = 0;
      let incomeTotal = 0;
      const catSpendMap: { [catId: number]: number } = {};

      for (const tx of monthTxs) {
        if (isTransferPayee(tx.payee)) continue;

        if (tx.amount < 0) {
          spendingTotal += Math.abs(tx.amount);
          const splits = splitMap[tx.id];
          if (splits && splits.length > 0) {
            for (const sp of splits) {
              if (sp.amount < 0) {
                catSpendMap[sp.category_id] = (catSpendMap[sp.category_id] || 0) + Math.abs(sp.amount);
              }
            }
          } else {
            catSpendMap[tx.category_id] = (catSpendMap[tx.category_id] || 0) + Math.abs(tx.amount);
          }
        } else if (tx.amount > 0) {
          incomeTotal += tx.amount;
        }
      }

      // 3. Recent Transactions
      const recents = (await db.select(`
        SELECT 
          t.*, 
          a.name as account_name, 
          c.name as category_name 
        FROM transactions t 
        JOIN accounts a ON t.account_id = a.id 
        LEFT JOIN categories c ON t.category_id = c.id 
        ORDER BY t.date DESC, t.id DESC 
        LIMIT 5
      `)) as Transaction[];

      // 4. Monthly Budget overview
      const budgetedCats = (await db.select(`
        SELECT id, name, COALESCE(monthly_budget, 0) as monthly_budget 
        FROM categories 
        WHERE type = 'expense' AND monthly_budget > 0
        ORDER BY monthly_budget DESC
      `)) as { id: number; name: string; monthly_budget: number }[];

      const totalBudget = budgetedCats.reduce((sum, b) => sum + b.monthly_budget, 0);
      let overCount = 0;

      const topCats = budgetedCats.map((b) => {
        const spent = catSpendMap[b.id] || 0;
        const pct = b.monthly_budget > 0 ? (spent / b.monthly_budget) * 100 : 0;
        const isOver = spent > b.monthly_budget;
        if (isOver) overCount++;
        return {
          id: b.id,
          name: b.name,
          budget: b.monthly_budget,
          spent,
          pct,
          isOver,
        };
      });

      const overallPct = totalBudget > 0 ? (spendingTotal / totalBudget) * 100 : 0;

      setBudgetOverview({
        totalBudget,
        totalSpent: spendingTotal,
        pct: overallPct,
        topCategories: topCats.slice(0, 3),
        overCount,
      });

      setStats({
        upcomingBills: upcomingTotal,
        monthlySpending: spendingTotal,
        monthlyIncome: incomeTotal,
      });
      setRecentTransactions(recents);
    } catch (e) {
      console.error('Error fetching dashboard stats:', e);
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [accounts]);

  const toggleFavorite = async (acc: Account) => {
    try {
      const db = await getDb();
      const newStatus = acc.is_favorite ? 0 : 1;
      await db.execute('UPDATE accounts SET is_favorite = ? WHERE id = ?', [newStatus, acc.id]);
      await onRefresh();
    } catch (e) {
      console.error('Error toggling favorite:', e);
    }
  };

  const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);
  const favoriteAccounts = accounts.filter((a) => a.is_favorite);
  const accountsToDisplay = favoriteAccounts.length > 0 ? favoriteAccounts : accounts;

  return (
    <div className="w-full space-y-6 pb-6">
      <div className="space-y-4">
        <header>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">My Money</h1>
          <p className="text-slate-500 text-xs sm:text-sm">Welcome to your personal financial overview</p>
        </header>

        {/* Getting Started Checklist */}
        <GettingStartedChecklist
          accounts={accounts}
          onNavigate={onNavigate}
          privacyMode={privacyMode}
          onTogglePrivacyMode={onTogglePrivacyMode}
          onOpenAddAccount={() => onNavigate('accounts')}
          onLaunchOnboarding={onLaunchOnboarding}
        />
      </div>

      {/* Key Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        <StatCard
          label="Net Worth"
          value={formatCurrency(totalBalance)}
          icon={<Wallet className="text-blue-500" size={20} />}
        />
        <StatCard
          label="Upcoming Bills"
          value={loadingStats ? '...' : formatCurrency(stats.upcomingBills)}
          icon={<Calendar className="text-orange-500" size={20} />}
        />
        <StatCard
          label="Spending (Mo)"
          value={loadingStats ? '...' : formatCurrency(stats.monthlySpending)}
          icon={<ArrowDownCircle className="text-red-500" size={20} />}
        />
        <StatCard
          label="Income (Mo)"
          value={loadingStats ? '...' : formatCurrency(stats.monthlyIncome)}
          icon={<ArrowUpCircle className="text-green-500" size={20} />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Favorite Accounts */}
        <section className="bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl shadow-sm border border-slate-200 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h2 className="text-base sm:text-xl font-bold text-slate-800 flex items-center gap-2">
              <Star size={18} className="text-amber-400 fill-amber-400" />
              <span>{favoriteAccounts.length > 0 ? 'Favorite Accounts' : 'All Accounts'}</span>
            </h2>
            <button
              onClick={() => onNavigate('accounts')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-0.5"
            >
              Manage <ChevronRight size={14} />
            </button>
          </div>

          <div className="space-y-2 sm:space-y-2.5">
            {accountsToDisplay.length === 0 ? (
              <p className="text-slate-400 text-xs sm:text-sm italic py-4 text-center">
                No accounts created yet. Head over to Accounts to add one.
              </p>
            ) : (
              accountsToDisplay.map((acc) => (
                <div
                  key={acc.id}
                  onClick={() => onOpenAccountDetail && onOpenAccountDetail(acc)}
                  className="flex justify-between items-center p-3 sm:p-3.5 bg-slate-50/80 rounded-xl sm:rounded-2xl border border-slate-100 hover:bg-blue-50/50 hover:border-blue-200 transition-all cursor-pointer group"
                  title="Click to view running balance history & analytics"
                >
                  <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(acc);
                      }}
                      title={acc.is_favorite ? 'Unmark Favorite' : 'Mark as Favorite'}
                      className="text-slate-300 hover:text-amber-400 transition-colors shrink-0"
                    >
                      <Star
                        size={16}
                        className={acc.is_favorite ? 'text-amber-400 fill-amber-400' : ''}
                      />
                    </button>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 text-xs sm:text-sm group-hover:text-blue-600 transition-colors flex items-center gap-1 truncate">
                        <span className="truncate">{acc.name}</span>
                        <TrendingUp size={12} className="opacity-0 group-hover:opacity-100 text-blue-500 transition-opacity shrink-0" />
                      </p>
                      <p className="text-[11px] text-slate-400 truncate">{acc.type || 'Checking'}</p>
                    </div>
                  </div>
                  <span
                    className={`font-bold tabular-nums text-sm sm:text-base shrink-0 ${
                      acc.balance < 0 ? 'text-red-500' : 'text-slate-900'
                    }`}
                  >
                    {formatCurrency(acc.balance)}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Quick Actions */}
        <section className="bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl shadow-sm border border-slate-200 flex flex-col justify-between">
          <div className="mb-3 sm:mb-6">
            <h2 className="text-base sm:text-xl font-bold text-slate-800 mb-1">Quick Actions</h2>
            <p className="text-xs sm:text-sm text-slate-500">Instantly record transactions or move money</p>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <button
              onClick={onAddExpense}
              className="flex flex-col items-center justify-center p-2.5 sm:p-5 bg-red-50 text-red-700 rounded-xl sm:rounded-2xl hover:bg-red-100 transition-all border border-red-100/80 shadow-xs group"
            >
              <ArrowDownCircle className="mb-1 sm:mb-2 text-red-500 group-hover:scale-110 transition-transform size-5 sm:size-6.5" />
              <span className="font-bold text-[11px] sm:text-sm truncate">Add Expense</span>
            </button>
            <button
              onClick={onAddIncome}
              className="flex flex-col items-center justify-center p-2.5 sm:p-5 bg-green-50 text-green-700 rounded-xl sm:rounded-2xl hover:bg-green-100 transition-all border border-green-100/80 shadow-xs group"
            >
              <ArrowUpCircle className="mb-1 sm:mb-2 text-green-500 group-hover:scale-110 transition-transform size-5 sm:size-6.5" />
              <span className="font-bold text-[11px] sm:text-sm truncate">Add Income</span>
            </button>
            <button
              onClick={onTransfer}
              className="flex flex-col items-center justify-center p-2.5 sm:p-5 bg-purple-50 text-purple-700 rounded-xl sm:rounded-2xl hover:bg-purple-100 transition-all border border-purple-100/80 shadow-xs group"
            >
              <ArrowRightLeft className="mb-1 sm:mb-2 text-purple-500 group-hover:scale-110 transition-transform size-5 sm:size-6.5" />
              <span className="font-bold text-[11px] sm:text-sm truncate">Transfer</span>
            </button>
          </div>
        </section>
      </div>

      {/* Monthly Budget Summary Card */}
      {budgetOverview.totalBudget > 0 && (
        <section className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-2xl">
                <Target size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-slate-800">Monthly Budget Progress</h2>
                  {budgetOverview.overCount > 0 ? (
                    <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider rounded-md bg-rose-100 text-rose-700 border border-rose-200">
                      {budgetOverview.overCount} Over Limit
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                      On Track
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400">
                  {formatCurrency(budgetOverview.totalSpent)} spent of {formatCurrency(budgetOverview.totalBudget)} total budget ({Math.round(budgetOverview.pct)}% used)
                </p>
              </div>
            </div>

            <button
              onClick={() => onNavigate('budget')}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 self-start sm:self-center"
            >
              Open Budget Planner <ChevronRight size={14} />
            </button>
          </div>

          {/* Top Categories Mini Progress Gauges */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
            {budgetOverview.topCategories.map((c) => (
              <div key={c.id} className="p-3.5 bg-slate-50/80 rounded-2xl border border-slate-100 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800 truncate">{c.name}</span>
                  <span
                    className={`font-mono font-bold text-[11px] ${
                      c.isOver ? 'text-rose-600' : 'text-slate-600'
                    }`}
                  >
                    {formatCurrency(c.spent, { decimals: 0 })} / {formatCurrency(c.budget, { decimals: 0 })}
                  </span>
                </div>
                <div className="h-2 w-full bg-slate-200/80 rounded-full overflow-hidden flex">
                  <div
                    className={`h-full rounded-full transition-all ${
                      c.isOver
                        ? 'bg-rose-500'
                        : c.pct >= 80
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(c.pct, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between items-center text-[10px] text-slate-400 font-medium">
                  <span>{Math.round(c.pct)}%</span>
                  {c.isOver ? (
                    <span className="text-rose-600 font-bold">+{formatCurrency(c.spent - c.budget, { decimals: 0 })} over</span>
                  ) : (
                    <span>{formatCurrency(c.budget - c.spent, { decimals: 0 })} left</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recent Transactions List */}
      <section className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Receipt size={20} className="text-blue-500" />
            Recent Activity
          </h2>
          <button
            onClick={() => onNavigate('transactions')}
            className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-0.5"
          >
            View All Transactions <ChevronRight size={14} />
          </button>
        </div>

        {recentTransactions.length === 0 ? (
          <p className="text-slate-400 text-sm italic py-4">No recent transactions recorded.</p>
        ) : (
          <div className="divide-y divide-slate-100 text-sm overflow-y-auto">
            {recentTransactions.map((tx) => (
              <div key={tx.id} className="py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`p-2 rounded-xl ${
                      tx.amount < 0 ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-600'
                    }`}
                  >
                    {tx.amount < 0 ? <ArrowDownCircle size={18} /> : <ArrowUpCircle size={18} />}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800">{tx.payee}</p>
                    <p className="text-xs text-slate-400">
                      {formatDate(tx.date)} • {tx.account_name} • {tx.category_name || 'General'}
                    </p>
                  </div>
                </div>
                <span
                  className={`font-bold tabular-nums ${
                    tx.amount < 0 ? 'text-red-500' : 'text-green-600'
                  }`}
                >
                  {formatCurrency(tx.amount, { showSign: true })}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

const StatCard = ({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) => (
  <div className="bg-white p-3 sm:p-5 rounded-2xl sm:rounded-3xl shadow-xs border border-slate-200/90 flex flex-col justify-between min-w-0">
    <div className="flex items-center justify-between gap-1 mb-1.5">
      <p className="text-[10px] sm:text-xs text-slate-400 font-bold uppercase tracking-wider leading-tight">{label}</p>
      <div className="p-1 sm:p-2 bg-slate-50 rounded-xl shrink-0 [&>svg]:size-4 sm:[&>svg]:size-5">{icon}</div>
    </div>
    <p className="text-base sm:text-xl lg:text-2xl font-black text-slate-900 tracking-tight truncate tabular-nums">{value}</p>
  </div>
);

interface AccountsPageProps {
  accounts: Account[];
  onRefresh: () => Promise<void>;
  proStatus?: boolean;
  onTriggerUpgrade?: (reason: 'accounts_limit' | 'what_if_locked' | 'general' | 'reports_locked' | 'receipts_locked') => void;
  onOpenDetail?: (acc: Account) => void;
}

const AccountsPage = ({
  accounts,
  onRefresh,
  proStatus = false,
  onTriggerUpgrade,
  onOpenDetail,
}: AccountsPageProps) => {
  const { formatCurrency, currency } = useRegionalSettings();
  const [newAccName, setNewAccName] = useState('');
  const [newAccType, setNewAccType] = useState('Checking');
  const [newAccBalance, setNewAccBalance] = useState('');

  // Edit Account state
  const [editingAcc, setEditingAcc] = useState<Account | null>(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState('');
  const [editBalance, setEditBalance] = useState('');

  const addAccount = async () => {
    if (!proStatus && accounts.length >= 2) {
      if (onTriggerUpgrade) onTriggerUpgrade('accounts_limit');
      return;
    }
    if (!newAccName.trim() || !newAccBalance) return;
    try {
      const db = await getDb();
      await db.execute(
        'INSERT INTO accounts (name, type, balance, currency, is_favorite) VALUES (?, ?, ?, ?, ?)',
        [newAccName.trim(), newAccType, parseFloat(newAccBalance), currency.code, 1]
      );
      setNewAccName('');
      setNewAccBalance('');
      await onRefresh();
    } catch (e) {
      console.error('Error adding account:', e);
      alert('Failed to add account.');
    }
  };

  const handleStartEdit = (acc: Account) => {
    setEditingAcc(acc);
    setEditName(acc.name);
    setEditType(acc.type || 'Checking');
    setEditBalance(String(acc.balance));
  };

  const handleSaveEdit = async () => {
    if (!editingAcc || !editName.trim()) return;
    try {
      const db = await getDb();
      await db.execute(
        'UPDATE accounts SET name = ?, type = ?, balance = ? WHERE id = ?',
        [editName.trim(), editType, parseFloat(editBalance) || 0, editingAcc.id]
      );
      setEditingAcc(null);
      await onRefresh();
    } catch (e) {
      console.error('Error updating account:', e);
      alert('Failed to update account.');
    }
  };

  const handleDeleteAccount = async (acc: Account) => {
    const db = await getDb();
    const countResult = (await db.select(
      'SELECT COUNT(*) as count FROM transactions WHERE account_id = ?',
      [acc.id]
    )) as { count: number }[];
    const txCount = countResult[0]?.count || 0;

    const msg =
      txCount > 0
        ? `Account "${acc.name}" has ${txCount} transaction(s). Deleting it will also delete all associated transactions. Are you sure?`
        : `Are you sure you want to delete account "${acc.name}"?`;

    if (!confirm(msg)) return;

    try {
      await db.execute('DELETE FROM transactions WHERE account_id = ?', [acc.id]);
      await db.execute('DELETE FROM scheduled_transactions WHERE account_id = ? OR to_account_id = ?', [
        acc.id,
        acc.id,
      ]);
      await db.execute('DELETE FROM accounts WHERE id = ?', [acc.id]);
      await onRefresh();
    } catch (e) {
      console.error('Error deleting account:', e);
      alert('Failed to delete account.');
    }
  };

  const toggleFavorite = async (acc: Account) => {
    try {
      const db = await getDb();
      const newStatus = acc.is_favorite ? 0 : 1;
      await db.execute('UPDATE accounts SET is_favorite = ? WHERE id = ?', [newStatus, acc.id]);
      await onRefresh();
    } catch (e) {
      console.error('Error toggling favorite:', e);
    }
  };

  const total = accounts.reduce((sum, acc) => sum + acc.balance, 0);

  return (
    <div className="w-full space-y-6 sm:space-y-8 pb-6">
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-slate-800">Account Management</h1>
            {proStatus ? (
              <span className="bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shadow-2xs">
                PRO • Unlimited
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onTriggerUpgrade && onTriggerUpgrade('accounts_limit')}
                className={`text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border transition-all cursor-pointer ${
                  accounts.length >= 2
                    ? 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200'
                    : 'bg-slate-100 text-slate-600 border-slate-200'
                }`}
                title="Free edition is limited to 2 accounts. Click to unlock Unlimited."
              >
                Free Tier: {accounts.length}/2 Accounts {accounts.length >= 2 ? '(Limit Reached)' : ''}
              </button>
            )}
          </div>
          <p className="text-slate-500">Configure bank accounts, credit cards, and cash balances</p>
        </div>

        {/* Add Account Form */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-white p-3 sm:p-2 rounded-2xl border border-slate-200 shadow-sm w-full lg:w-auto">
          <input
            type="text"
            placeholder="Account Name (e.g. Chase)"
            className="w-full sm:w-auto px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            value={newAccName}
            onChange={(e) => setNewAccName(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <select
              className="flex-1 sm:w-auto px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white font-medium"
              value={newAccType}
              onChange={(e) => setNewAccType(e.target.value)}
            >
              <option value="Checking">Checking</option>
              <option value="Savings">Savings</option>
              <option value="Credit Card">Credit Card</option>
              <option value="Cash">Cash</option>
              <option value="Investment">Investment</option>
              <option value="Loan">Loan</option>
            </select>
            <input
              type="number"
              step="0.01"
              placeholder={`Balance (${currency.symbol.trim()})`}
              className="w-28 sm:w-28 px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-semibold"
              value={newAccBalance}
              onChange={(e) => setNewAccBalance(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addAccount()}
            />
          </div>
          {!proStatus && accounts.length >= 2 ? (
            <button
              type="button"
              onClick={() => onTriggerUpgrade && onTriggerUpgrade('accounts_limit')}
              className="w-full sm:w-auto bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 shadow-md cursor-pointer transition-all"
            >
              <Crown size={16} />
              <span>Unlock Unlimited</span>
            </button>
          ) : (
            <button
              onClick={addAccount}
              className="w-full sm:w-auto bg-blue-600 text-white px-4 py-2 rounded-xl hover:bg-blue-700 transition-colors font-semibold flex items-center justify-center gap-1.5 text-sm shadow-sm cursor-pointer"
            >
              <PlusCircle size={16} />
              <span>Add Account</span>
            </button>
          )}
        </div>
      </header>

      {/* Edit Account Modal */}
      {editingAcc && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 backdrop-blur-xs p-3">
          <div className="bg-white rounded-2xl p-5 sm:p-6 w-full max-w-md shadow-xl animate-in zoom-in-95 duration-150 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-bold text-lg text-slate-800">Edit Account</h3>
              <button
                onClick={() => setEditingAcc(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Account Name</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Account Type</label>
                <select
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  value={editType}
                  onChange={(e) => setEditType(e.target.value)}
                >
                  <option value="Checking">Checking</option>
                  <option value="Savings">Savings</option>
                  <option value="Credit Card">Credit Card</option>
                  <option value="Cash">Cash</option>
                  <option value="Investment">Investment</option>
                  <option value="Loan">Loan</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Current Balance ({currency.symbol.trim()})</label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-semibold"
                  value={editBalance}
                  onChange={(e) => setEditBalance(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setEditingAcc(null)}
                className="px-4 py-2 text-slate-500 hover:text-slate-700 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors shadow-sm"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Accounts Card List (< md) */}
      <div className="md:hidden space-y-2.5">
        {accounts.length === 0 ? (
          <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-slate-400 text-sm italic">
            No accounts yet. Use the form above to add your first account!
          </div>
        ) : (
          accounts.map((acc) => (
            <div
              key={acc.id}
              className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={() => toggleFavorite(acc)}
                  title={acc.is_favorite ? 'Unfavorite' : 'Favorite'}
                  className="text-slate-300 hover:text-amber-400 transition-colors shrink-0 p-1"
                >
                  <Star
                    size={18}
                    className={acc.is_favorite ? 'text-amber-400 fill-amber-400' : ''}
                  />
                </button>
                <div
                  onClick={() => onOpenDetail && onOpenDetail(acc)}
                  className="min-w-0 cursor-pointer"
                >
                  <p className="font-bold text-slate-900 text-sm truncate flex items-center gap-1">
                    <span>{acc.name}</span>
                    <TrendingUp size={12} className="text-blue-500 shrink-0" />
                  </p>
                  <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600">
                    {acc.type || 'Checking'}
                  </span>
                </div>
              </div>
              <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
                <span
                  onClick={() => onOpenDetail && onOpenDetail(acc)}
                  className={`font-bold tabular-nums text-base cursor-pointer ${
                    acc.balance < 0 ? 'text-red-500' : 'text-slate-900'
                  }`}
                >
                  {formatCurrency(acc.balance)}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleStartEdit(acc)}
                    className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Edit Account"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={() => handleDeleteAccount(acc)}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete Account"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop Accounts Table (hidden on mobile, visible on md+) */}
      <div className="hidden md:block flex-1 min-h-0 bg-white rounded-3xl shadow-sm border border-slate-200 overflow-auto">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider shadow-xs">
            <tr className="divide-x divide-slate-200">
              <th className="px-6 py-4 font-semibold w-12 text-center">Fav</th>
              <th className="px-6 py-4 font-semibold">Account Name</th>
              <th className="px-6 py-4 font-semibold">Type</th>
              <th className="px-6 py-4 font-semibold text-right">Balance</th>
              <th className="px-6 py-4 font-semibold text-center w-28">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {accounts.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">
                  No accounts yet. Use the form above to add your first account!
                </td>
              </tr>
            ) : (
              accounts.map((acc) => (
                <tr key={acc.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 text-center">
                    <button
                      onClick={() => toggleFavorite(acc)}
                      title={acc.is_favorite ? 'Unfavorite' : 'Favorite'}
                      className="text-slate-300 hover:text-amber-400 transition-colors"
                    >
                      <Star
                        size={16}
                        className={acc.is_favorite ? 'text-amber-400 fill-amber-400' : ''}
                      />
                    </button>
                  </td>
                  <td
                    onClick={() => onOpenDetail && onOpenDetail(acc)}
                    className="px-6 py-4 font-semibold text-slate-800 hover:text-blue-600 transition-colors cursor-pointer"
                    title="Click to view running balance history & analytics"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{acc.name}</span>
                      <TrendingUp size={13} className="text-blue-500 opacity-60 hover:opacity-100" />
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                      {acc.type || 'Checking'}
                    </span>
                  </td>
                  <td
                    className={`px-6 py-4 text-right font-bold tabular-nums text-base ${
                      acc.balance < 0 ? 'text-red-500' : 'text-slate-900'
                    }`}
                  >
                    {formatCurrency(acc.balance)}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => onOpenDetail && onOpenDetail(acc)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors cursor-pointer"
                        title="View Running Balance & Analytics"
                      >
                        <TrendingUp size={16} />
                      </button>
                      <button
                        onClick={() => handleStartEdit(acc)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-slate-100 transition-colors"
                        title="Edit Account"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteAccount(acc)}
                        className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                        title="Delete Account"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot className="sticky bottom-0 z-10 bg-slate-50 border-t border-slate-200 shadow-xs">
            <tr className="divide-x divide-slate-200">
              <td colSpan={3} className="px-6 py-4 font-bold text-slate-700 text-right">
                Total Net Worth:
              </td>
              <td className="px-6 py-4 text-right font-black text-slate-900 text-lg tabular-nums">
                {formatCurrency(total)}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default App;
