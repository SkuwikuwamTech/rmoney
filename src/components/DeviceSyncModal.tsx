import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import {
  Smartphone,
  Laptop,
  QrCode,
  FolderSync,
  RefreshCw,
  X,
  Copy,
  Check,
  ShieldCheck,
  Wifi,
  Cloud,
  CheckCircle2,
  AlertCircle,
  Download,
  Upload,
  Trash2,
  RotateCcw,
  Sparkles,
  FolderOpen,
} from 'lucide-react';
import {
  getOrCreateDeviceId,
  getOrCreateDeviceName,
  setDeviceName,
  getOrCreatePairingSecret,
  rotatePairingSecret,
  generatePairingPayload,
  getPairedDevices,
  removePairedDevice,
  getCloudSyncSettings,
  saveCloudSyncSettings,
  CloudSyncSettings,
  mergeSyncBundle,
  simulateMobileSync,
  exportSyncFile,
  pickCloudSyncFolder,
  autoPushToCloudFolder,
  autoPullFromCloudFolder,
  getSyncFilePath,
  MergeResult,
} from '../utils/syncEngine';

interface DeviceSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSyncCompleted?: () => Promise<void>;
}

export const DeviceSyncModal: React.FC<DeviceSyncModalProps> = ({
  isOpen,
  onClose,
  onSyncCompleted,
}) => {
  const [activeTab, setActiveTab] = useState<'lan' | 'cloud' | 'devices'>('lan');

  // Device & Pairing State
  const [deviceId] = useState(getOrCreateDeviceId());
  const [deviceNameInput, setDeviceNameInput] = useState(getOrCreateDeviceName());
  const [pairingSecret, setPairingSecret] = useState(getOrCreatePairingSecret());
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [copiedCode, setCopiedCode] = useState(false);

  // Manual Token Merge State
  const [remoteTokenInput, setRemoteTokenInput] = useState('');
  const [isMergingToken, setIsMergingToken] = useState(false);

  // Cloud Sync State
  const [cloudSettings, setCloudSettings] = useState<CloudSyncSettings>(getCloudSyncSettings());
  const [cloudStatusMsg, setCloudStatusMsg] = useState<string | null>(null);

  // Merge / Sync Status
  const [syncResult, setSyncResult] = useState<MergeResult | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Generate QR Code on mount or secret change
  useEffect(() => {
    if (!isOpen) return;

    const payload = generatePairingPayload();
    QRCode.toDataURL(JSON.stringify(payload), {
      width: 220,
      margin: 1,
      color: {
        dark: '#1e293b',
        light: '#ffffff',
      },
    })
      .then((url) => setQrCodeDataUrl(url))
      .catch((err) => console.error('Failed to generate QR code', err));
  }, [isOpen, pairingSecret, deviceNameInput]);

  const handleCopySecret = () => {
    navigator.clipboard.writeText(pairingSecret);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleSaveDeviceName = (e: React.FocusEvent<HTMLInputElement>) => {
    const val = e.target.value.trim();
    if (val) {
      setDeviceName(val);
      setDeviceNameInput(val);
    }
  };

  const handleRotateSecret = () => {
    if (confirm('Rotate pairing secret? Paired mobile devices will need to reconnect.')) {
      const newSecret = rotatePairingSecret();
      setPairingSecret(newSecret);
    }
  };

  // Test Mobile Sync Simulation
  const handleSimulateSync = async () => {
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const result = await simulateMobileSync();
      setSyncResult(result);
      if (result.success && onSyncCompleted) {
        await onSyncCompleted();
      }
    } catch (e: any) {
      setSyncResult({
        success: false,
        addedTransactions: 0,
        updatedTransactions: 0,
        addedAccounts: 0,
        addedCategories: 0,
        addedRules: 0,
        error: e?.message || 'Sync simulation failed.',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Manual Token / Payload Merge
  const handleMergeRemoteToken = async () => {
    if (!remoteTokenInput.trim()) return;
    setIsMergingToken(true);
    setSyncResult(null);

    try {
      const parsed = JSON.parse(remoteTokenInput.trim());
      const result = await mergeSyncBundle(parsed);
      setSyncResult(result);
      setRemoteTokenInput('');
      if (result.success && onSyncCompleted) {
        await onSyncCompleted();
      }
    } catch (e: any) {
      setSyncResult({
        success: false,
        addedTransactions: 0,
        updatedTransactions: 0,
        addedAccounts: 0,
        addedCategories: 0,
        addedRules: 0,
        error: 'Invalid sync payload format. Expected JSON sync bundle.',
      });
    } finally {
      setIsMergingToken(false);
    }
  };

  // File Upload / Merge
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        const result = await mergeSyncBundle(parsed);
        setSyncResult(result);
        if (result.success && onSyncCompleted) {
          await onSyncCompleted();
        }
      } catch (err: any) {
        setSyncResult({
          success: false,
          addedTransactions: 0,
          updatedTransactions: 0,
          addedAccounts: 0,
          addedCategories: 0,
          addedRules: 0,
          error: 'Failed to read sync file: ' + err.message,
        });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Cloud Sync Settings
  const handleSaveCloudSettings = (updates: Partial<CloudSyncSettings>) => {
    const updated = { ...cloudSettings, ...updates };
    setCloudSettings(updated);
    saveCloudSyncSettings(updated);
    setCloudStatusMsg('Cloud sync preferences saved.');
    setTimeout(() => setCloudStatusMsg(null), 3000);
  };

  const handleBrowseFolder = async () => {
    try {
      const selected = await pickCloudSyncFolder();
      if (selected) {
        const updated: CloudSyncSettings = {
          ...cloudSettings,
          folderPath: selected,
          enabled: true,
        };
        setCloudSettings(updated);
        saveCloudSyncSettings(updated);

        setIsSyncing(true);
        const ok = await autoPushToCloudFolder();
        if (ok) {
          setCloudStatusMsg(`Cloud folder connected! Automatically watching: ${selected}`);
          if (onSyncCompleted) await onSyncCompleted();
        } else {
          setCloudStatusMsg(`Selected folder: ${selected}`);
        }
      }
    } catch (e: any) {
      setCloudStatusMsg('Folder selection error: ' + e.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleManualCloudSync = async () => {
    if (!cloudSettings.folderPath) {
      setCloudStatusMsg('Please select a cloud sync folder first.');
      return;
    }
    setIsSyncing(true);
    setCloudStatusMsg(null);
    try {
      const pullResult = await autoPullFromCloudFolder();
      const pushOk = await autoPushToCloudFolder();

      if (pullResult && pullResult.addedTransactions > 0) {
        setSyncResult(pullResult);
        if (onSyncCompleted) await onSyncCompleted();
      } else if (pushOk) {
        setCloudStatusMsg('Sync check complete: Up to date with cloud folder.');
      }
    } catch (e: any) {
      setCloudStatusMsg('Sync error: ' + e.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCloudSyncNow = async () => {
    setIsSyncing(true);
    try {
      await exportSyncFile();
      const updated = { ...cloudSettings, lastSyncedAt: new Date().toISOString() };
      setCloudSettings(updated);
      saveCloudSyncSettings(updated);
      setCloudStatusMsg('Sync snapshot generated successfully.');
    } catch (e: any) {
      setCloudStatusMsg('Cloud sync error: ' + e.message);
    } finally {
      setIsSyncing(false);
    }
  };

  if (!isOpen) return null;

  const pairedDevices = getPairedDevices();

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-600 text-white rounded-2xl shadow-sm">
              <FolderSync size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-800">Device Synchronization</h2>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200">
                  Hybrid Sync
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Direct Local Wi-Fi Pairing + Encrypted Cloud Folder Sync
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center border-b border-slate-200 px-6 pt-3 bg-white gap-2">
          <button
            onClick={() => setActiveTab('lan')}
            className={`pb-3 px-3 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'lan'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <QrCode size={15} />
            Wi-Fi Direct & QR Pairing
          </button>
          <button
            onClick={() => setActiveTab('cloud')}
            className={`pb-3 px-3 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'cloud'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Cloud size={15} />
            Cloud Folder Sync
          </button>
          <button
            onClick={() => setActiveTab('devices')}
            className={`pb-3 px-3 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'devices'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Smartphone size={15} />
            Paired Devices ({pairedDevices.length})
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Result Banner */}
          {syncResult && (
            <div
              className={`p-4 rounded-2xl border text-xs flex items-start gap-3 animate-in fade-in duration-150 ${
                syncResult.success
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              {syncResult.success ? (
                <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle size={18} className="text-rose-600 shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <p className="font-bold">
                  {syncResult.success ? 'Synchronization Successful!' : 'Sync Failed'}
                </p>
                {syncResult.success ? (
                  <p className="mt-0.5 text-emerald-700">
                    Merged {syncResult.addedTransactions} new transaction{syncResult.addedTransactions === 1 ? '' : 's'}, updated {syncResult.updatedTransactions} status change{syncResult.updatedTransactions === 1 ? '' : 's'}, and reconciled balances.
                  </p>
                ) : (
                  <p className="mt-0.5 text-rose-700">{syncResult.error}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSyncResult(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {activeTab === 'lan' && (
            <div className="space-y-6">
              {/* Device Identity Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    This Device Name
                  </label>
                  <input
                    type="text"
                    value={deviceNameInput}
                    onChange={(e) => setDeviceNameInput(e.target.value)}
                    onBlur={handleSaveDeviceName}
                    className="w-full text-xs font-semibold px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    Device Identifier
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={deviceId}
                    className="w-full text-xs font-mono text-slate-500 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                  />
                </div>
              </div>

              {/* QR Code & Pairing Code Box */}
              <div className="bg-slate-50/80 border border-slate-200 rounded-2xl p-6 flex flex-col sm:flex-row items-center gap-6">
                <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs shrink-0">
                  {qrCodeDataUrl ? (
                    <img
                      src={qrCodeDataUrl}
                      alt="Pairing QR Code"
                      className="w-40 h-40 object-contain rounded-lg"
                    />
                  ) : (
                    <div className="w-40 h-40 flex items-center justify-center text-slate-300">
                      Generating QR...
                    </div>
                  )}
                </div>

                <div className="space-y-3 flex-1 text-center sm:text-left">
                  <div className="flex items-center justify-center sm:justify-start gap-1.5 text-xs font-bold text-slate-600 uppercase tracking-wider">
                    <Wifi size={14} className="text-blue-500" />
                    Local Wi-Fi Pairing
                  </div>
                  <h3 className="text-base font-bold text-slate-800">
                    Scan with Mobile App
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Connect both devices to the same local Wi-Fi. In the rMoney mobile app, tap <strong>Scan QR Code</strong> to establish an encrypted, peer-to-peer sync connection.
                  </p>

                  <div className="pt-1">
                    <span className="text-[11px] font-bold text-slate-400 block mb-1">
                      Manual Pairing Code
                    </span>
                    <div className="inline-flex items-center gap-2 bg-white px-3 py-1.5 border border-slate-200 rounded-xl shadow-2xs">
                      <span className="font-mono font-bold text-xs text-slate-800 tracking-wider">
                        {pairingSecret}
                      </span>
                      <button
                        type="button"
                        onClick={handleCopySecret}
                        className="text-slate-400 hover:text-blue-600 transition-colors p-1"
                        title="Copy Pairing Code"
                      >
                        {copiedCode ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Simulator & Manual Token Accordion */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Sparkles size={14} className="text-amber-500" />
                      Test Mobile Sync Simulator
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Simulate receiving transactions from an iPhone over local Wi-Fi to verify two-way balance merging.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSimulateSync}
                    disabled={isSyncing}
                    className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 disabled:opacity-50"
                  >
                    <RefreshCw size={13} className={isSyncing ? 'animate-spin' : ''} />
                    {isSyncing ? 'Syncing...' : 'Simulate Mobile Sync'}
                  </button>
                </div>

                <div className="border-t border-slate-100 pt-3">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    Or Paste Remote Sync Bundle JSON
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder='Paste {"protocol":"rmoney-sync-v1",...}'
                      value={remoteTokenInput}
                      onChange={(e) => setRemoteTokenInput(e.target.value)}
                      className="flex-1 text-xs px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={handleMergeRemoteToken}
                      disabled={isMergingToken || !remoteTokenInput.trim()}
                      className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer disabled:opacity-40"
                    >
                      {isMergingToken ? 'Merging...' : 'Merge'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'cloud' && (
            <div className="space-y-6">
              <div className="p-4 bg-emerald-50/70 border border-emerald-200/80 rounded-2xl flex items-start gap-3">
                <Cloud size={18} className="text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs text-emerald-950 leading-relaxed">
                  <strong className="font-bold">Automated Zero-Click Cloud Sync:</strong> Connect your Dropbox, iCloud Drive, Google Drive, OneDrive, or Nextcloud folder once. rMoney continuously writes database updates to that folder in the background and automatically pulls changes made on mobile or other devices. <strong>No manual importing or exporting required.</strong>
                </div>
              </div>

              {cloudStatusMsg && (
                <div className="p-3 bg-slate-100 text-slate-700 text-xs rounded-xl border border-slate-200 animate-in fade-in">
                  {cloudStatusMsg}
                </div>
              )}

              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-slate-800">Automated Background Sync</h4>
                      {cloudSettings.enabled && cloudSettings.folderPath && (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                          Live Watching
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Automatically push ledger changes and pull updates from mobile devices every few seconds.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={cloudSettings.enabled}
                    onChange={(e) => handleSaveCloudSettings({ enabled: e.target.checked })}
                    className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                  />
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                      Cloud Storage Provider
                    </label>
                    <select
                      value={cloudSettings.providerName}
                      onChange={(e) => handleSaveCloudSettings({ providerName: e.target.value as any })}
                      className="w-full text-xs font-semibold px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="Dropbox">Dropbox</option>
                      <option value="Google Drive">Google Drive</option>
                      <option value="iCloud">iCloud Drive</option>
                      <option value="OneDrive">OneDrive</option>
                      <option value="Nextcloud">Nextcloud</option>
                      <option value="Local Folder">Local Synced Folder (Syncthing)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                      Cloud Sync Folder Location
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Select or enter folder (e.g. C:\Users\treed\Dropbox\rMoney)"
                        value={cloudSettings.folderPath}
                        onChange={(e) => handleSaveCloudSettings({ folderPath: e.target.value })}
                        className="flex-1 text-xs px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                      />
                      <button
                        type="button"
                        onClick={handleBrowseFolder}
                        disabled={isSyncing}
                        className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs shrink-0 disabled:opacity-50"
                      >
                        <FolderOpen size={14} />
                        Browse Folder...
                      </button>
                    </div>
                    {cloudSettings.folderPath && (
                      <p className="text-[11px] text-slate-400 mt-1 font-mono truncate">
                        Vault file: {getSyncFilePath(cloudSettings.folderPath)}
                      </p>
                    )}
                  </div>
                </div>

                {/* Cloud Sync Actions */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleManualCloudSync}
                      disabled={isSyncing || !cloudSettings.folderPath}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                    >
                      <RefreshCw size={13} className={isSyncing ? 'animate-spin' : ''} />
                      {isSyncing ? 'Synchronizing...' : 'Sync Now (Push & Pull)'}
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCloudSyncNow}
                      disabled={isSyncing}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1 cursor-pointer"
                      title="Export manual backup copy"
                    >
                      <Download size={13} />
                      Manual Export
                    </button>

                    <label className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1 cursor-pointer">
                      <Upload size={13} />
                      Manual Import
                      <input
                        type="file"
                        accept=".rmsync,.json"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                {cloudSettings.lastSyncedAt && (
                  <p className="text-[11px] text-slate-400">
                    Last automatic sync: {new Date(cloudSettings.lastSyncedAt).toLocaleTimeString()} ({cloudSettings.lastSyncStatus || 'Up to date'})
                  </p>
                )}
              </div>
            </div>
          )}

          {activeTab === 'devices' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    Connected Instances ({pairedDevices.length + 1})
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Instances that have synchronized with this ledger.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRotateSecret}
                  className="text-xs text-rose-600 hover:text-rose-700 font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw size={12} />
                  Reset Pairing Secret
                </button>
              </div>

              <div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100">
                {/* Current Device Row */}
                <div className="p-3.5 bg-blue-50/40 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Laptop size={18} className="text-blue-600" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-800">{deviceNameInput}</span>
                        <span className="text-[10px] font-bold bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">
                          Current Device
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">{deviceId}</span>
                    </div>
                  </div>
                  <span className="text-[11px] text-emerald-600 font-bold flex items-center gap-1">
                    <CheckCircle2 size={13} /> Active
                  </span>
                </div>

                {/* Paired Remote Devices */}
                {pairedDevices.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400">
                    No remote mobile devices or secondary instances paired yet.
                  </div>
                ) : (
                  pairedDevices.map((dev) => (
                    <div key={dev.id} className="p-3.5 bg-white flex items-center justify-between hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-3">
                        <Smartphone size={18} className="text-slate-500" />
                        <div>
                          <p className="font-bold text-xs text-slate-800">{dev.name}</p>
                          <p className="text-[10px] text-slate-400 font-mono">
                            ID: {dev.id} • Last seen: {dev.lastSeen ? new Date(dev.lastSeen).toLocaleDateString() : 'Recently'}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removePairedDevice(dev.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                        title="Unpair Device"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between p-4 px-6 border-t border-slate-100 bg-slate-50/60">
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <ShieldCheck size={14} className="text-emerald-600" />
            End-to-End Encrypted & Offline-First
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeviceSyncModal;
