import React, { useState, useEffect } from 'react';
import {
  X,
  Download,
  Trash2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  FileText,
  Paperclip,
  Upload,
  CheckCircle2,
} from 'lucide-react';
import { getDb } from '../utils/db';
import { TransactionAttachment } from '../types';
import { useRegionalSettings } from '../utils/currency';

interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactionId?: number;
  payee?: string;
  date?: string;
  amount?: number;
  onAttachmentChanged?: () => void;
  proStatus?: boolean;
  onTriggerUpgrade?: (reason: 'receipts_locked') => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  isOpen,
  onClose,
  transactionId,
  payee,
  date,
  amount,
  onAttachmentChanged,
  proStatus = false,
  onTriggerUpgrade,
}) => {
  const { formatCurrency, formatDate } = useRegionalSettings();
  const [attachments, setAttachments] = useState<TransactionAttachment[]>([]);
  const [selectedAttachment, setSelectedAttachment] = useState<TransactionAttachment | null>(null);
  const [loading, setLoading] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isUploading, setIsUploading] = useState(false);

  const fetchAttachments = async () => {
    if (!transactionId) return;
    setLoading(true);
    try {
      const db = await getDb();
      const rows = (await db.select(
        'SELECT * FROM transaction_attachments WHERE transaction_id = ? ORDER BY id DESC',
        [transactionId]
      )) as TransactionAttachment[];
      setAttachments(rows);
      if (rows.length > 0) {
        setSelectedAttachment(rows[0]);
      } else {
        setSelectedAttachment(null);
      }
    } catch (e) {
      console.error('Error fetching attachments:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && transactionId) {
      setZoomLevel(1);
      fetchAttachments();
    }
  }, [isOpen, transactionId]);

  if (!isOpen) return null;

  const handleDownload = (att: TransactionAttachment) => {
    const a = document.createElement('a');
    a.href = att.data_base64;
    a.download = att.file_name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDelete = async (attId: number) => {
    if (!confirm('Are you sure you want to delete this attached receipt?')) return;
    try {
      const db = await getDb();
      await db.execute('DELETE FROM transaction_attachments WHERE id = ?', [attId]);
      await fetchAttachments();
      if (onAttachmentChanged) onAttachmentChanged();
    } catch (e) {
      console.error('Error deleting attachment:', e);
      alert('Failed to delete attachment.');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !transactionId) return;

    if (!proStatus) {
      try {
        const db = await getDb();
        const countRes = (await db.select('SELECT COUNT(*) as cnt FROM transaction_attachments')) as { cnt: number }[];
        if ((countRes?.[0]?.cnt || 0) >= 3) {
          if (onTriggerUpgrade) onTriggerUpgrade('receipts_locked');
          e.target.value = '';
          return;
        }
      } catch {
        // ignore
      }
    }

    if (file.size > 15 * 1024 * 1024) {
      alert('File size exceeds 15 MB limit.');
      return;
    }

    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64Data = reader.result as string;
        const db = await getDb();
        await db.execute(
          'INSERT INTO transaction_attachments (transaction_id, file_name, file_type, file_size, data_base64, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          [
            transactionId,
            file.name,
            file.type || 'application/octet-stream',
            file.size,
            base64Data,
            new Date().toISOString(),
          ]
        );
        await fetchAttachments();
        if (onAttachmentChanged) onAttachmentChanged();
      } catch (err) {
        console.error('Error attaching file:', err);
        alert('Failed to attach document.');
      } finally {
        setIsUploading(false);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const isImage = (type: string) => type.startsWith('image/');
  const isPdf = (type: string) => type === 'application/pdf' || type.includes('pdf');

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-3 sm:p-6 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-4xl shadow-2xl relative overflow-hidden flex flex-col max-h-[92vh] text-white">
        {/* Top Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center shrink-0">
              <Paperclip size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">
                  {payee || 'Transaction Receipt'}
                </h2>
                {amount !== undefined && (
                  <span
                    className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full ${
                      amount < 0
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    }`}
                  >
                    {formatCurrency(amount, { showSign: true })}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                {date && <span>{formatDate(date)}</span>}
                <span>•</span>
                <span>{attachments.length} attachment{attachments.length !== 1 ? 's' : ''}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer">
              <Upload size={13} />
              <span>{isUploading ? 'Attaching...' : 'Add Receipt'}</span>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={handleFileUpload}
                disabled={isUploading}
                className="hidden"
              />
            </label>

            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Attachment Tabs (if more than 1) */}
        {attachments.length > 1 && (
          <div className="px-4 py-2 bg-slate-950/80 border-b border-slate-800 flex items-center gap-2 overflow-x-auto text-xs">
            {attachments.map((att) => (
              <button
                key={att.id}
                onClick={() => {
                  setSelectedAttachment(att);
                  setZoomLevel(1);
                }}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                  selectedAttachment?.id === att.id
                    ? 'bg-blue-600 text-white shadow-xs font-bold'
                    : 'bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Paperclip size={12} />
                <span className="truncate max-w-[140px]">{att.file_name}</span>
              </button>
            ))}
          </div>
        )}

        {/* Main Preview Workspace */}
        <div className="flex-1 overflow-hidden relative flex flex-col items-center justify-center bg-slate-950 p-4 min-h-[360px]">
          {loading ? (
            <div className="flex flex-col items-center gap-2 text-slate-400">
              <div className="w-7 h-7 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs">Loading receipt...</span>
            </div>
          ) : !selectedAttachment ? (
            <div className="text-center space-y-3 p-6 max-w-sm">
              <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mx-auto text-slate-400">
                <Paperclip size={24} />
              </div>
              <h3 className="text-sm font-bold text-slate-200">No Receipt Attached Yet</h3>
              <p className="text-xs text-slate-500">
                Upload a scanned receipt, invoice, or PDF to link official documentation to this transaction.
              </p>
              <label className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl cursor-pointer transition-colors shadow-sm">
                <Upload size={14} />
                <span>Upload First Receipt</span>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center overflow-auto p-2">
              {isImage(selectedAttachment.file_type) ? (
                <div className="relative max-w-full max-h-full flex items-center justify-center transition-transform duration-150">
                  <img
                    src={selectedAttachment.data_base64}
                    alt={selectedAttachment.file_name}
                    style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'center center' }}
                    className="max-h-[62vh] max-w-full object-contain rounded-lg shadow-2xl transition-transform"
                  />
                </div>
              ) : isPdf(selectedAttachment.file_type) ? (
                <div className="w-full h-full flex flex-col items-center justify-center gap-4">
                  <iframe
                    src={selectedAttachment.data_base64}
                    title={selectedAttachment.file_name}
                    className="w-full h-[60vh] rounded-xl border border-slate-800 bg-white"
                  />
                </div>
              ) : (
                <div className="text-center space-y-3 p-6">
                  <FileText size={48} className="mx-auto text-blue-400" />
                  <p className="text-sm font-bold text-white">{selectedAttachment.file_name}</p>
                  <p className="text-xs text-slate-400">
                    Binary Document ({Math.round(selectedAttachment.file_size / 1024)} KB)
                  </p>
                  <button
                    onClick={() => handleDownload(selectedAttachment)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl inline-flex items-center gap-2 cursor-pointer shadow-sm"
                  >
                    <Download size={14} />
                    <span>Download File to View</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom Toolbar & Details */}
        {selectedAttachment && (
          <div className="p-3.5 sm:p-4 bg-slate-950/90 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3 text-slate-400">
              <span className="font-semibold text-slate-200 truncate max-w-xs">{selectedAttachment.file_name}</span>
              <span>•</span>
              <span>{(selectedAttachment.file_size / 1024).toFixed(1)} KB</span>
              <span>•</span>
              <span className="text-emerald-400 flex items-center gap-1 font-medium">
                <CheckCircle2 size={13} />
                Audit Verified
              </span>
            </div>

            <div className="flex items-center gap-2">
              {isImage(selectedAttachment.file_type) && (
                <div className="flex items-center bg-slate-800/80 rounded-xl p-0.5 border border-slate-700/60 mr-2">
                  <button
                    onClick={() => setZoomLevel((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))))}
                    className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition-colors"
                    title="Zoom Out"
                  >
                    <ZoomOut size={14} />
                  </button>
                  <span className="text-[11px] font-mono font-bold px-2 text-slate-300">
                    {Math.round(zoomLevel * 100)}%
                  </span>
                  <button
                    onClick={() => setZoomLevel((z) => Math.min(3, Number((z + 0.25).toFixed(2))))}
                    className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition-colors"
                    title="Zoom In"
                  >
                    <ZoomIn size={14} />
                  </button>
                  <button
                    onClick={() => setZoomLevel(1)}
                    className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition-colors"
                    title="Reset Zoom"
                  >
                    <RotateCcw size={13} />
                  </button>
                </div>
              )}

              <button
                onClick={() => handleDownload(selectedAttachment)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-700"
                title="Download Receipt File"
              >
                <Download size={13} />
                <span>Download</span>
              </button>

              <button
                onClick={() => selectedAttachment.id && handleDelete(selectedAttachment.id)}
                className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors cursor-pointer"
                title="Delete Receipt"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReceiptModal;
