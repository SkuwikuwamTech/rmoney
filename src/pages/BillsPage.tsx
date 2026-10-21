import { useState, useEffect } from 'react';
import {
  Calendar,
  Plus,
  Trash2,
  Clock,
  AlertCircle,
  CheckCircle2,
  Edit2,
  ArrowRightLeft,
  X,
  Sparkles,
  RotateCcw,
  List,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { getDb } from '../utils/db';
import { ScheduledTransaction, Account, Category, ScheduledTransactionOverride } from '../types';
import { useRegionalSettings, getLocalTodayStr } from '../utils/currency';

function calculateNextDate(currentDateStr: string, frequency: string): string {
  const parts = currentDateStr.split('-').map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  switch (frequency) {
    case 'daily':
      date.setDate(date.getDate() + 1);
      break;
    case 'weekly':
      date.setDate(date.getDate() + 7);
      break;
    case 'bi-weekly':
      date.setDate(date.getDate() + 14);
      break;
    case 'monthly':
      date.setMonth(date.getMonth() + 1);
      break;
    case 'yearly':
      date.setFullYear(date.getFullYear() + 1);
      break;
    default:
      date.setDate(date.getDate() + 1);
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const BillsPage = () => {
  const { formatCurrency, formatDate, currency } = useRegionalSettings();
  const [bills, setBills] = useState<ScheduledTransaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [calendarDate, setCalendarDate] = useState<Date>(new Date());

  // Edit Bill / Instance State
  const [editingBill, setEditingBill] = useState<ScheduledTransaction | null>(null);
  const [editMode, setEditMode] = useState<'series' | 'instance'>('series');

  // Post & Review Instance Modal State
  const [postingBill, setPostingBill] = useState<{
    bill: ScheduledTransaction;
    date: string;
    amount: string;
    payee: string;
    accountId: number;
    toAccountId: number;
    categoryId: number;
    memo: string;
  } | null>(null);

  // Form State for Adding / Series Editing
  const [form, setForm] = useState({
    payee: '',
    amount: '',
    frequency: 'monthly' as 'once' | 'daily' | 'weekly' | 'bi-weekly' | 'monthly' | 'yearly',
    nextDate: getLocalTodayStr(0),
    accountId: 0,
    categoryId: 0,
    type: 'expense' as 'income' | 'expense' | 'transfer',
    toAccountId: '' as string,
  });

  // Form State for Instance-Only Editing
  const [instanceForm, setInstanceForm] = useState({
    date: getLocalTodayStr(0),
    payee: '',
    amount: '',
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const db = await getDb();
      const billsResult = (await db.select(`
        SELECT 
          st.*,
          a.name as account_name,
          c.name as category_name,
          to_acc.name as to_account_name
        FROM scheduled_transactions st
        LEFT JOIN accounts a ON st.account_id = a.id
        LEFT JOIN categories c ON st.category_id = c.id
        LEFT JOIN accounts to_acc ON st.to_account_id = to_acc.id
        ORDER BY st.next_date ASC
      `)) as ScheduledTransaction[];

      const overrides = (await db.select('SELECT * FROM scheduled_transaction_overrides')) as ScheduledTransactionOverride[];
      const overrideMap = new Map<string, ScheduledTransactionOverride>();
      overrides.forEach((ov) => {
        const key = ov.original_date ? `${ov.scheduled_id}_${ov.original_date}` : `${ov.scheduled_id}_${ov.date}`;
        overrideMap.set(key, ov);
      });

      const billsWithOverrides = billsResult.map((bill) => {
        const ov = overrideMap.get(`${bill.id}_${bill.next_date}`);
        const isDateChanged = !!(ov?.new_date && ov.new_date.trim() && ov.new_date.trim() !== bill.next_date);
        const normBillAmt = Math.abs(bill.amount);
        const normOvAmt = ov?.amount !== undefined && ov?.amount !== null ? Math.abs(ov.amount) : normBillAmt;
        return {
          ...bill,
          amount: normBillAmt,
          effective_amount: normOvAmt,
          effective_payee:
            ov?.payee !== undefined && ov?.payee !== null && ov.payee.trim()
              ? ov.payee
              : bill.payee,
          effective_date: isDateChanged ? ov!.new_date!.trim() : bill.next_date,
          original_date: bill.next_date,
          is_instance_overridden: !!ov,
        };
      });

      const accountsResult = (await db.select('SELECT * FROM accounts ORDER BY name ASC')) as Account[];
      const categoriesResult = (await db.select('SELECT * FROM categories ORDER BY name ASC')) as Category[];

      setBills(billsWithOverrides);
      setAccounts(accountsResult);
      setCategories(categoriesResult);

      if (accountsResult.length > 0 && form.accountId === 0) {
        setForm((prev) => ({ ...prev, accountId: accountsResult[0].id }));
      }
      if (categoriesResult.length > 0 && form.categoryId === 0) {
        setForm((prev) => ({ ...prev, categoryId: categoriesResult[0].id }));
      }
    } catch (e) {
      console.error('Error loading bills:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveBill = async () => {
    const numAmount = parseFloat(form.amount);
    if (!form.payee.trim() || isNaN(numAmount) || numAmount <= 0) {
      alert('Please enter a valid payee description and positive amount.');
      return;
    }

    if (!form.accountId) {
      alert('Please select an account.');
      return;
    }

    if (form.type === 'transfer' && (!form.toAccountId || parseInt(form.toAccountId) === form.accountId)) {
      alert('Please select a different destination account for transfers.');
      return;
    }

    try {
      const db = await getDb();
      const catId = form.categoryId || (categories.length > 0 ? categories[0].id : 1);
      const toAccId = form.type === 'transfer' && form.toAccountId ? parseInt(form.toAccountId) : null;

      if (editingBill) {
        await db.execute(
          `UPDATE scheduled_transactions 
           SET account_id = ?, category_id = ?, amount = ?, frequency = ?, next_date = ?, payee = ?, type = ?, to_account_id = ? 
           WHERE id = ?`,
          [
            form.accountId,
            catId,
            numAmount,
            form.frequency,
            form.nextDate,
            form.payee.trim(),
            form.type,
            toAccId,
            editingBill.id,
          ]
        );
        setEditingBill(null);
      } else {
        await db.execute(
          'INSERT INTO scheduled_transactions (account_id, category_id, amount, frequency, next_date, payee, type, to_account_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [
            form.accountId,
            catId,
            numAmount,
            form.frequency,
            form.nextDate,
            form.payee.trim(),
            form.type,
            toAccId,
          ]
        );
        setIsAdding(false);
      }

      setForm({
        payee: '',
        amount: '',
        frequency: 'monthly',
        nextDate: new Date().toISOString().split('T')[0],
        accountId: accounts.length > 0 ? accounts[0].id : 0,
        categoryId: categories.length > 0 ? categories[0].id : 0,
        type: 'expense',
        toAccountId: '',
      });
      await loadData();
    } catch (e) {
      console.error('Error saving scheduled bill:', e);
      alert('Failed to save scheduled transaction.');
    }
  };

  const handleSaveInstanceOverride = async () => {
    if (!editingBill) return;
    const numAmount = parseFloat(instanceForm.amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      alert('Please enter a valid positive amount.');
      return;
    }

    if (!instanceForm.date) {
      alert('Please select a valid date for this occurrence.');
      return;
    }

    try {
      const db = await getDb();
      await db.execute(
        'DELETE FROM scheduled_transaction_overrides WHERE scheduled_id = ? AND (original_date = ? OR date = ?)',
        [editingBill.id, editingBill.next_date, editingBill.next_date]
      );
      await db.execute(
        'INSERT INTO scheduled_transaction_overrides (scheduled_id, original_date, new_date, date, amount, payee) VALUES (?, ?, ?, ?, ?, ?)',
        [
          editingBill.id,
          editingBill.next_date,
          instanceForm.date,
          editingBill.next_date,
          numAmount,
          instanceForm.payee.trim(),
        ]
      );
      setEditingBill(null);
      await loadData();
    } catch (e) {
      console.error('Error saving instance override:', e);
      alert('Failed to save instance override.');
    }
  };

  const handleResetInstanceOverride = async (bill: ScheduledTransaction) => {
    if (!confirm(`Reset the upcoming occurrence back to the standard recurring template (originally on ${formatDate(bill.next_date)})?`)) {
      return;
    }
    try {
      const db = await getDb();
      await db.execute(
        'DELETE FROM scheduled_transaction_overrides WHERE scheduled_id = ? AND (original_date = ? OR date = ?)',
        [bill.id, bill.next_date, bill.next_date]
      );
      await loadData();
    } catch (e) {
      console.error('Error resetting instance override:', e);
      alert('Failed to reset instance override.');
    }
  };

  const startEditBill = (bill: ScheduledTransaction) => {
    setEditingBill(bill);
    setEditMode('instance'); // default to editing this instance
    setForm({
      payee: bill.payee || '',
      amount: String(bill.amount),
      frequency: bill.frequency,
      nextDate: bill.next_date,
      accountId: bill.account_id,
      categoryId: bill.category_id,
      type: bill.type,
      toAccountId: bill.to_account_id ? String(bill.to_account_id) : '',
    });
    setInstanceForm({
      date: bill.effective_date || bill.next_date,
      payee: bill.effective_payee || bill.payee || '',
      amount: String(bill.effective_amount ?? bill.amount),
    });
    setIsAdding(false);
  };

  const openPostModal = (bill: ScheduledTransaction) => {
    setPostingBill({
      bill,
      date: bill.effective_date || bill.next_date,
      amount: String(bill.effective_amount ?? bill.amount),
      payee: bill.effective_payee || bill.payee || '',
      accountId: bill.account_id,
      toAccountId: bill.to_account_id || 0,
      categoryId: bill.category_id,
      memo: 'Scheduled payment',
    });
  };

  const confirmPostBill = async () => {
    if (!postingBill) return;
    const numAmount = parseFloat(postingBill.amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      alert('Please enter a valid positive amount.');
      return;
    }

    try {
      const db = await getDb();
      const bill = postingBill.bill;
      const catId = postingBill.categoryId || 1;
      const postDate = postingBill.date;

      if (bill.type === 'transfer') {
        const toAccId = postingBill.toAccountId || bill.to_account_id;
        if (!toAccId || toAccId === postingBill.accountId) {
          alert('Cannot post transfer: invalid destination account.');
          return;
        }

        const fromAcc = accounts.find((a) => a.id === postingBill.accountId);
        const toAcc = accounts.find((a) => a.id === toAccId);

        const payeeOut = postingBill.payee
          ? `${postingBill.payee} (To: ${toAcc?.name || 'Account'})`
          : `Transfer to ${toAcc?.name || 'Account'}`;
        const payeeIn = postingBill.payee
          ? `${postingBill.payee} (From: ${fromAcc?.name || 'Account'})`
          : `Transfer from ${fromAcc?.name || 'Account'}`;

        // 1. Source Account outflow
        await db.execute(
          'INSERT INTO transactions (account_id, category_id, date, payee, amount, memo) VALUES (?, ?, ?, ?, ?, ?)',
          [postingBill.accountId, catId, postDate, payeeOut, -Math.abs(numAmount), postingBill.memo]
        );
        await db.execute('UPDATE accounts SET balance = balance - ? WHERE id = ?', [
          Math.abs(numAmount),
          postingBill.accountId,
        ]);

        // 2. Destination Account inflow
        await db.execute(
          'INSERT INTO transactions (account_id, category_id, date, payee, amount, memo) VALUES (?, ?, ?, ?, ?, ?)',
          [toAccId, catId, postDate, payeeIn, Math.abs(numAmount), postingBill.memo]
        );
        await db.execute('UPDATE accounts SET balance = balance + ? WHERE id = ?', [
          Math.abs(numAmount),
          toAccId,
        ]);
      } else {
        const finalAmount = bill.type === 'expense' ? -Math.abs(numAmount) : Math.abs(numAmount);

        // 1. Insert transaction
        await db.execute(
          'INSERT INTO transactions (account_id, category_id, date, payee, amount, memo) VALUES (?, ?, ?, ?, ?, ?)',
          [postingBill.accountId, catId, postDate, postingBill.payee, finalAmount, postingBill.memo]
        );

        // 2. Update account balance
        await db.execute('UPDATE accounts SET balance = balance + ? WHERE id = ?', [
          finalAmount,
          postingBill.accountId,
        ]);
      }

      // 3. Clear any instance override for this date
      await db.execute(
        'DELETE FROM scheduled_transaction_overrides WHERE scheduled_id = ? AND (original_date = ? OR date = ?)',
        [bill.id, bill.next_date, bill.next_date]
      );

      // 4. Advance next_date or remove if one-time
      if (bill.frequency === 'once') {
        await db.execute('DELETE FROM scheduled_transactions WHERE id = ?', [bill.id]);
      } else {
        const newNextDate = calculateNextDate(bill.next_date, bill.frequency);
        await db.execute('UPDATE scheduled_transactions SET next_date = ? WHERE id = ?', [
          newNextDate,
          bill.id,
        ]);
      }

      setPostingBill(null);
      await loadData();
    } catch (e) {
      console.error('Error posting bill:', e);
      alert('Failed to post scheduled transaction.');
    }
  };

  const deleteBill = async (id: number) => {
    if (!confirm('Are you sure you want to delete this scheduled transaction series?')) {
      return;
    }
    try {
      const db = await getDb();
      await db.execute('DELETE FROM scheduled_transaction_overrides WHERE scheduled_id = ?', [id]);
      await db.execute('DELETE FROM scheduled_transactions WHERE id = ?', [id]);
      await loadData();
    } catch (e) {
      console.error('Error deleting bill:', e);
    }
  };

  const filteredCategories = categories.filter((c) =>
    form.type === 'income' ? c.type === 'income' : c.type === 'expense'
  );

  const calendarYear = calendarDate.getFullYear();
  const calendarMonth = calendarDate.getMonth();
  const firstDayOfWeek = new Date(calendarYear, calendarMonth, 1).getDay();
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const todayStr = new Date().toISOString().split('T')[0];

  const getBillsForDate = (dateStr: string) => {
    return bills.filter((b) => {
      const nextDate = b.effective_date || b.next_date;
      if (b.frequency === 'once') return nextDate === dateStr;
      if (dateStr < nextDate) return false;
      const targetParts = dateStr.split('-').map(Number);
      const nextParts = nextDate.split('-').map(Number);
      const targetDate = new Date(targetParts[0], targetParts[1] - 1, targetParts[2]);
      const billStartDate = new Date(nextParts[0], nextParts[1] - 1, nextParts[2]);
      const diffDays = Math.round((targetDate.getTime() - billStartDate.getTime()) / (1000 * 60 * 60 * 24));
      switch (b.frequency) {
        case 'daily':
          return true;
        case 'weekly':
          return diffDays >= 0 && diffDays % 7 === 0;
        case 'bi-weekly':
          return diffDays >= 0 && diffDays % 14 === 0;
        case 'monthly':
          return targetParts[2] === nextParts[2];
        case 'yearly':
          return targetParts[1] === nextParts[1] && targetParts[2] === nextParts[2];
        default:
          return nextDate === dateStr;
      }
    });
  };

  let calendarIncome = 0;
  let calendarExpense = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayBills = getBillsForDate(dStr);
    dayBills.forEach((b: ScheduledTransaction) => {
      const amt = b.effective_amount || b.amount;
      if (b.type === 'income') calendarIncome += amt;
      else if (b.type === 'expense') calendarExpense += amt;
    });
  }
  const calendarNet = calendarIncome - calendarExpense;

  return (
    <div className="flex-1 min-h-0 flex flex-col space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">Scheduled Transactions</h1>
          <p className="text-slate-500 text-xs sm:text-sm">Manage recurring bills, paychecks, and scheduled transfers</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="bg-slate-200/80 p-1 rounded-xl flex items-center gap-1 border border-slate-300/60 shadow-2xs">
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-white text-slate-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <List size={14} />
              <span>List View</span>
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'calendar'
                  ? 'bg-white text-slate-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Calendar size={14} />
              <span>Calendar View</span>
            </button>
          </div>

          {!isAdding && !editingBill && (
            <button
              onClick={() => {
                setIsAdding(true);
                setEditingBill(null);
              }}
              className="bg-blue-600 text-white px-3.5 sm:px-4 py-2 rounded-xl hover:bg-blue-700 transition-colors font-semibold flex items-center gap-1.5 shadow-sm text-xs cursor-pointer"
            >
              <Plus size={16} />
              <span>Schedule New</span>
            </button>
          )}
        </div>
      </header>

      {/* Add New Scheduled Transaction Card */}
      {isAdding && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-blue-200 animate-in slide-in-from-top-4 duration-200 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Calendar size={20} className="text-blue-500" />
              Schedule a Recurring Transaction
            </h2>
            <button
              onClick={() => setIsAdding(false)}
              className="text-slate-400 hover:text-slate-600 p-1"
            >
              <X size={20} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase">Type</label>
              <select
                className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium"
                value={form.type}
                onChange={(e) =>
                  setForm({ ...form, type: e.target.value as 'income' | 'expense' | 'transfer' })
                }
              >
                <option value="expense">Expense / Bill</option>
                <option value="income">Recurring Income</option>
                <option value="transfer">Recurring Transfer</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase">Payee / Description</label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                value={form.payee}
                onChange={(e) => setForm({ ...form, payee: e.target.value })}
                placeholder="e.g. Electric Bill, Salary, Monthly Savings"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase">Amount ({currency.symbol})</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-semibold"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="0.00"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase">Frequency</label>
              <select
                className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium"
                value={form.frequency}
                onChange={(e) =>
                  setForm({
                    ...form,
                    frequency: e.target.value as 'once' | 'daily' | 'weekly' | 'bi-weekly' | 'monthly' | 'yearly',
                  })
                }
              >
                <option value="once">One-Time (On Due Date)</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="bi-weekly">Bi-Weekly (Every 2 Weeks)</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase">Next Due Date</label>
              <input
                type="date"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                value={form.nextDate}
                onChange={(e) => setForm({ ...form, nextDate: e.target.value })}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase">
                {form.type === 'transfer' ? 'From Account' : 'Account'}
              </label>
              <select
                className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium"
                value={form.accountId}
                onChange={(e) => setForm({ ...form, accountId: parseInt(e.target.value) })}
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                  </option>
                ))}
              </select>
            </div>

            {form.type === 'transfer' ? (
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">To Account</label>
                <select
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium"
                  value={form.toAccountId}
                  onChange={(e) => setForm({ ...form, toAccountId: e.target.value })}
                >
                  <option value="">Select account...</option>
                  {accounts
                    .filter((acc) => acc.id !== form.accountId)
                    .map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name}
                      </option>
                    ))}
                </select>
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Category</label>
                <select
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium"
                  value={form.categoryId}
                  onChange={(e) => setForm({ ...form, categoryId: parseInt(e.target.value) })}
                >
                  {(filteredCategories.length > 0 ? filteredCategories : categories).map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="md:col-span-3 flex items-center justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="px-5 py-2 text-slate-600 hover:text-slate-800 font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveBill}
                className={`px-6 py-2.5 rounded-xl text-white font-bold transition-all shadow-md ${
                  form.type === 'income'
                    ? 'bg-green-600 hover:bg-green-700'
                    : form.type === 'transfer'
                    ? 'bg-purple-600 hover:bg-purple-700'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                Save Scheduled Transaction
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal (Series vs Instance Switcher) */}
      {editingBill && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl animate-in zoom-in-95 duration-150 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-lg text-slate-800">Edit Scheduled Transaction</h3>
                <p className="text-xs text-slate-400">
                  {editingBill.payee} • Scheduled series slot: {formatDate(editingBill.next_date)}
                </p>
              </div>
              <button
                onClick={() => setEditingBill(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            {/* Scope Switcher */}
            {editingBill.frequency !== 'once' && (
              <div className="flex rounded-xl bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setEditMode('instance')}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    editMode === 'instance'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Sparkles size={14} className="text-amber-500" />
                  This Instance Only ({formatDate(editingBill.effective_date || editingBill.next_date)})
                </button>
                <button
                  type="button"
                  onClick={() => setEditMode('series')}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    editMode === 'series'
                      ? 'bg-white text-slate-800 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Entire Recurring Series
                </button>
              </div>
            )}

            {editMode === 'instance' && editingBill.frequency !== 'once' ? (
              <div className="space-y-4 pt-1">
                <div className="p-3 bg-amber-50 border border-amber-200/60 rounded-xl text-xs text-amber-800 leading-relaxed">
                  <strong>Editing Upcoming Instance:</strong> Adjusting the date or amount modifies only this upcoming occurrence. Future occurrences will continue on their normal recurring dates and standard {formatCurrency(editingBill.amount)} amount.
                </div>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Instance Due Date</label>
                    <input
                      type="date"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium"
                      value={instanceForm.date}
                      onChange={(e) => setInstanceForm({ ...instanceForm, date: e.target.value })}
                    />
                    {instanceForm.date !== editingBill.next_date && (
                      <p className="text-[11px] text-blue-600 font-medium">
                        Rescheduled from regular series date ({formatDate(editingBill.next_date)})
                      </p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Instance Payee / Note</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      value={instanceForm.payee}
                      onChange={(e) => setInstanceForm({ ...instanceForm, payee: e.target.value })}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Instance Amount ({currency.symbol})</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-semibold"
                      value={instanceForm.amount}
                      onChange={(e) => setInstanceForm({ ...instanceForm, amount: e.target.value })}
                    />
                    <p className="text-[11px] text-slate-400">
                      Standard recurring series amount: {formatCurrency(editingBill.amount)}
                    </p>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setEditingBill(null)}
                    className="px-4 py-2 text-slate-500 hover:text-slate-700 text-sm font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveInstanceOverride}
                    className="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors shadow-sm"
                  >
                    Save Instance Changes
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3 pt-1">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Payee / Description</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      value={form.payee}
                      onChange={(e) => setForm({ ...form, payee: e.target.value })}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Series Amount ({currency.symbol})</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-semibold"
                      value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Frequency</label>
                    <select
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium"
                      value={form.frequency}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          frequency: e.target.value as 'once' | 'daily' | 'weekly' | 'bi-weekly' | 'monthly' | 'yearly',
                        })
                      }
                    >
                      <option value="once">One-Time (On Due Date)</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="bi-weekly">Bi-Weekly (Every 2 Weeks)</option>
                      <option value="monthly">Monthly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Next Due Date</label>
                    <input
                      type="date"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      value={form.nextDate}
                      onChange={(e) => setForm({ ...form, nextDate: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Account</label>
                    <select
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium"
                      value={form.accountId}
                      onChange={(e) => setForm({ ...form, accountId: parseInt(e.target.value) })}
                    >
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Category</label>
                    <select
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium"
                      value={form.categoryId}
                      onChange={(e) => setForm({ ...form, categoryId: parseInt(e.target.value) })}
                    >
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setEditingBill(null)}
                    className="px-4 py-2 text-slate-500 hover:text-slate-700 text-sm font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveBill}
                    className="px-5 py-2 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 transition-colors shadow-sm"
                  >
                    Update Entire Series
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Review & Post Instance Modal */}
      {postingBill && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl animate-in zoom-in-95 duration-150 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                  <CheckCircle2 size={20} className="text-blue-600" />
                  Post & Review Payment
                </h3>
                <p className="text-xs text-slate-400">Record this occurrence into your transaction history</p>
              </div>
              <button
                onClick={() => setPostingBill(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl text-xs text-blue-800 leading-relaxed">
              Verify or adjust the payment date, amount, or payee before it is recorded in your register.
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Payee / Description</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  value={postingBill.payee}
                  onChange={(e) => setPostingBill({ ...postingBill, payee: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Payment Date</label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium"
                    value={postingBill.date}
                    onChange={(e) => setPostingBill({ ...postingBill, date: e.target.value })}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Amount ({currency.symbol})</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-semibold"
                    value={postingBill.amount}
                    onChange={(e) => setPostingBill({ ...postingBill, amount: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Account</label>
                <select
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium"
                  value={postingBill.accountId}
                  onChange={(e) =>
                    setPostingBill({ ...postingBill, accountId: parseInt(e.target.value) })
                  }
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Note / Memo</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  value={postingBill.memo}
                  onChange={(e) => setPostingBill({ ...postingBill, memo: e.target.value })}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setPostingBill(null)}
                className="px-4 py-2 text-slate-500 hover:text-slate-700 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={confirmPostBill}
                className="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors shadow-sm"
              >
                Record Payment Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Content: List View or Calendar View */}
      {viewMode === 'calendar' ? (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
          {/* Calendar Navigation & Month KPIs */}
          <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-50/50">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-2xs">
                <button
                  onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1))}
                  className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors cursor-pointer"
                  title="Previous Month"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={() => setCalendarDate(new Date())}
                  className="px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  Today
                </button>
                <button
                  onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1))}
                  className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors cursor-pointer"
                  title="Next Month"
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              <h2 className="text-xl font-bold text-slate-800 tracking-tight">
                {calendarDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
              </h2>
            </div>

            {/* Projected Month Cash Flow Badges */}
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <div className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1.5 rounded-xl font-medium flex items-center gap-1.5">
                <span className="text-emerald-600 font-bold">Projected Inflow:</span>
                <span className="font-mono font-bold">{formatCurrency(calendarIncome)}</span>
              </div>
              <div className="bg-rose-50 text-rose-800 border border-rose-200 px-3 py-1.5 rounded-xl font-medium flex items-center gap-1.5">
                <span className="text-rose-600 font-bold">Projected Bills:</span>
                <span className="font-mono font-bold">{formatCurrency(calendarExpense)}</span>
              </div>
              <div className={`px-3 py-1.5 rounded-xl font-medium border flex items-center gap-1.5 ${
                calendarNet >= 0
                  ? 'bg-blue-50 text-blue-900 border-blue-200'
                  : 'bg-amber-50 text-amber-900 border-amber-200'
              }`}>
                <span className="font-bold">Net Liquidity:</span>
                <span className="font-mono font-bold">{formatCurrency(calendarNet, { showSign: true })}</span>
              </div>
            </div>
          </div>

          {/* Calendar 7-Day Grid */}
          <div className="overflow-x-auto">
            <div className="min-w-[750px]">
              {/* Day of Week Header */}
              <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-100/70 text-slate-600 text-xs font-bold uppercase tracking-wider text-center py-2.5">
                <div>Sun</div>
                <div>Mon</div>
                <div>Tue</div>
                <div>Wed</div>
                <div>Thu</div>
                <div>Fri</div>
                <div>Sat</div>
              </div>

              {/* Month Grid Cells */}
              <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 bg-slate-100 border-b border-slate-200">
                {/* Previous Month Padding */}
                {Array.from({ length: firstDayOfWeek }).map((_, idx) => (
                  <div key={`pad-${idx}`} className="bg-slate-50/60 min-h-[110px] sm:min-h-[130px] p-2" />
                ))}

                {/* Days of Current Month */}
                {Array.from({ length: daysInMonth }).map((_, idx) => {
                  const dayNum = idx + 1;
                  const dStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                  const dayBills = getBillsForDate(dStr);
                  const isToday = dStr === todayStr;

                  return (
                    <div
                      key={`day-${dayNum}`}
                      className={`group bg-white min-h-[110px] sm:min-h-[130px] p-2 flex flex-col justify-between hover:bg-slate-50/60 transition-colors ${
                        isToday ? 'ring-2 ring-blue-500 ring-inset bg-blue-50/10' : ''
                      }`}
                    >
                      {/* Cell Header */}
                      <div className="flex items-center justify-between pb-1">
                        <span
                          className={`text-xs font-bold ${
                            isToday
                              ? 'bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center shadow-xs'
                              : 'text-slate-700'
                          }`}
                        >
                          {dayNum}
                        </span>

                        <button
                          type="button"
                          onClick={() => {
                            setForm((prev) => ({ ...prev, nextDate: dStr }));
                            setIsAdding(true);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-all cursor-pointer"
                          title={`Schedule transaction on ${dStr}`}
                        >
                          <Plus size={12} />
                        </button>
                      </div>

                      {/* Day Event Chips */}
                      <div className="space-y-1 flex-1 overflow-y-auto max-h-[85px] pr-0.5">
                        {dayBills.map((b: ScheduledTransaction) => {
                          const amt = b.effective_amount || b.amount;
                          const bType = b.type || 'expense';
                          const isOverdue = bType === 'expense' && dStr < todayStr;

                          return (
                            <button
                              key={`${b.id}-${dStr}`}
                              type="button"
                              onClick={() => openPostModal(b)}
                              className={`w-full text-left p-1 rounded-md border text-[11px] font-semibold flex items-center justify-between gap-1 transition-transform active:scale-95 cursor-pointer shadow-2xs truncate ${
                                bType === 'income'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                                  : bType === 'transfer'
                                  ? 'bg-purple-50 text-purple-800 border-purple-200 hover:bg-purple-100'
                                  : isOverdue
                                  ? 'bg-rose-100 text-rose-900 border-rose-300 font-bold hover:bg-rose-200'
                                  : 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100'
                              }`}
                              title={`Click to Post / Review: ${b.payee} (${formatCurrency(amt)})`}
                            >
                              <span className="truncate flex items-center gap-1">
                                {isOverdue && <span className="w-1.5 h-1.5 rounded-full bg-rose-600 shrink-0" />}
                                <span className="truncate">{b.effective_payee || b.payee}</span>
                              </span>
                              <span className="font-mono text-[10px] shrink-0">
                                {bType === 'income' ? '+' : '-'}{formatCurrency(amt)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {/* Remaining Month Padding to complete grid */}
                {Array.from({
                  length: (7 - ((firstDayOfWeek + daysInMonth) % 7)) % 7,
                }).map((_, idx) => (
                  <div key={`end-pad-${idx}`} className="bg-slate-50/60 min-h-[110px] sm:min-h-[130px] p-2" />
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Bills List: Desktop Table + Mobile Cards Feed */
        <div className="flex-1 min-h-0 flex flex-col gap-4">
          {/* Mobile Scheduled Transactions Feed (Phones / Small Tablets) */}
          <div className="md:hidden flex flex-col gap-3">
            {loading ? (
              <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-slate-400 text-sm">
                Loading scheduled transactions...
              </div>
            ) : bills.length === 0 ? (
              <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-slate-400 space-y-2">
                <AlertCircle size={32} className="mx-auto text-slate-300" />
                <p className="font-semibold text-sm">No scheduled transactions found</p>
                <p className="text-xs">Start by scheduling a recurring bill or income above.</p>
              </div>
            ) : (
              bills.map((bill) => {
                const effAmt = bill.effective_amount ?? bill.amount;
                const isIncome = bill.type === 'income';
                const isTransfer = bill.type === 'transfer';
                return (
                  <div
                    key={bill.id}
                    className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3"
                  >
                    {/* Top Row: Payee & Amount */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-slate-900 text-sm truncate">
                            {bill.effective_payee || bill.payee || 'Unnamed'}
                          </span>
                          {bill.is_instance_overridden && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-700 flex items-center gap-0.5">
                              <Sparkles size={9} />
                              Custom
                            </span>
                          )}
                          <span
                            className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                              isIncome
                                ? 'bg-green-100 text-green-700'
                                : isTransfer
                                ? 'bg-purple-100 text-purple-700'
                                : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {bill.type}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          {isTransfer ? (
                            <span className="flex items-center gap-1">
                              <span>{bill.account_name}</span>
                              <ArrowRightLeft size={10} className="text-slate-400" />
                              <span>{bill.to_account_name || 'Account'}</span>
                            </span>
                          ) : (
                            <span>{bill.account_name || 'Account'} • {bill.category_name || 'General'}</span>
                          )}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <span className={`text-base font-black tabular-nums font-mono ${
                          isIncome ? 'text-green-600' : 'text-red-500'
                        }`}>
                          {isIncome ? `+${formatCurrency(effAmt)}` : `-${formatCurrency(effAmt)}`}
                        </span>
                        {bill.is_instance_overridden && (
                          <div className="text-[10px] text-slate-400">
                            Reg: {formatCurrency(bill.amount)}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Middle Row: Schedule frequency & Due date */}
                    <div className="flex items-center justify-between text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                      <div className="flex items-center gap-1.5">
                        <Clock size={13} className={bill.effective_date && bill.effective_date !== bill.next_date ? 'text-blue-500' : 'text-slate-400'} />
                        <span className="font-semibold text-slate-800">
                          {formatDate(bill.effective_date || bill.next_date)}
                        </span>
                        {bill.effective_date && bill.effective_date !== bill.next_date && (
                          <span className="text-[10px] text-blue-600 font-medium">
                            (was {formatDate(bill.next_date)})
                          </span>
                        )}
                      </div>
                      <span className="capitalize font-semibold text-slate-500 text-[11px]">
                        {bill.frequency === 'once' ? 'One-Time' : bill.frequency}
                      </span>
                    </div>

                    {/* Bottom Row: Actions */}
                    <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => openPostModal(bill)}
                        className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors"
                      >
                        <CheckCircle2 size={13} />
                        <span>Post Now</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => startEditBill(bill)}
                        className="p-1.5 text-slate-500 hover:text-blue-600 rounded-xl hover:bg-slate-100 border border-slate-200 transition-colors"
                        title="Edit recurring series or upcoming instance"
                      >
                        <Edit2 size={13} />
                      </button>
                      {bill.is_instance_overridden && (
                        <button
                          type="button"
                          onClick={() => handleResetInstanceOverride(bill)}
                          className="p-1.5 text-slate-500 hover:text-amber-600 rounded-xl hover:bg-amber-50 border border-slate-200 transition-colors"
                          title="Reset upcoming instance"
                        >
                          <RotateCcw size={13} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => deleteBill(bill.id)}
                        className="p-1.5 text-slate-500 hover:text-red-500 rounded-xl hover:bg-red-50 border border-slate-200 transition-colors"
                        title="Delete Scheduled Bill Series"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop Bills Table */}
          <div className="hidden md:block flex-1 min-h-0 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-auto">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider shadow-xs">
                <tr className="divide-x divide-slate-200">
                  <th className="px-6 py-4 font-semibold">Payee / Description</th>
                  <th className="px-6 py-4 font-semibold">Account</th>
                  <th className="px-6 py-4 font-semibold">Category</th>
                  <th className="px-6 py-4 font-semibold">Frequency</th>
                  <th className="px-6 py-4 font-semibold">Next Due</th>
                  <th className="px-6 py-4 font-semibold text-right">Amount</th>
                  <th className="px-6 py-4 font-semibold text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-slate-400 italic">
                      Loading scheduled transactions...
                    </td>
                  </tr>
                ) : bills.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-slate-400 italic">
                      <div className="flex flex-col items-center gap-2">
                        <AlertCircle size={32} className="text-slate-300" />
                        <p>No scheduled transactions found. Start by scheduling a recurring bill or income!</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  bills.map((bill) => (
                    <tr key={bill.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 font-medium text-slate-800">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span>{bill.effective_payee || bill.payee || 'Unnamed'}</span>
                          {bill.is_instance_overridden && (
                            <span
                              className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 flex items-center gap-0.5"
                              title="The upcoming occurrence has custom edits"
                            >
                              <Sparkles size={10} />
                              Custom Instance
                            </span>
                          )}
                        </div>
                        <span
                          className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-bold uppercase ${
                            bill.type === 'income'
                              ? 'bg-green-100 text-green-700'
                              : bill.type === 'transfer'
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {bill.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        {bill.type === 'transfer' ? (
                          <span className="flex items-center gap-1.5">
                            <span>{bill.account_name}</span>
                            <ArrowRightLeft size={12} className="text-slate-400" />
                            <span>{bill.to_account_name || 'Account'}</span>
                          </span>
                        ) : (
                          bill.account_name || 'Account'
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                          {bill.category_name || 'General'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-500 capitalize">
                        {bill.frequency === 'once' ? (
                          <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            One-Time
                          </span>
                        ) : (
                          bill.frequency
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-600 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-medium text-slate-800">
                          <Clock
                            size={14}
                            className={
                              bill.effective_date && bill.effective_date !== bill.next_date
                                ? 'text-blue-500'
                                : 'text-slate-400'
                            }
                          />
                          <span>{formatDate(bill.effective_date || bill.next_date)}</span>
                        </div>
                        {bill.effective_date && bill.effective_date !== bill.next_date && (
                          <div className="text-[10px] text-blue-600 font-medium mt-0.5">
                            (was {formatDate(bill.next_date)})
                          </div>
                        )}
                      </td>
                      <td
                        className={`px-6 py-4 font-bold text-right tabular-nums ${
                          bill.type === 'income' ? 'text-green-600' : 'text-red-500'
                        }`}
                      >
                        <div>
                          {bill.type === 'income'
                            ? `+${formatCurrency(bill.effective_amount ?? bill.amount)}`
                            : `-${formatCurrency(bill.effective_amount ?? bill.amount)}`}
                        </div>
                        {bill.is_instance_overridden && (
                          <div className="text-[11px] font-normal text-slate-400">
                            Regular: {formatCurrency(bill.amount)}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => openPostModal(bill)}
                            className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors"
                            title="Review and record payment into Ledger"
                          >
                            <CheckCircle2 size={14} />
                            Post Now
                          </button>
                          <button
                            onClick={() => startEditBill(bill)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-slate-100 transition-colors"
                            title="Edit date, amount, or recurring series"
                          >
                            <Edit2 size={16} />
                          </button>
                          {bill.is_instance_overridden && (
                            <button
                              onClick={() => handleResetInstanceOverride(bill)}
                              className="p-1.5 text-slate-400 hover:text-amber-600 rounded-lg hover:bg-amber-50 transition-colors"
                              title="Reset upcoming instance back to series schedule & amount"
                            >
                              <RotateCcw size={16} />
                            </button>
                          )}
                          <button
                            onClick={() => deleteBill(bill.id)}
                            className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                            title="Delete Scheduled Bill Series"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default BillsPage;
