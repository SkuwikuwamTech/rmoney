import React, { useState } from 'react';
import {
  Sparkles,
  ArrowRight,
  Download,
  X,
  AlertCircle,
  RotateCw,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { AppUpdateInfo, installAppUpdate } from '../utils/updater';

interface UpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  updateInfo: AppUpdateInfo | null;
  onSuccess?: () => void;
}

export const UpdateModal: React.FC<UpdateModalProps> = ({
  isOpen,
  onClose,
  updateInfo,
  onSuccess,
}) => {
  const [isInstalling, setIsInstalling] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [downloadedMB, setDownloadedMB] = useState<number>(0);
  const [totalMB, setTotalMB] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !updateInfo) return null;

  const handleStartUpdate = async () => {
    // If it's a direct release link from GitHub fallback, open download URL
    if (!updateInfo.rawUpdate && updateInfo.downloadUrl) {
      try {
        const { openUrl } = await import('@tauri-apps/plugin-opener');
        await openUrl(updateInfo.downloadUrl);
      } catch {
        window.open(updateInfo.downloadUrl, '_blank');
      }
      onClose();
      return;
    }

    setIsInstalling(true);
    setErrorMsg(null);

    // If it's a mock test update, simulate progress
    if (!updateInfo.rawUpdate) {
      let current = 0;
      const interval = setInterval(() => {
        current += 15;
        if (current >= 100) {
          clearInterval(interval);
          setProgressPct(100);
          setDownloadedMB(24.5);
          setTotalMB(24.5);
          setTimeout(() => {
            setIsInstalling(false);
            if (onSuccess) onSuccess();
            alert('Simulation complete! In production, rMoney will download signed binaries, apply the patch, and relaunch automatically.');
            onClose();
          }, 1200);
        } else {
          setProgressPct(current);
          setDownloadedMB(Number(((current / 100) * 24.5).toFixed(1)));
          setTotalMB(24.5);
        }
      }, 300);
      return;
    }

    try {
      await installAppUpdate(
        updateInfo.rawUpdate,
        (pct, downloadedBytes, totalBytes) => {
          setProgressPct(pct);
          setDownloadedMB(Number((downloadedBytes / (1024 * 1024)).toFixed(1)));
          if (totalBytes) {
            setTotalMB(Number((totalBytes / (1024 * 1024)).toFixed(1)));
          }
        }
      );
      if (onSuccess) onSuccess();
    } catch (e: any) {
      console.error('Update failed:', e);
      setErrorMsg(e?.message || 'Failed to download and install update. Please check your internet connection.');
      setIsInstalling(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl relative overflow-hidden flex flex-col animate-in zoom-in-95 duration-150 border border-slate-200">
        {/* Top Gradient Banner */}
        <div className="h-2 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 w-full" />

        {/* Modal Header */}
        <div className="p-5 sm:p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <Sparkles size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-slate-900 tracking-tight">Software Update Available</h2>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  New Release
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                A new version of rMoney is ready to install
              </p>
            </div>
          </div>

          {!isInstalling && (
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-5 sm:p-6 space-y-4">
          {/* Version Comparison Box */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Current Version</span>
              <span className="text-sm font-bold text-slate-700 font-mono">v{updateInfo.currentVersion}</span>
            </div>

            <div className="flex items-center gap-2 text-blue-600">
              <span className="text-xs font-semibold">Upgrading to</span>
              <ArrowRight size={15} />
            </div>

            <div className="text-right">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 block">Latest Release</span>
              <span className="text-sm font-black text-emerald-700 font-mono">v{updateInfo.version}</span>
            </div>
          </div>

          {/* Release Notes */}
          <div className="space-y-1.5">
            <span className="text-xs font-bold text-slate-700">What’s New in this Release:</span>
            <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3 text-xs text-slate-600 max-h-44 overflow-y-auto whitespace-pre-line leading-relaxed font-sans">
              {updateInfo.body}
            </div>
          </div>

          {/* Progress / Status */}
          {isInstalling && (
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-blue-700 flex items-center gap-1.5">
                  <RotateCw size={14} className="animate-spin" />
                  {progressPct >= 100 ? 'Installing & restarting...' : 'Downloading update package...'}
                </span>
                <span className="font-mono font-bold text-slate-600">
                  {progressPct}% {totalMB ? `(${downloadedMB} / ${totalMB} MB)` : ''}
                </span>
              </div>

              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-600 to-indigo-600 transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs text-red-700 font-medium">
              <AlertCircle size={16} className="shrink-0 text-red-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="flex items-center gap-2 text-[11px] text-slate-400 pt-1">
            <ShieldCheck size={14} className="text-emerald-500 shrink-0" />
            <span>Cryptographically signed package • Seamless in-place replacement</span>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <button
            type="button"
            disabled={isInstalling}
            onClick={onClose}
            className="text-xs font-bold text-slate-500 hover:text-slate-800 px-3 py-2 rounded-xl transition-colors disabled:opacity-40 cursor-pointer"
          >
            Remind Me Later
          </button>

          <button
            type="button"
            disabled={isInstalling}
            onClick={handleStartUpdate}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold rounded-xl text-xs transition-all shadow-md flex items-center gap-2 cursor-pointer"
          >
            {isInstalling ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                <span>Applying Update...</span>
              </>
            ) : (
              <>
                <Download size={14} />
                <span>Download & Install Now</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UpdateModal;
