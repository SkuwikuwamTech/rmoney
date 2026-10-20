import React, { useState } from 'react';
import {
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Globe,
  Wallet,
  FileSpreadsheet,
  PlusCircle,
  X,
  ChevronLeft,
  Calendar,
  Check,
  Building,
  HelpCircle,
} from 'lucide-react';
import {
  useRegionalSettings,
  SUPPORTED_CURRENCIES,
  SUPPORTED_DATE_FORMATS,
  DateFormatOption,
  formatDate as formatWithDatePattern,
  formatCurrency as formatWithCurrencyConfig,
} from '../utils/currency';
import { seedDemoData, resetToCleanSlate } from '../utils/demoData';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (action?: 'demo' | 'clean' | 'import') => Promise<void> | void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  onClose,
  onComplete,
}) => {
  const { currency, dateFormat, setCurrency, setDateFormat } =
    useRegionalSettings();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedCurrency, setSelectedCurrency] = useState<string>(currency.code);
  const [selectedDateFormat, setSelectedDateFormat] = useState<DateFormatOption>(dateFormat);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  // Step 3 (Start Fresh) State
  const [accountName, setAccountName] = useState('Primary Checking');
  const [accountType, setAccountType] = useState('Checking');
  const [openingBalance, setOpeningBalance] = useState('');

  if (!isOpen) return null;

  const handleSaveRegional = () => {
    setCurrency(selectedCurrency);
    setDateFormat(selectedDateFormat);
    setStep(2);
  };

  const finishOnboarding = async (action: 'demo' | 'clean' | 'import') => {
    localStorage.setItem('rmoney_onboarding_completed', 'true');
    await onComplete(action);
    onClose();
  };

  const handleSelectDemoData = async () => {
    setLoadingAction('demo');
    try {
      await seedDemoData(true);
      await finishOnboarding('demo');
    } catch (e) {
      console.error('Failed to seed demo data:', e);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleSelectCleanSlate = () => {
    setStep(3);
  };

  const handleSelectImport = async () => {
    setLoadingAction('import');
    try {
      await resetToCleanSlate();
      await finishOnboarding('import');
    } catch (e) {
      console.error('Failed to prepare clean database for import:', e);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleCreateAccountAndFinish = async () => {
    setLoadingAction('create_account');
    try {
      const balanceNum = parseFloat(openingBalance) || 0;
      await resetToCleanSlate({
        name: accountName.trim() || 'Primary Checking',
        type: accountType,
        balance: balanceNum,
        currency: selectedCurrency,
      });
      await finishOnboarding('clean');
    } catch (e) {
      console.error('Failed to create initial account:', e);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleSkipAccountSetup = async () => {
    setLoadingAction('skip_account');
    try {
      await resetToCleanSlate();
      await finishOnboarding('clean');
    } catch (e) {
      console.error('Failed to prepare clean slate:', e);
    } finally {
      setLoadingAction(null);
    }
  };

  // Preview formatted values using temporary selections
  const previewAmountFormatted = (() => {
    const currObj = SUPPORTED_CURRENCIES.find((c) => c.code === selectedCurrency);
    return formatWithCurrencyConfig(1250, { currency: currObj });
  })();

  const previewDateFormatted = formatWithDatePattern('2026-10-19', selectedDateFormat);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl relative overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-150">
        {/* Top Gradient Banner */}
        <div className="h-2.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-500 w-full shrink-0" />

        {/* Modal Header */}
        <div className="p-6 sm:p-7 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-700 via-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/25 ring-1 ring-white/20 shrink-0">
              <span className="font-brand font-bold italic text-3xl select-none leading-none pr-0.5 pb-0.5">r</span>
              <span className="text-emerald-300 font-brand font-bold italic text-sm absolute -bottom-1 -right-1 bg-slate-900 rounded-full px-1.5 ring-1 ring-slate-800 leading-tight">
                $
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-slate-900 tracking-tight">Welcome to rMoney</h2>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                  Getting Started
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Private, offline-first personal financial management & forecasting
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-2 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
            title="Dismiss Welcome Wizard"
          >
            <X size={20} />
          </button>
        </div>

        {/* Step Indicator */}
        <div className="px-6 py-3 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between text-xs font-semibold text-slate-600 shrink-0">
          <div className="flex items-center gap-2">
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                step === 1
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              {step > 1 ? <Check size={14} /> : '1'}
            </span>
            <span className={step === 1 ? 'text-blue-700 font-bold' : ''}>Regional Preferences</span>
          </div>
          <span className="text-slate-300">───</span>
          <div className="flex items-center gap-2">
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                step === 2
                  ? 'bg-blue-600 text-white shadow-xs'
                  : step > 2
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-slate-200 text-slate-500'
              }`}
            >
              {step > 2 ? <Check size={14} /> : '2'}
            </span>
            <span className={step === 2 ? 'text-blue-700 font-bold' : ''}>Starting Path</span>
          </div>
          <span className="text-slate-300">───</span>
          <div className="flex items-center gap-2">
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                step === 3 ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-200 text-slate-500'
              }`}
            >
              3
            </span>
            <span className={step === 3 ? 'text-blue-700 font-bold' : ''}>Account Setup</span>
          </div>
        </div>

        {/* Step Content */}
        <div className="p-6 sm:p-8 overflow-y-auto space-y-6 flex-1">
          {/* STEP 1: REGIONAL PREFERENCES */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <Globe size={18} className="text-blue-600" />
                  Select Currency & Date Format
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Choose your native currency and local date formatting. You can adjust this anytime in Settings.
                </p>
              </div>

              {/* Live Preview Callout */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-blue-700">Live Formatting Preview</p>
                  <p className="text-sm font-semibold text-slate-700 mt-0.5">
                    Amounts & statements will display as:
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-base font-black text-slate-900 block tabular-nums">
                    {previewAmountFormatted}
                  </span>
                  <span className="text-xs font-semibold text-slate-500 block">
                    {previewDateFormatted}
                  </span>
                </div>
              </div>

              {/* Currency Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Wallet size={14} className="text-slate-400" />
                  Primary Currency
                </label>
                <select
                  value={selectedCurrency}
                  onChange={(e) => setSelectedCurrency(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-3.5 py-2.5 text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all cursor-pointer"
                >
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} ({c.symbol.trim()}) — {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date Format Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Calendar size={14} className="text-slate-400" />
                  Date Format
                </label>
                <select
                  value={selectedDateFormat}
                  onChange={(e) => setSelectedDateFormat(e.target.value as DateFormatOption)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-3.5 py-2.5 text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all cursor-pointer"
                >
                  {SUPPORTED_DATE_FORMATS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label} (e.g. {f.sample})
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveRegional}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md flex items-center gap-2 cursor-pointer transition-all"
                >
                  <span>Continue to Starting Path</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: CHOOSE STARTING PATH */}
          {step === 2 && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-800">How would you like to start?</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Pick the starting setup that best fits your immediate goal.
                  </p>
                </div>
                <button
                  onClick={() => setStep(1)}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer"
                >
                  <ChevronLeft size={14} /> Back
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3.5">
                {/* Option A: Demo Data */}
                <div
                  onClick={handleSelectDemoData}
                  className="p-5 rounded-2xl border-2 border-blue-500/80 bg-blue-50/40 hover:bg-blue-50 hover:border-blue-600 transition-all cursor-pointer relative group flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-3.5">
                    <div className="p-3 bg-blue-600 text-white rounded-2xl shadow-sm group-hover:scale-105 transition-transform shrink-0">
                      <Sparkles size={22} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-slate-900 text-base">Explore with Sample Data</h4>
                        <span className="bg-blue-600 text-white text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shadow-2xs">
                          Recommended
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                        Preloads realistic accounts (Checking, Savings, Credit Card), 30+ categorized transactions, recurring bills, and budget targets so you can immediately test reports and forecasting.
                      </p>
                    </div>
                  </div>
                  <button
                    disabled={loadingAction !== null}
                    className="shrink-0 w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors shadow-xs flex items-center justify-center gap-1.5"
                  >
                    {loadingAction === 'demo' ? 'Loading...' : 'Test Drive Demo'}
                    <ArrowRight size={14} />
                  </button>
                </div>

                {/* Option B: Clean Slate */}
                <div
                  onClick={handleSelectCleanSlate}
                  className="p-5 rounded-2xl border border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50/60 transition-all cursor-pointer relative group flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-3.5">
                    <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-100 group-hover:scale-105 transition-transform shrink-0">
                      <PlusCircle size={22} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-slate-900 text-base">Start Fresh (Clean Slate)</h4>
                        <span className="bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full">
                          Blank Slate
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                        Prepares standard category budgets with zero sample transactions, and walks you through setting up your first checking or savings account.
                      </p>
                    </div>
                  </div>
                  <button
                    disabled={loadingAction !== null}
                    className="shrink-0 w-full sm:w-auto px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors shadow-xs flex items-center justify-center gap-1.5"
                  >
                    Setup My Account
                    <ArrowRight size={14} />
                  </button>
                </div>

                {/* Option C: Import Statements */}
                <div
                  onClick={handleSelectImport}
                  className="p-5 rounded-2xl border border-slate-200 bg-white hover:border-purple-300 hover:bg-purple-50/30 transition-all cursor-pointer relative group flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-3.5">
                    <div className="p-3 bg-purple-50 text-purple-600 rounded-2xl border border-purple-100 group-hover:scale-105 transition-transform shrink-0">
                      <FileSpreadsheet size={22} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-slate-900 text-base">Migrate / Import Statements</h4>
                        <span className="bg-purple-100 text-purple-700 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full">
                          CSV & QIF
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                        Migrating from Microsoft Money, Quicken, or banking downloads? Jump straight to the statement import utility with clean tables ready.
                      </p>
                    </div>
                  </div>
                  <button
                    disabled={loadingAction !== null}
                    className="shrink-0 w-full sm:w-auto px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl transition-colors shadow-xs flex items-center justify-center gap-1.5"
                  >
                    {loadingAction === 'import' ? 'Preparing...' : 'Import Data'}
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: CREATE FIRST ACCOUNT (START FRESH) */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <Building size={18} className="text-emerald-600" />
                    Create Your First Account
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Give your primary account a name and starting balance to kickstart your ledger.
                  </p>
                </div>
                <button
                  onClick={() => setStep(2)}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer"
                >
                  <ChevronLeft size={14} /> Back
                </button>
              </div>

              {/* Quick Presets */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Quick Name Presets</span>
                <div className="flex flex-wrap gap-2">
                  {['Primary Checking', 'Everyday Savings', 'Credit Card', 'Cash Wallet', 'Emergency Fund'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setAccountName(preset);
                        if (preset.includes('Savings') || preset.includes('Emergency')) setAccountType('Savings');
                        else if (preset.includes('Credit')) setAccountType('Credit Card');
                        else if (preset.includes('Cash')) setAccountType('Cash');
                        else setAccountType('Checking');
                      }}
                      className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors cursor-pointer ${
                        accountName === preset
                          ? 'bg-blue-50 border-blue-300 text-blue-700 font-bold'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Form Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Account Name</label>
                  <input
                    type="text"
                    required
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    placeholder="e.g. Chase Total Checking"
                    className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-3.5 py-2.5 text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Account Type</label>
                  <select
                    value={accountType}
                    onChange={(e) => setAccountType(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-3.5 py-2.5 text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all cursor-pointer"
                  >
                    <option value="Checking">Checking</option>
                    <option value="Savings">Savings</option>
                    <option value="Credit Card">Credit Card</option>
                    <option value="Investment">Investment</option>
                    <option value="Cash">Cash / Wallet</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Starting Balance</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      value={openingBalance}
                      onChange={(e) => setOpeningBalance(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-3.5 py-2.5 text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all tabular-nums"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Will be recorded as your initial starting balance.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">Currency</label>
                  <input
                    type="text"
                    disabled
                    value={`${selectedCurrency} (${previewAmountFormatted})`}
                    className="w-full bg-slate-100 border border-slate-200 text-slate-500 rounded-xl px-3.5 py-2.5 text-sm font-medium cursor-not-allowed"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleSkipAccountSetup}
                  disabled={loadingAction !== null}
                  className="text-xs font-bold text-slate-400 hover:text-slate-600 px-3 py-2 rounded-lg cursor-pointer transition-colors"
                >
                  Skip for now (I'll add accounts later)
                </button>

                <button
                  type="button"
                  onClick={handleCreateAccountAndFinish}
                  disabled={loadingAction !== null || !accountName.trim()}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold rounded-xl shadow-md flex items-center gap-2 cursor-pointer transition-all"
                >
                  {loadingAction === 'create_account' ? 'Creating Account...' : 'Finish & Open rMoney'}
                  <CheckCircle2 size={16} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <div className="flex items-center gap-1.5">
            <HelpCircle size={14} className="text-slate-400" />
            <span>You can re-run this setup anytime from <strong>Settings</strong>.</span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 font-semibold cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default OnboardingModal;
