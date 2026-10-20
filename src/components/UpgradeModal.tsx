import { useState } from 'react';
import {
  X,
  Sparkles,
  Check,
  Shield,
  Key,
  ExternalLink,
  Crown,
  AlertCircle,
  Wallet,
  TrendingUp,
  Paperclip,
} from 'lucide-react';
import { activateLicense, openCheckoutPage } from '../utils/license';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  reason?: 'accounts_limit' | 'what_if_locked' | 'reports_locked' | 'general' | 'receipts_locked';
  onSuccess?: () => void;
}

const UpgradeModal = ({
  isOpen,
  onClose,
  reason = 'general',
  onSuccess,
}: UpgradeModalProps) => {
  const [licenseKeyInput, setLicenseKeyInput] = useState('');
  const [isActivating, setIsActivating] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [showKeyField, setShowKeyField] = useState(false);

  if (!isOpen) return null;

  const handleActivate = async () => {
    setIsActivating(true);
    setStatusMsg(null);
    try {
      const res = await activateLicense(licenseKeyInput);
      if (res.success) {
        setStatusMsg({ text: res.message, type: 'success' });
        setTimeout(() => {
          if (onSuccess) onSuccess();
          onClose();
        }, 1200);
      } else {
        setStatusMsg({ text: res.message, type: 'error' });
      }
    } finally {
      setIsActivating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 sm:p-5 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto">
      <div className="bg-white rounded-3xl p-5 sm:p-8 w-full max-w-xl max-h-[92vh] flex flex-col shadow-2xl space-y-5 animate-in zoom-in-95 duration-150 relative overflow-hidden">
        {/* Ambient Top Glow */}
        <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition-colors z-10"
        >
          <X size={20} />
        </button>

        {/* Scrollable Body */}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-5 pr-1">
          {/* Header */}
          <div className="text-center space-y-2 pt-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/30">
            <Crown size={28} />
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Upgrade to rMoney Pro</h2>
          <p className="text-xs font-semibold text-slate-500 max-w-md mx-auto">
            {reason === 'accounts_limit' && (
              <span className="text-amber-700 font-bold block mb-1 bg-amber-50 py-1 px-3 rounded-lg border border-amber-200">
                You've reached the 2-account limit of the Free edition.
              </span>
            )}
            {reason === 'what_if_locked' && (
              <span className="text-amber-700 font-bold block mb-1 bg-amber-50 py-1 px-3 rounded-lg border border-amber-200">
                The What-If Cash Flow Simulator is exclusively available in rMoney Pro.
              </span>
            )}
            {reason === 'reports_locked' && (
              <span className="text-amber-700 font-bold block mb-1 bg-amber-50 py-1 px-3 rounded-lg border border-amber-200">
                Advanced Financial Reports (Budget Variance, Net Worth, P&L, and PDF Export) are exclusively available in rMoney Pro.
              </span>
            )}
            {reason === 'receipts_locked' && (
              <span className="text-amber-700 font-bold block mb-1 bg-amber-50 py-1 px-3 rounded-lg border border-amber-200">
                Receipt & Document Attachment has reached the Free edition limit (3 attachments). Upgrade to Pro for unlimited attachments.
              </span>
            )}
            Unlock unlimited accounts, advanced financial simulation, and full offline power.
          </p>
        </div>

        {/* Features Comparison */}
        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 divide-y divide-slate-200/60 text-xs">
          <div className="flex items-center justify-between pb-2.5">
            <span className="font-semibold text-slate-700 flex items-center gap-2">
              <Wallet size={15} className="text-blue-500" />
              Connected Accounts
            </span>
            <div className="flex items-center gap-4">
              <span className="text-slate-400 font-medium">Free: 2 max</span>
              <span className="text-emerald-700 font-bold bg-emerald-100 px-2 py-0.5 rounded-full">
                Pro: Unlimited
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between py-2.5">
            <span className="font-semibold text-slate-700 flex items-center gap-2">
              <Paperclip size={15} className="text-emerald-600" />
              Receipt & PDF Attachments
            </span>
            <div className="flex items-center gap-4">
              <span className="text-slate-400 font-medium">Free: 3 sample receipts</span>
              <span className="text-emerald-700 font-bold bg-emerald-100 px-2 py-0.5 rounded-full">
                Pro: Unlimited
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between py-2.5">
            <span className="font-semibold text-slate-700 flex items-center gap-2">
              <TrendingUp size={15} className="text-amber-500" />
              What-If Cash Flow Simulator
            </span>
            <div className="flex items-center gap-4">
              <span className="text-slate-400 font-medium">Free: ❌ Locked</span>
              <span className="text-emerald-700 font-bold bg-emerald-100 px-2 py-0.5 rounded-full">
                Pro: Included
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between py-2.5">
            <span className="font-semibold text-slate-700 flex items-center gap-2">
              <Sparkles size={15} className="text-purple-500" />
              Advanced Reports & PDF Export
            </span>
            <div className="flex items-center gap-4">
              <span className="text-slate-400 font-medium">Free: Basic</span>
              <span className="text-emerald-700 font-bold bg-emerald-100 px-2 py-0.5 rounded-full">
                Pro: Full Suite
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between py-2.5">
            <span className="font-semibold text-slate-700 flex items-center gap-2">
              <Shield size={15} className="text-indigo-500" />
              License Model
            </span>
            <span className="text-slate-700 font-bold">100% Offline • Lifetime Purchase</span>
          </div>

          <div className="flex items-center justify-between pt-2.5">
            <span className="font-semibold text-slate-700 flex items-center gap-2">
              <Sparkles size={15} className="text-purple-500" />
              No Monthly Subscriptions
            </span>
            <span className="text-slate-700 font-bold">Never Pay Monthly Fees</span>
          </div>
        </div>

        {/* Status Message */}
        {statusMsg && (
          <div
            className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
              statusMsg.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}
          >
            {statusMsg.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
            <span>{statusMsg.text}</span>
          </div>
        )}

        {/* License Key Entry or Buy Buttons */}
        {showKeyField ? (
          <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-600 uppercase flex items-center gap-1.5">
                <Key size={14} className="text-slate-400" />
                Enter Pro License Key
              </label>
              <input
                type="text"
                placeholder="RMONEY-PRO-XXXX-XXXX-XXXX"
                value={licenseKeyInput}
                onChange={(e) => setLicenseKeyInput(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl font-mono text-sm uppercase bg-white outline-none focus:ring-2 focus:ring-amber-500"
                autoFocus
              />
            </div>
            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => setShowKeyField(false)}
                className="text-xs font-semibold text-slate-500 hover:text-slate-700"
              >
                Back to options
              </button>
              <button
                type="button"
                onClick={handleActivate}
                disabled={isActivating}
                className="px-5 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer flex items-center gap-1.5"
              >
                {isActivating ? 'Verifying...' : 'Activate Pro'}
              </button>
            </div>
            <p className="text-[10px] text-slate-400 text-center">
              Enter your lifetime license key to unlock commercial Pro tools.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            <button
              type="button"
              onClick={() => openCheckoutPage()}
              className="w-full py-3 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-600 hover:to-orange-600 text-white rounded-2xl font-bold text-sm shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <span>Get rMoney Pro ($29 Lifetime)</span>
              <ExternalLink size={16} />
            </button>

            <button
              type="button"
              onClick={() => setShowKeyField(true)}
              className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl text-xs font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <Key size={14} />
              <span>Already have a license key? Enter it here</span>
            </button>
          </div>
        )}

        <div className="text-center pt-2">
          <p className="text-[11px] text-slate-400">
            One-time purchase • All future updates included • 100% offline & private
          </p>
        </div>
      </div>
    </div>
  </div>
  );
};

export default UpgradeModal;
