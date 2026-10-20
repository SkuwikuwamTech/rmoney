import { useState, useEffect } from 'react';
import { X, ArrowUpCircle, ArrowDownCircle, ArrowRightLeft, Paperclip, Upload } from 'lucide-react';
import { getDb } from '../utils/db';
import { Account, Category, TransactionRule } from '../types';
import { useRegionalSettings } from '../utils/currency';
import { getTransactionRules, matchRuleForTransaction } from '../utils/rulesEngine';

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts?: Account[];
  defaultAccountId?: number;
  accountId?: number;
  accountName?: string;
  type?: 'income' | 'expense' | 'transfer';
  onSuccess: () => void;
  proStatus?: boolean;
  onTriggerUpgrade?: (reason: 'receipts_locked') => void;
}

const TransactionModal = ({
  isOpen,
  onClose,
  accounts: propAccounts,
  defaultAccountId,
  accountId,
  type: initialType = 'expense',
  onSuccess,
  proStatus = false,
  onTriggerUpgrade,
}: TransactionModalProps) => {
  const { formatCurrency, currency } = useRegionalSettings();
  const [modalType, setModalType] = useState<'income' | 'expense' | 'transfer'>(initialType);
  const [selectedAccountId, setSelectedAccountId] = useState<number>(defaultAccountId || accountId || 0);
  const [toAccountId, setToAccountId] = useState<number>(0);
  const [payee, setPayee] = useState('');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState<number>(1);
  const [memo, setMemo] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [attachedFile, setAttachedFile] = useState<{ name: string; type: string; size: number; base64: string } | null>(null);

  const [accounts, setAccounts] = useState<Account[]>(propAccounts || []);
  const [categories, setCategories] = useState<Category[]>([]);
  const [rules, setRules] = useState<TransactionRule[]>([]);

  useEffect(() => {
    setModalType(initialType);
  }, [initialType]);

  useEffect(() => {
    if (isOpen) {
      getTransactionRules().then(setRules).catch(console.error);
      getDb()
        .then(async (db) => {
          const accs = (await db.select('SELECT * FROM accounts ORDER BY id')) as Account[];
          const cats = (await db.select('SELECT * FROM categories ORDER BY id')) as Category[];
          setAccounts(accs);
          setCategories(cats);

          const activeAccId = defaultAccountId || accountId || (accs.length > 0 ? accs[0].id : 0);
          setSelectedAccountId(activeAccId);

          const otherAcc = accs.find((a) => a.id !== activeAccId);
          if (otherAcc) {
            setToAccountId(otherAcc.id);
          }

          // Pick an appropriate default category
          const matchingCat = cats.find((c) =>
            modalType === 'income' ? c.type === 'income' : c.type === 'expense'
          );
          if (matchingCat) {
            setCategoryId(matchingCat.id);
          } else if (cats.length > 0) {
            setCategoryId(cats[0].id);
          }
        })
        .catch(console.error);

      setPayee('');
      setAmount('');
      setMemo('');
      setDate(new Date().toISOString().split('T')[0]);
      setAttachedFile(null);
    }
  }, [isOpen, defaultAccountId, accountId]);

  // Adjust category selection when modalType changes
  useEffect(() => {
    if (categories.length > 0) {
      const matchingCat = categories.find((c) =>
        modalType === 'income' ? c.type === 'income' : c.type === 'expense'
      );
      if (matchingCat) {
        setCategoryId(matchingCat.id);
      }
    }
  }, [modalType, categories]);

  if (!isOpen) return null;

  const filteredCategories = categories.filter((c) =>
    modalType === 'income' ? c.type === 'income' : c.type === 'expense'
  );

  const handleSave = async () => {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      alert('Please enter a valid positive amount.');
      return;
    }

    if (!selectedAccountId) {
      alert('Please select an account.');
      return;
    }

    const db = await getDb();

    try {
      if (modalType === 'transfer') {
        if (!toAccountId || toAccountId === selectedAccountId) {
          alert('Please select a different destination account for the transfer.');
          return;
        }

        const fromAcc = accounts.find((a) => a.id === selectedAccountId);
        const toAcc = accounts.find((a) => a.id === toAccountId);
        const transferPayeeOut = payee.trim()
          ? `${payee.trim()} (To: ${toAcc?.name || 'Account'})`
          : `Transfer to ${toAcc?.name || 'Account'}`;
        const transferPayeeIn = payee.trim()
          ? `${payee.trim()} (From: ${fromAcc?.name || 'Account'})`
          : `Transfer from ${fromAcc?.name || 'Account'}`;

        // Fallback or transfer category
        const catId = categoryId || 1;

        // 1. Source Account: Outgoing (-)
        const resOut = await db.execute(
          'INSERT INTO transactions (account_id, category_id, date, payee, amount, memo) VALUES (?, ?, ?, ?, ?, ?)',
          [selectedAccountId, catId, date, transferPayeeOut, -Math.abs(numAmount), memo]
        );
        await db.execute('UPDATE accounts SET balance = balance - ? WHERE id = ?', [
          Math.abs(numAmount),
          selectedAccountId,
        ]);

        if (attachedFile && resOut.lastInsertId) {
          await db.execute(
            'INSERT INTO transaction_attachments (transaction_id, file_name, file_type, file_size, data_base64, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            [resOut.lastInsertId, attachedFile.name, attachedFile.type, attachedFile.size, attachedFile.base64, new Date().toISOString()]
          );
        }

        // 2. Destination Account: Incoming (+)
        await db.execute(
          'INSERT INTO transactions (account_id, category_id, date, payee, amount, memo) VALUES (?, ?, ?, ?, ?, ?)',
          [toAccountId, catId, date, transferPayeeIn, Math.abs(numAmount), memo]
        );
        await db.execute('UPDATE accounts SET balance = balance + ? WHERE id = ?', [
          Math.abs(numAmount),
          toAccountId,
        ]);
      } else {
        if (!payee.trim()) {
          alert('Please enter a payee or description.');
          return;
        }

        const finalAmount = modalType === 'expense' ? -Math.abs(numAmount) : Math.abs(numAmount);
        const catId = categoryId || 1;

        const res = await db.execute(
          'INSERT INTO transactions (account_id, category_id, date, payee, amount, memo) VALUES (?, ?, ?, ?, ?, ?)',
          [selectedAccountId, catId, date, payee.trim(), finalAmount, memo]
        );
        await db.execute('UPDATE accounts SET balance = balance + ? WHERE id = ?', [
          finalAmount,
          selectedAccountId,
        ]);

        if (attachedFile && res.lastInsertId) {
          await db.execute(
            'INSERT INTO transaction_attachments (transaction_id, file_name, file_type, file_size, data_base64, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            [res.lastInsertId, attachedFile.name, attachedFile.type, attachedFile.size, attachedFile.base64, new Date().toISOString()]
          );
        }
      }

      onSuccess();
      onClose();
    } catch (e) {
      console.error('Error saving transaction:', e);
      alert('Failed to save transaction. See console for details.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-3 sm:p-5 z-50 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[92vh] flex flex-col p-5 sm:p-6 shadow-xl animate-in fade-in zoom-in duration-200 overflow-hidden">
        <div className="flex justify-between items-center mb-4 flex-shrink-0">
          <div className="flex items-center gap-2">
            {modalType === 'income' && <ArrowUpCircle className="text-green-500" size={24} />}
            {modalType === 'expense' && <ArrowDownCircle className="text-red-500" size={24} />}
            {modalType === 'transfer' && <ArrowRightLeft className="text-purple-500" size={24} />}
            <h2 className="text-2xl font-bold text-slate-800 capitalize">Record {modalType}</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        {/* Type Switcher */}
        <div className="flex rounded-xl bg-slate-100 p-1 mb-4 flex-shrink-0">
          <button
            type="button"
            onClick={() => setModalType('expense')}
            className={`flex-1 py-1.5 text-sm font-semibold rounded-lg transition-all ${
              modalType === 'expense' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Expense
          </button>
          <button
            type="button"
            onClick={() => setModalType('income')}
            className={`flex-1 py-1.5 text-sm font-semibold rounded-lg transition-all ${
              modalType === 'income' ? 'bg-white text-green-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Income
          </button>
          <button
            type="button"
            onClick={() => setModalType('transfer')}
            className={`flex-1 py-1.5 text-sm font-semibold rounded-lg transition-all ${
              modalType === 'transfer' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Transfer
          </button>
        </div>

        <div className="space-y-4 flex-1 min-h-0 overflow-y-auto pr-1 pb-1">
          {/* Account Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase">
                {modalType === 'transfer' ? 'From Account' : 'Account'}
              </label>
              <select
                className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium"
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(parseInt(e.target.value))}
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({formatCurrency(acc.balance)})
                  </option>
                ))}
              </select>
            </div>

            {modalType === 'transfer' && (
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">To Account</label>
                <select
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium"
                  value={toAccountId}
                  onChange={(e) => setToAccountId(parseInt(e.target.value))}
                >
                  <option value={0}>Select destination...</option>
                  {accounts
                    .filter((a) => a.id !== selectedAccountId)
                    .map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} (${acc.balance.toLocaleString()})
                      </option>
                    ))}
                </select>
              </div>
            )}

            {modalType !== 'transfer' && (
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Category</label>
                <select
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium"
                  value={categoryId}
                  onChange={(e) => setCategoryId(parseInt(e.target.value))}
                >
                  {(filteredCategories.length > 0 ? filteredCategories : categories).map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase">Date</label>
              <input
                type="date"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase">Amount ({currency.symbol.trim()})</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-semibold"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase">
              {modalType === 'transfer' ? 'Description (Optional)' : 'Payee / Description'}
            </label>
            <input
              type="text"
              placeholder={
                modalType === 'transfer' ? 'e.g. Monthly Savings Transfer' : 'Who was this for or from?'
              }
              className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              value={payee}
              onChange={(e) => {
                const val = e.target.value;
                setPayee(val);
                if (modalType !== 'transfer') {
                  const matched = matchRuleForTransaction(val, memo, rules);
                  if (matched) setCategoryId(matched);
                }
              }}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase">Memo / Note</label>
            <textarea
              className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 h-16 resize-none text-sm"
              placeholder="Optional notes..."
              value={memo}
              onChange={(e) => {
                const val = e.target.value;
                setMemo(val);
                if (modalType !== 'transfer') {
                  const matched = matchRuleForTransaction(payee, val, rules);
                  if (matched) setCategoryId(matched);
                }
              }}
            />
          </div>

          {/* Receipt / Invoice Attachment */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Paperclip size={13} />
                <span>Receipt / Invoice Attachment</span>
                {proStatus ? (
                  <span className="text-[10px] uppercase font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 ml-1">
                    Pro
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-400 font-medium normal-case ml-1">
                    (Free: 3 sample receipts)
                  </span>
                )}
              </span>
              {attachedFile && (
                <span className="text-[10px] text-emerald-600 font-bold lowercase">
                  {(attachedFile.size / 1024).toFixed(1)} kb attached
                </span>
              )}
            </label>

            {attachedFile ? (
              <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                <div className="flex items-center gap-2 truncate">
                  <Paperclip size={14} className="text-blue-500 shrink-0" />
                  <span className="font-semibold text-slate-700 truncate">{attachedFile.name}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setAttachedFile(null)}
                  className="text-slate-400 hover:text-red-500 p-1 rounded-md transition-colors cursor-pointer"
                  title="Remove attached file"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <label className="w-full flex items-center justify-center gap-2 py-2 px-3 border border-dashed border-slate-300 hover:border-blue-400 rounded-xl text-xs font-semibold text-slate-500 hover:text-blue-600 cursor-pointer bg-slate-50/50 hover:bg-blue-50/20 transition-all">
                <Upload size={13} />
                <span>Attach Receipt, Invoice or PDF</span>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;

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
                        // ignore and continue
                      }
                    }

                    if (file.size > 15 * 1024 * 1024) {
                      alert('File size exceeds 15 MB limit.');
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => {
                      setAttachedFile({
                        name: file.name,
                        type: file.type || 'application/octet-stream',
                        size: file.size,
                        base64: reader.result as string,
                      });
                    };
                    reader.readAsDataURL(file);
                    e.target.value = '';
                  }}
                  className="hidden"
                />
              </label>
            )}
          </div>
        </div>

        <div className="flex gap-3 pt-4 border-t border-slate-100 flex-shrink-0 mt-3">
          <button
            type="button"
            onClick={onClose}
            className="w-1/3 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className={`flex-1 py-2.5 rounded-xl text-white font-bold transition-all shadow-md ${
              modalType === 'income'
                ? 'bg-green-600 hover:bg-green-700'
                : modalType === 'transfer'
                ? 'bg-purple-600 hover:bg-purple-700'
                : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            Save {modalType === 'income' ? 'Income' : modalType === 'transfer' ? 'Transfer' : 'Expense'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TransactionModal;
