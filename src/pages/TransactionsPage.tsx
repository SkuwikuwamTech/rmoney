import { useState, useEffect, Fragment } from 'react';
import { getDb } from '../utils/db';
import { Transaction, Account, Category, TransactionRule } from '../types';
import { useRegionalSettings, getLocalTodayStr } from '../utils/currency';
import { getTransactionRules, matchRuleForTransaction } from '../utils/rulesEngine';
import {
  Search,
  Plus,
  Trash2,
  ArrowUpCircle,
  ArrowDownCircle,
  ArrowRightLeft,
  Filter,
  ShieldCheck,
  Scale,
  X,
  Split,
  Layers,
  ChevronDown,
  ChevronUp,
  Edit2,
  Paperclip,
} from 'lucide-react';
import ReceiptModal from '../components/ReceiptModal';

interface TransactionsPageProps {
  proStatus?: boolean;
  onTriggerUpgrade?: (reason: 'accounts_limit' | 'what_if_locked' | 'reports_locked' | 'general' | 'receipts_locked') => void;
  initialAccountId?: number | 'all';
}

const TransactionsPage = ({ proStatus = false, onTriggerUpgrade, initialAccountId = 'all' }: TransactionsPageProps) => {
  const { formatCurrency, formatDate, currency } = useRegionalSettings();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState<number | 'all'>(initialAccountId);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | 'all'>('all');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'uncleared' | 'cleared' | 'reconciled'>('all');
  const [viewingReceiptTx, setViewingReceiptTx] = useState<Transaction | null>(null);
  const [rules, setRules] = useState<TransactionRule[]>([]);

  // Reconciliation Modal State
  const [isReconciling, setIsReconciling] = useState(false);
  const [reconcileAccountId, setReconcileAccountId] = useState<number>(0);
  const [statementBalance, setStatementBalance] = useState<string>('');
  const [statementDate, setStatementDate] = useState<string>(() => getLocalTodayStr(0));
  const [tempCheckedIds, setTempCheckedIds] = useState<Set<number>>(new Set());

  // Quick toggle transaction status (uncleared -> cleared -> reconciled -> uncleared)
  const handleCycleStatus = async (tx: Transaction) => {
    const current = tx.status || 'uncleared';
    const next: 'uncleared' | 'cleared' | 'reconciled' =
      current === 'uncleared' ? 'cleared' : current === 'cleared' ? 'reconciled' : 'uncleared';

    try {
      const db = await getDb();
      await db.execute('UPDATE transactions SET status = ? WHERE id = ?', [next, tx.id]);
      setTransactions((prev) =>
        prev.map((item) => (item.id === tx.id ? { ...item, status: next } : item))
      );
    } catch (e) {
      console.error('Error updating transaction status:', e);
    }
  };

  const handleStartReconciliation = () => {
    const targetAccId = selectedAccountId !== 'all' ? selectedAccountId : accounts[0]?.id || 0;
    setReconcileAccountId(targetAccId);
    setStatementBalance('');
    setStatementDate(getLocalTodayStr(0));

    // Pre-check all already-cleared or reconciled items for this account
    const checked = new Set<number>();
    transactions
      .filter((t) => t.account_id === targetAccId && (t.status === 'cleared' || t.status === 'reconciled'))
      .forEach((t) => checked.add(t.id));
    setTempCheckedIds(checked);
    setIsReconciling(true);
  };

  const toggleReconcileCheck = (id: number) => {
    setTempCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleFinishReconciliation = async () => {
    try {
      const db = await getDb();
      // Mark all checked items as 'reconciled'
      for (const id of Array.from(tempCheckedIds)) {
        await db.execute("UPDATE transactions SET status = 'reconciled' WHERE id = ?", [id]);
      }
      setIsReconciling(false);
      await loadData();
    } catch (e) {
      console.error('Error saving reconciliation:', e);
      alert('Failed to save reconciliation.');
    }
  };

  // Add Form State
  const [isAdding, setIsAdding] = useState(false);
  const [txType, setTxType] = useState<'expense' | 'income' | 'transfer'>('expense');
  const [form, setForm] = useState({
    payee: '',
    amount: '',
    date: getLocalTodayStr(0),
    accountId: 0,
    toAccountId: 0,
    categoryId: 0,
    memo: '',
  });

  // Split Transactions State
  const [isSplit, setIsSplit] = useState(false);
  const [splits, setSplits] = useState<{ categoryId: number; amount: string; memo: string }[]>([
    { categoryId: 0, amount: '', memo: '' },
    { categoryId: 0, amount: '', memo: '' },
  ]);

  // Payee Autocomplete suggestions
  const [payeeSuggestions, setPayeeSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Expanded Splits Map for viewing in table
  const [expandedSplitsTxId, setExpandedSplitsTxId] = useState<number | null>(null);
  const [loadedSplits, setLoadedSplits] = useState<{ [txId: number]: { category_name: string; amount: number; memo: string }[] }>({});

  const handlePayeeChange = (value: string) => {
    const matchedRuleCatId = matchRuleForTransaction(value, form.memo, rules);
    setForm((prev) => ({
      ...prev,
      payee: value,
      categoryId: matchedRuleCatId || prev.categoryId,
    }));
    if (value.trim().length > 0) {
      // Find unique matching payees from transaction history
      const uniquePayees = Array.from(
        new Set(
          transactions
            .map((t) => t.payee)
            .filter((p) => p.toLowerCase().includes(value.toLowerCase()) && p.toLowerCase() !== value.toLowerCase())
        )
      ).slice(0, 5);

      setPayeeSuggestions(uniquePayees);
      setShowSuggestions(uniquePayees.length > 0);
    } else {
      setShowSuggestions(false);
    }
  };

  const selectPayeeSuggestion = (payeeName: string) => {
    // Also auto-suggest last used category for this payee
    const lastTx = transactions.find((t) => t.payee.toLowerCase() === payeeName.toLowerCase());
    setForm((prev) => ({
      ...prev,
      payee: payeeName,
      categoryId: lastTx?.category_id || prev.categoryId,
    }));
    setShowSuggestions(false);
  };

  const addSplitRow = () => {
    setSplits((prev) => [...prev, { categoryId: categories[0]?.id || 0, amount: '', memo: '' }]);
  };

  const removeSplitRow = (index: number) => {
    if (splits.length <= 2) return;
    setSplits((prev) => prev.filter((_, i) => i !== index));
  };

  const updateSplitRow = (index: number, field: 'categoryId' | 'amount' | 'memo', value: any) => {
    setSplits((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const loadTransactionSplits = async (txId: number) => {
    if (expandedSplitsTxId === txId) {
      setExpandedSplitsTxId(null);
      return;
    }
    try {
      const db = await getDb();
      const rows = (await db.select(
        `SELECT ts.amount, ts.memo, c.name as category_name
         FROM transaction_splits ts
         JOIN categories c ON ts.category_id = c.id
         WHERE ts.transaction_id = ?`,
        [txId]
      )) as { category_name: string; amount: number; memo: string }[];
      setLoadedSplits((prev) => ({ ...prev, [txId]: rows }));
      setExpandedSplitsTxId(txId);
    } catch (e) {
      console.error('Error loading transaction splits:', e);
    }
  };

  // Edit Transaction State
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [editForm, setEditForm] = useState({
    payee: '',
    amount: '',
    date: '',
    accountId: 0,
    categoryId: 0,
    memo: '',
    txType: 'expense' as 'expense' | 'income',
  });
  const [editIsSplit, setEditIsSplit] = useState(false);
  const [editSplits, setEditSplits] = useState<{ categoryId: number; amount: string; memo: string }[]>([]);
  const [editPayeeSuggestions, setEditPayeeSuggestions] = useState<string[]>([]);
  const [showEditSuggestions, setShowEditSuggestions] = useState(false);

  const handleStartEdit = async (tx: Transaction) => {
    setEditingTx(tx);
    const type: 'expense' | 'income' = tx.amount < 0 ? 'expense' : 'income';
    setEditForm({
      payee: tx.payee,
      amount: Math.abs(tx.amount).toFixed(2),
      date: tx.date,
      accountId: tx.account_id,
      categoryId: tx.category_id,
      memo: tx.memo || '',
      txType: type,
    });
    setShowEditSuggestions(false);

    // If transaction has splits, load them
    if (tx.split_count && tx.split_count > 0) {
      try {
        const db = await getDb();
        const rows = (await db.select(
          'SELECT category_id, amount, memo FROM transaction_splits WHERE transaction_id = ?',
          [tx.id]
        )) as { category_id: number; amount: number; memo: string }[];

        if (rows.length > 0) {
          setEditSplits(
            rows.map((r) => ({
              categoryId: r.category_id,
              amount: Math.abs(r.amount).toFixed(2),
              memo: r.memo || '',
            }))
          );
          setEditIsSplit(true);
        } else {
          setEditIsSplit(false);
          setEditSplits([
            { categoryId: tx.category_id, amount: '', memo: '' },
            { categoryId: tx.category_id, amount: '', memo: '' },
          ]);
        }
      } catch (err) {
        console.error('Error loading splits for edit:', err);
        setEditIsSplit(false);
      }
    } else {
      setEditIsSplit(false);
      setEditSplits([
        { categoryId: tx.category_id, amount: '', memo: '' },
        { categoryId: tx.category_id, amount: '', memo: '' },
      ]);
    }
  };

  const handleEditPayeeChange = (value: string) => {
    setEditForm((prev) => ({ ...prev, payee: value }));
    if (value.trim().length > 0) {
      const uniquePayees = Array.from(
        new Set(
          transactions
            .map((t) => t.payee)
            .filter((p) => p.toLowerCase().includes(value.toLowerCase()) && p.toLowerCase() !== value.toLowerCase())
        )
      ).slice(0, 5);

      setEditPayeeSuggestions(uniquePayees);
      setShowEditSuggestions(uniquePayees.length > 0);
    } else {
      setShowEditSuggestions(false);
    }
  };

  const selectEditPayeeSuggestion = (payeeName: string) => {
    const lastTx = transactions.find((t) => t.payee.toLowerCase() === payeeName.toLowerCase());
    setEditForm((prev) => ({
      ...prev,
      payee: payeeName,
      categoryId: lastTx?.category_id || prev.categoryId,
    }));
    setShowEditSuggestions(false);
  };

  const addEditSplitRow = () => {
    setEditSplits((prev) => [...prev, { categoryId: categories[0]?.id || 0, amount: '', memo: '' }]);
  };

  const removeEditSplitRow = (index: number) => {
    if (editSplits.length <= 2) return;
    setEditSplits((prev) => prev.filter((_, i) => i !== index));
  };

  const updateEditSplitRow = (index: number, field: 'categoryId' | 'amount' | 'memo', value: any) => {
    setEditSplits((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleSaveEdit = async () => {
    if (!editingTx) return;

    const numAmount = parseFloat(editForm.amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      alert('Please enter a valid positive amount.');
      return;
    }

    if (!editForm.payee.trim()) {
      alert('Please enter a payee or description.');
      return;
    }

    if (!editForm.accountId) {
      alert('Please select an account.');
      return;
    }

    const finalAmount = editForm.txType === 'expense' ? -Math.abs(numAmount) : Math.abs(numAmount);

    if (editIsSplit) {
      let splitTotal = 0;
      for (let i = 0; i < editSplits.length; i++) {
        const s = editSplits[i];
        const sAmt = parseFloat(s.amount);
        if (isNaN(sAmt) || sAmt <= 0) {
          alert(`Split line #${i + 1} must have a valid positive amount.`);
          return;
        }
        if (!s.categoryId) {
          alert(`Please select a category for split line #${i + 1}.`);
          return;
        }
        splitTotal += sAmt;
      }

      if (Math.abs(splitTotal - numAmount) > 0.01) {
        alert(
          `The sum of splits ($${splitTotal.toFixed(2)}) must equal the total amount ($${numAmount.toFixed(
            2
          )}). Difference: $${Math.abs(splitTotal - numAmount).toFixed(2)}`
        );
        return;
      }
    }

    try {
      const db = await getDb();

      // 1. Account balance adjustments:
      if (editingTx.account_id === editForm.accountId) {
        // Same account: difference between new finalAmount and old editingTx.amount
        const delta = finalAmount - editingTx.amount;
        if (delta !== 0) {
          await db.execute('UPDATE accounts SET balance = balance + ? WHERE id = ?', [
            delta,
            editForm.accountId,
          ]);
        }
      } else {
        // Account changed:
        // Revert old account balance
        await db.execute('UPDATE accounts SET balance = balance - ? WHERE id = ?', [
          editingTx.amount,
          editingTx.account_id,
        ]);
        // Apply new account balance
        await db.execute('UPDATE accounts SET balance = balance + ? WHERE id = ?', [
          finalAmount,
          editForm.accountId,
        ]);
      }

      // 2. Update transaction row
      const primaryCatId = editIsSplit
        ? editSplits[0].categoryId
        : editForm.categoryId || (categories.length > 0 ? categories[0].id : 1);

      await db.execute(
        `UPDATE transactions 
         SET account_id = ?, category_id = ?, date = ?, payee = ?, amount = ?, memo = ? 
         WHERE id = ?`,
        [
          editForm.accountId,
          primaryCatId,
          editForm.date,
          editForm.payee.trim(),
          finalAmount,
          editForm.memo || null,
          editingTx.id,
        ]
      );

      // 3. Handle splits:
      await db.execute('DELETE FROM transaction_splits WHERE transaction_id = ?', [editingTx.id]);

      if (editIsSplit) {
        for (const s of editSplits) {
          const sAmt =
            editForm.txType === 'expense'
              ? -Math.abs(parseFloat(s.amount))
              : Math.abs(parseFloat(s.amount));
          await db.execute(
            'INSERT INTO transaction_splits (transaction_id, category_id, amount, memo) VALUES (?, ?, ?, ?)',
            [editingTx.id, s.categoryId, sAmt, s.memo || '']
          );
        }
      }

      setEditingTx(null);
      await loadData();
    } catch (e) {
      console.error('Error saving edited transaction:', e);
      alert('Failed to save transaction changes.');
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const db = await getDb();
      const txs = (await db.select(
        `SELECT 
          t.id, 
          t.account_id, 
          t.category_id, 
          t.date, 
          t.payee, 
          t.amount, 
          t.memo, 
          COALESCE(t.status, 'cleared') as status,
          a.name as account_name, 
          c.name as category_name,
          (SELECT COUNT(*) FROM transaction_splits ts WHERE ts.transaction_id = t.id) as split_count,
          (SELECT COUNT(*) FROM transaction_attachments ta WHERE ta.transaction_id = t.id) as attachment_count
        FROM transactions t 
        JOIN accounts a ON t.account_id = a.id 
        LEFT JOIN categories c ON t.category_id = c.id 
        ORDER BY t.date DESC, t.id DESC`
      )) as Transaction[];

      const accs = (await db.select('SELECT * FROM accounts ORDER BY name ASC')) as Account[];
      const cats = (await db.select('SELECT * FROM categories ORDER BY name ASC')) as Category[];

      setTransactions(txs);
      setAccounts(accs);
      setCategories(cats);

      const currentRules = await getTransactionRules();
      setRules(currentRules);

      if (accs.length > 0 && form.accountId === 0) {
        setForm((prev) => ({
          ...prev,
          accountId: accs[0].id,
          toAccountId: accs.length > 1 ? accs[1].id : 0,
        }));
      }
      if (cats.length > 0 && form.categoryId === 0) {
        setForm((prev) => ({ ...prev, categoryId: cats[0].id }));
      }
    } catch (e) {
      console.error('Load data error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenAdd = (type: 'expense' | 'income' | 'transfer') => {
    setTxType(type);
    setIsAdding(true);
    setIsSplit(false);
    setShowSuggestions(false);
    const matchingCats = categories.filter((c) => (type === 'income' ? c.type === 'income' : c.type === 'expense'));
    const defaultCatId = matchingCats.length > 0 ? matchingCats[0].id : (categories[0]?.id || 0);
    setForm((prev) => ({
      ...prev,
      categoryId: defaultCatId,
    }));
    setSplits([
      { categoryId: defaultCatId, amount: '', memo: '' },
      { categoryId: defaultCatId, amount: '', memo: '' },
    ]);
  };

  const handleAddTransaction = async () => {
    const numAmount = parseFloat(form.amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      alert('Please enter a valid positive amount.');
      return;
    }

    if (!form.accountId) {
      alert('Please select an account.');
      return;
    }

    try {
      const db = await getDb();

      if (txType === 'transfer') {
        if (!form.toAccountId || form.toAccountId === form.accountId) {
          alert('Please select a different destination account.');
          return;
        }

        const fromAcc = accounts.find((a) => a.id === form.accountId);
        const toAcc = accounts.find((a) => a.id === form.toAccountId);
        const payeeOut = form.payee.trim()
          ? `${form.payee.trim()} (To: ${toAcc?.name || 'Account'})`
          : `Transfer to ${toAcc?.name || 'Account'}`;
        const payeeIn = form.payee.trim()
          ? `${form.payee.trim()} (From: ${fromAcc?.name || 'Account'})`
          : `Transfer from ${fromAcc?.name || 'Account'}`;

        const catId = form.categoryId || (categories.length > 0 ? categories[0].id : 1);

        // 1. Source account outflow
        await db.execute(
          'INSERT INTO transactions (account_id, category_id, date, payee, amount, memo) VALUES (?, ?, ?, ?, ?, ?)',
          [form.accountId, catId, form.date, payeeOut, -Math.abs(numAmount), form.memo]
        );
        await db.execute('UPDATE accounts SET balance = balance - ? WHERE id = ?', [
          Math.abs(numAmount),
          form.accountId,
        ]);

        // 2. Target account inflow
        await db.execute(
          'INSERT INTO transactions (account_id, category_id, date, payee, amount, memo) VALUES (?, ?, ?, ?, ?, ?)',
          [form.toAccountId, catId, form.date, payeeIn, Math.abs(numAmount), form.memo]
        );
        await db.execute('UPDATE accounts SET balance = balance + ? WHERE id = ?', [
          Math.abs(numAmount),
          form.toAccountId,
        ]);
      } else {
        if (!form.payee.trim()) {
          alert('Please enter a payee or description.');
          return;
        }

        const finalAmount = txType === 'expense' ? -Math.abs(numAmount) : Math.abs(numAmount);

        if (isSplit) {
          // Validate split lines
          let splitTotal = 0;
          for (let i = 0; i < splits.length; i++) {
            const s = splits[i];
            const sAmt = parseFloat(s.amount);
            if (isNaN(sAmt) || sAmt <= 0) {
              alert(`Split line #${i + 1} must have a valid positive amount.`);
              return;
            }
            if (!s.categoryId) {
              alert(`Please select a category for split line #${i + 1}.`);
              return;
            }
            splitTotal += sAmt;
          }

          if (Math.abs(splitTotal - numAmount) > 0.01) {
            alert(
              `The sum of splits ($${splitTotal.toFixed(2)}) must equal the total amount ($${numAmount.toFixed(
                2
              )}). Difference: $${Math.abs(splitTotal - numAmount).toFixed(2)}`
            );
            return;
          }

          // 1. Insert parent transaction (using first split category or primary)
          const primaryCatId = splits[0].categoryId || (categories.length > 0 ? categories[0].id : 1);
          const res = (await db.execute(
            'INSERT INTO transactions (account_id, category_id, date, payee, amount, memo) VALUES (?, ?, ?, ?, ?, ?)',
            [form.accountId, primaryCatId, form.date, form.payee.trim(), finalAmount, form.memo]
          )) as { lastInsertId?: number };

          const txId = res.lastInsertId;
          if (txId) {
            for (const s of splits) {
              const sAmt = txType === 'expense' ? -Math.abs(parseFloat(s.amount)) : Math.abs(parseFloat(s.amount));
              await db.execute(
                'INSERT INTO transaction_splits (transaction_id, category_id, amount, memo) VALUES (?, ?, ?, ?)',
                [txId, s.categoryId, sAmt, s.memo || '']
              );
            }
          }

          // 2. Update account balance
          await db.execute('UPDATE accounts SET balance = balance + ? WHERE id = ?', [
            finalAmount,
            form.accountId,
          ]);
        } else {
          const catId = form.categoryId || (categories.length > 0 ? categories[0].id : 1);

          // 1. Insert transaction
          await db.execute(
            'INSERT INTO transactions (account_id, category_id, date, payee, amount, memo) VALUES (?, ?, ?, ?, ?, ?)',
            [form.accountId, catId, form.date, form.payee.trim(), finalAmount, form.memo]
          );

          // 2. Update account balance
          await db.execute('UPDATE accounts SET balance = balance + ? WHERE id = ?', [
            finalAmount,
            form.accountId,
          ]);
        }
      }

      setIsAdding(false);
      setIsSplit(false);
      setShowSuggestions(false);
      setSplits([
        { categoryId: categories[0]?.id || 0, amount: '', memo: '' },
        { categoryId: categories[0]?.id || 0, amount: '', memo: '' },
      ]);
      setForm({
        payee: '',
        amount: '',
        date: getLocalTodayStr(0),
        accountId: accounts[0]?.id || 0,
        toAccountId: accounts.length > 1 ? accounts[1].id : 0,
        categoryId: categories[0]?.id || 0,
        memo: '',
      });
      await loadData();
    } catch (e) {
      console.error('Add transaction error:', e);
      alert('Failed to add transaction.');
    }
  };

  const handleDeleteTransaction = async (tx: Transaction) => {
    if (
      !confirm(
        `Are you sure you want to delete this transaction "${tx.payee}" for $${Math.abs(
          tx.amount
        ).toLocaleString()}? This will update the account balance.`
      )
    ) {
      return;
    }

    try {
      const db = await getDb();
      // Delete child splits first (if any)
      await db.execute('DELETE FROM transaction_splits WHERE transaction_id = ?', [tx.id]);
      // Revert balance effect
      await db.execute('UPDATE accounts SET balance = balance - ? WHERE id = ?', [
        tx.amount,
        tx.account_id,
      ]);
      await db.execute('DELETE FROM transactions WHERE id = ?', [tx.id]);
      await loadData();
    } catch (e) {
      console.error('Delete transaction error:', e);
      alert('Failed to delete transaction.');
    }
  };

  const filteredTransactions = transactions.filter((t) => {
    const matchesSearch =
      t.payee.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.memo && t.memo.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesAccount = selectedAccountId === 'all' || t.account_id === selectedAccountId;
    const matchesCategory = selectedCategoryId === 'all' || t.category_id === selectedCategoryId;
    const matchesStatus =
      selectedStatus === 'all' || (t.status || 'uncleared') === selectedStatus;
    return matchesSearch && matchesAccount && matchesCategory && matchesStatus;
  });

  const availableCategoriesForForm = categories.filter((c) =>
    txType === 'income' ? c.type === 'income' : c.type === 'expense'
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col space-y-8">
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Transaction History</h1>
          <p className="text-slate-500">All income, expenses, and transfers across your accounts</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleStartReconciliation}
            className="px-3 sm:px-4 py-1.5 sm:py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl transition-colors font-semibold flex items-center gap-1.5 text-xs sm:text-sm shadow-sm"
            title="Reconcile against your bank or card statement"
          >
            <Scale size={16} className="text-emerald-400" />
            <span>Reconcile</span>
          </button>
          <button
            onClick={() => handleOpenAdd('expense')}
            className="px-3 sm:px-4 py-1.5 sm:py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors font-semibold flex items-center gap-1.5 text-xs sm:text-sm shadow-sm"
          >
            <Plus size={16} />
            <span>Expense</span>
          </button>
          <button
            onClick={() => handleOpenAdd('income')}
            className="px-3 sm:px-4 py-1.5 sm:py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors font-semibold flex items-center gap-1.5 text-xs sm:text-sm shadow-sm"
          >
            <Plus size={16} />
            <span>Income</span>
          </button>
          <button
            onClick={() => handleOpenAdd('transfer')}
            className="px-3 sm:px-4 py-1.5 sm:py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700 transition-colors font-semibold flex items-center gap-1.5 text-xs sm:text-sm shadow-sm"
          >
            <ArrowRightLeft size={16} />
            <span>Transfer</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4 bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search payee or note..."
            className="pl-10 pr-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 w-full text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter size={16} className="text-slate-400" />
          <select
            className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium bg-white"
            value={selectedAccountId}
            onChange={(e) =>
              setSelectedAccountId(e.target.value === 'all' ? 'all' : parseInt(e.target.value))
            }
          >
            <option value="all">All Accounts ({accounts.length})</option>
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <select
            className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium bg-white"
            value={selectedCategoryId}
            onChange={(e) =>
              setSelectedCategoryId(e.target.value === 'all' ? 'all' : parseInt(e.target.value))
            }
          >
            <option value="all">All Categories ({categories.length})</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name} ({cat.type})
              </option>
            ))}
          </select>
        </div>

        <div>
          <select
            className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium bg-white"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value as any)}
          >
            <option value="all">All Statuses (C / R / Uncleared)</option>
            <option value="uncleared">Uncleared only</option>
            <option value="cleared">Cleared (C)</option>
            <option value="reconciled">Reconciled (R)</option>
          </select>
        </div>
      </div>

      {/* Inline Add Transaction Panel */}
      {isAdding && (
        <div className="bg-white p-6 rounded-2xl shadow-md border border-slate-200 animate-in slide-in-from-top-4 duration-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              {txType === 'expense' && <ArrowDownCircle className="text-red-500" size={20} />}
              {txType === 'income' && <ArrowUpCircle className="text-green-500" size={20} />}
              {txType === 'transfer' && <ArrowRightLeft className="text-purple-500" size={20} />}
              New {txType === 'expense' ? 'Expense' : txType === 'income' ? 'Income' : 'Transfer'}
            </h2>
            <div className="flex items-center gap-3">
              {txType !== 'transfer' && (
                <button
                  type="button"
                  onClick={() => {
                    const nextSplit = !isSplit;
                    setIsSplit(nextSplit);
                    if (nextSplit && splits[0].categoryId === 0) {
                      const defaultCatId = form.categoryId || categories[0]?.id || 0;
                      setSplits([
                        { categoryId: defaultCatId, amount: form.amount ? (parseFloat(form.amount) / 2).toFixed(2) : '', memo: '' },
                        { categoryId: defaultCatId, amount: form.amount ? (parseFloat(form.amount) - (parseFloat(form.amount) / 2)).toFixed(2) : '', memo: '' },
                      ]);
                    }
                  }}
                  className={`px-3 py-1 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all border ${
                    isSplit
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-white text-slate-600 hover:text-indigo-600 border-slate-200'
                  }`}
                  title="Split this transaction across multiple categories"
                >
                  <Split size={14} />
                  {isSplit ? 'Split Enabled' : 'Split Across Categories'}
                </button>
              )}
              <div className="flex gap-2 bg-slate-100 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => setTxType('expense')}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${
                    txType === 'expense' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  Expense
                </button>
                <button
                  type="button"
                  onClick={() => setTxType('income')}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${
                    txType === 'income' ? 'bg-white text-green-600 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  Income
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTxType('transfer');
                    setIsSplit(false);
                  }}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${
                    txType === 'transfer' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  Transfer
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase">
                {txType === 'transfer' ? 'From Account' : 'Account'}
              </label>
              <select
                className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm"
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

            {txType === 'transfer' ? (
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">To Account</label>
                <select
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  value={form.toAccountId}
                  onChange={(e) => setForm({ ...form, toAccountId: parseInt(e.target.value) })}
                >
                  <option value={0}>Select destination...</option>
                  {accounts
                    .filter((a) => a.id !== form.accountId)
                    .map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name}
                      </option>
                    ))}
                </select>
              </div>
            ) : isSplit ? (
              <div className="space-y-1">
                <label className="text-xs font-bold text-indigo-600 uppercase flex items-center gap-1">
                  <Split size={12} /> Category
                </label>
                <div className="px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-xl text-xs font-bold text-indigo-700 flex items-center justify-between">
                  <span>Multiple ({splits.length})</span>
                  <span className="text-[10px] bg-indigo-200 text-indigo-900 px-1.5 py-0.5 rounded-full">Split</span>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Category</label>
                <select
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  value={form.categoryId}
                  onChange={(e) => setForm({ ...form, categoryId: parseInt(e.target.value) })}
                >
                  {(availableCategoriesForForm.length > 0 ? availableCategoriesForForm : categories).map(
                    (cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    )
                  )}
                </select>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase">Date</label>
              <input
                type="date"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase">Amount ({currency.symbol.trim()})</label>
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

            <div className="space-y-1 relative">
              <label className="text-xs font-bold text-slate-500 uppercase">
                {txType === 'transfer' ? 'Payee / Note' : 'Payee'}
              </label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                value={form.payee}
                onChange={(e) => handlePayeeChange(e.target.value)}
                onFocus={() => {
                  if (form.payee.trim().length > 0 && payeeSuggestions.length > 0) {
                    setShowSuggestions(true);
                  }
                }}
                onBlur={() => {
                  // Short timeout so click can register
                  setTimeout(() => setShowSuggestions(false), 200);
                }}
                placeholder={txType === 'transfer' ? 'Optional description' : 'e.g. Grocery Store'}
                autoComplete="off"
              />
              {showSuggestions && payeeSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-30 py-1.5 overflow-hidden animate-in fade-in-50 zoom-in-95 duration-100">
                  <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50">
                    Suggested Payees
                  </div>
                  {payeeSuggestions.map((suggestion, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        selectPayeeSuggestion(suggestion);
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors flex items-center justify-between"
                    >
                      <span className="font-medium">{suggestion}</span>
                      <span className="text-xs text-slate-400 font-normal">Auto-fill category</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase">Memo / Note</label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                value={form.memo}
                onChange={(e) => setForm({ ...form, memo: e.target.value })}
                placeholder="Optional notes"
              />
            </div>

            {/* Split Lines Editor */}
            {isSplit && (
              <div className="md:col-span-3 lg:col-span-6 bg-indigo-50/60 p-4 rounded-2xl border border-indigo-100 space-y-3 mt-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers size={16} className="text-indigo-600" />
                    <h4 className="text-sm font-bold text-indigo-900">Category Split Breakdown</h4>
                  </div>
                  <div className="text-xs font-bold flex items-center gap-3">
                    <span className="text-slate-500">
                      Total Assigned:{' '}
                      <span className="font-mono text-slate-800">
                        ${splits.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0).toFixed(2)}
                      </span>
                    </span>
                    {(() => {
                      const totalAmt = parseFloat(form.amount) || 0;
                      const assignedAmt = splits.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
                      const diff = totalAmt - assignedAmt;
                      return (
                        <span
                          className={`px-2 py-0.5 rounded-md font-mono ${
                            Math.abs(diff) < 0.01
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {Math.abs(diff) < 0.01
                            ? 'Balanced'
                            : diff > 0
                            ? `$${diff.toFixed(2)} remaining`
                            : `$${Math.abs(diff).toFixed(2)} over limit`}
                        </span>
                      );
                    })()}
                  </div>
                </div>

                <div className="space-y-2">
                  {splits.map((split, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 bg-white p-2.5 rounded-xl border border-indigo-100 shadow-2xs"
                    >
                      <span className="text-xs font-bold text-slate-400 w-6 text-center">#{idx + 1}</span>
                      <div className="flex-1">
                        <select
                          className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-500"
                          value={split.categoryId}
                          onChange={(e) => updateSplitRow(idx, 'categoryId', parseInt(e.target.value))}
                        >
                          {(availableCategoriesForForm.length > 0 ? availableCategoriesForForm : categories).map(
                            (cat) => (
                              <option key={cat.id} value={cat.id}>
                                {cat.name}
                              </option>
                            )
                          )}
                        </select>
                      </div>
                      <div className="w-32">
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">
                            $
                          </span>
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            placeholder="0.00"
                            className="w-full pl-6 pr-2.5 py-1.5 border border-slate-200 rounded-lg text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-500"
                            value={split.amount}
                            onChange={(e) => updateSplitRow(idx, 'amount', e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="flex-1">
                        <input
                          type="text"
                          placeholder="Split memo (optional)"
                          className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                          value={split.memo}
                          onChange={(e) => updateSplitRow(idx, 'memo', e.target.value)}
                        />
                      </div>
                      {splits.length > 2 && (
                        <button
                          type="button"
                          onClick={() => removeSplitRow(idx)}
                          className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                          title="Remove split line"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={addSplitRow}
                    className="px-3 py-1.5 bg-white text-indigo-600 hover:bg-indigo-50 border border-indigo-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs"
                  >
                    <Plus size={14} /> Add Another Split Row
                  </button>

                  {(() => {
                    const totalAmt = parseFloat(form.amount) || 0;
                    const assignedAmt = splits.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
                    const diff = totalAmt - assignedAmt;
                    if (diff > 0.009) {
                      return (
                        <button
                          type="button"
                          onClick={() => {
                            const lastIdx = splits.length - 1;
                            const currentLastAmt = parseFloat(splits[lastIdx].amount) || 0;
                            updateSplitRow(lastIdx, 'amount', (currentLastAmt + diff).toFixed(2));
                          }}
                          className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 underline underline-offset-2"
                        >
                          Fill remaining (${diff.toFixed(2)}) into row #{splits.length}
                        </button>
                      );
                    }
                    return null;
                  })()}
                </div>
              </div>
            )}

            <div className="md:col-span-3 lg:col-span-6 flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="px-5 py-2 text-slate-600 hover:text-slate-800 font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddTransaction}
                className={`px-6 py-2 text-white rounded-xl font-bold transition-all shadow-md ${
                  txType === 'income'
                    ? 'bg-green-600 hover:bg-green-700'
                    : txType === 'transfer'
                    ? 'bg-purple-600 hover:bg-purple-700'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                Record {txType === 'income' ? 'Income' : txType === 'transfer' ? 'Transfer' : 'Expense'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Transactions Feed (< md) */}
      <div className="md:hidden space-y-2.5">
        {loading ? (
          <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-slate-400 text-sm italic">
            Loading transactions...
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-slate-400 text-sm italic">
            No transactions match your filters.
          </div>
        ) : (
          filteredTransactions.map((t) => {
            const status = t.status || 'uncleared';
            const hasSplits = Boolean(t.split_count && t.split_count > 0);
            const isExpanded = expandedSplitsTxId === t.id;

            return (
              <div
                key={t.id}
                className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs space-y-2.5"
              >
                {/* Top Row: Payee & Amount */}
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
                        t.amount < 0
                          ? 'bg-rose-50 text-rose-600'
                          : 'bg-emerald-50 text-emerald-600'
                      }`}
                    >
                      {t.amount < 0 ? (
                        <ArrowDownCircle size={20} />
                      ) : (
                        <ArrowUpCircle size={20} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 text-sm truncate flex items-center gap-1.5">
                        <span className="truncate">{t.payee}</span>
                        {Boolean(t.attachment_count && t.attachment_count > 0) && (
                          <button
                            onClick={() => setViewingReceiptTx(t)}
                            className="p-1 rounded text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 shrink-0"
                            title="Receipt attached"
                          >
                            <Paperclip size={11} />
                          </button>
                        )}
                      </p>
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5">
                        <span>{formatDate(t.date)}</span>
                        <span>&bull;</span>
                        <span className="truncate">{t.account_name}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span
                      className={`font-black tabular-nums text-base block ${
                        t.amount < 0 ? 'text-red-500' : 'text-emerald-600'
                      }`}
                    >
                      {formatCurrency(t.amount, { showSign: true })}
                    </span>
                    <button
                      onClick={() => handleCycleStatus(t)}
                      className={`mt-1 inline-flex items-center justify-center font-black text-[10px] px-2 py-0.5 rounded-md shadow-2xs ${
                        status === 'reconciled'
                          ? 'bg-blue-600 text-white'
                          : status === 'cleared'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-slate-100 text-slate-400 border border-slate-200'
                      }`}
                      title="Click to cycle status"
                    >
                      {status === 'reconciled' ? 'Reconciled' : status === 'cleared' ? 'Cleared' : 'Uncleared'}
                    </button>
                  </div>
                </div>

                {/* Bottom Row: Category & Quick Actions */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                  <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 truncate max-w-[140px]">
                      {t.category_name || 'General'}
                    </span>
                    {hasSplits && (
                      <button
                        type="button"
                        onClick={() => loadTransactionSplits(t.id)}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          isExpanded
                            ? 'bg-indigo-600 text-white'
                            : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                        }`}
                      >
                        <Split size={10} />
                        <span>{t.split_count} Splits</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleStartEdit(t)}
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Edit Transaction"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => handleDeleteTransaction(t)}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete Transaction"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Mobile Splits Dropdown */}
                {isExpanded && (
                  <div className="bg-indigo-50/50 p-2.5 rounded-xl border border-indigo-100 space-y-1.5 text-xs">
                    {(loadedSplits[t.id] || []).map((s, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-white p-2 rounded-lg border border-indigo-100/60">
                        <span className="font-medium text-slate-700">{s.category_name}</span>
                        <span className={`font-mono font-bold ${s.amount < 0 ? 'text-red-500' : 'text-green-600'}`}>
                          {formatCurrency(s.amount, { showSign: true })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Desktop Transactions Table (hidden on mobile, visible on md+) */}
      <div className="hidden md:block flex-1 min-h-0 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-auto">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider shadow-xs">
            <tr className="divide-x divide-slate-200">
              <th className="px-6 py-4 font-semibold">Date</th>
              <th className="px-6 py-4 font-semibold">Payee / Description</th>
              <th className="px-6 py-4 font-semibold">Category</th>
              <th className="px-6 py-4 font-semibold">Account</th>
              <th className="px-4 py-4 font-semibold text-center w-20">Status</th>
              <th className="px-6 py-4 font-semibold text-right">Amount</th>
              <th className="px-4 py-4 font-semibold text-center w-24">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-slate-400 italic">
                  Loading transactions...
                </td>
              </tr>
            ) : filteredTransactions.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-slate-400 italic">
                  No transactions match your filters.
                </td>
              </tr>
            ) : (
              filteredTransactions.map((t) => {
                const status = t.status || 'uncleared';
                const hasSplits = Boolean(t.split_count && t.split_count > 0);
                const isExpanded = expandedSplitsTxId === t.id;
                return (
                  <Fragment key={t.id}>
                    <tr className={`hover:bg-slate-50 transition-colors ${isExpanded ? 'bg-indigo-50/20' : ''}`}>
                      <td className="px-6 py-4 text-slate-600 whitespace-nowrap">{formatDate(t.date)}</td>
                      <td className="px-6 py-4 font-medium text-slate-800">
                        <div className="flex items-center gap-1.5">
                          <span>{t.payee}</span>
                          {Boolean(t.attachment_count && t.attachment_count > 0) && (
                            <button
                              onClick={() => setViewingReceiptTx(t)}
                              className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/80 inline-flex items-center gap-0.5 transition-colors cursor-pointer"
                              title={`${t.attachment_count} receipt(s) attached — click to view`}
                            >
                              <Paperclip size={10} />
                              <span>Receipt</span>
                            </button>
                          )}
                        </div>
                        {t.memo && <div className="text-xs text-slate-400 mt-0.5">{t.memo}</div>}
                      </td>
                      <td className="px-6 py-4 text-slate-600">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                            {t.category_name || 'General'}
                          </span>
                          {hasSplits && (
                            <button
                              type="button"
                              onClick={() => loadTransactionSplits(t.id)}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold transition-colors ${
                                isExpanded
                                  ? 'bg-indigo-600 text-white'
                                  : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200'
                              }`}
                              title="Toggle split category breakdown"
                            >
                              <Split size={12} />
                              {t.split_count} Splits
                              {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-600">{t.account_name}</td>
                      <td className="px-4 py-4 text-center">
                        <button
                          onClick={() => handleCycleStatus(t)}
                          className={`inline-flex items-center justify-center font-black text-xs px-2.5 py-1 rounded-lg transition-transform active:scale-95 shadow-2xs ${
                            status === 'reconciled'
                              ? 'bg-blue-600 text-white hover:bg-blue-700'
                              : status === 'cleared'
                              ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border border-emerald-300'
                              : 'bg-slate-100 text-slate-400 hover:bg-slate-200 border border-slate-200'
                          }`}
                          title={`Status: ${status.toUpperCase()} (Click to cycle Uncleared -> Cleared -> Reconciled)`}
                        >
                          {status === 'reconciled' ? 'R' : status === 'cleared' ? 'C' : '—'}
                        </button>
                      </td>
                      <td
                        className={`px-6 py-4 text-right font-bold tabular-nums ${
                          t.amount < 0 ? 'text-red-500' : 'text-green-600'
                        }`}
                      >
                        {formatCurrency(t.amount, { showSign: true })}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => setViewingReceiptTx(t)}
                            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                              Boolean(t.attachment_count && t.attachment_count > 0)
                                ? 'text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/60'
                                : 'text-slate-300 hover:text-slate-600 hover:bg-slate-100'
                            }`}
                            title={
                              Boolean(t.attachment_count && t.attachment_count > 0)
                                ? `View Receipt (${t.attachment_count} attached)`
                                : 'Attach Receipt / Invoice'
                            }
                          >
                            <Paperclip size={15} />
                          </button>
                          <button
                            onClick={() => handleStartEdit(t)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
                            title="Edit Transaction"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDeleteTransaction(t)}
                            className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                            title="Delete Transaction"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-indigo-50/40 border-y border-indigo-100">
                        <td colSpan={7} className="px-8 py-3.5">
                          <div className="space-y-2">
                            <div className="text-xs font-bold text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                              <Layers size={14} className="text-indigo-600" />
                              Split Breakdown ({loadedSplits[t.id]?.length || 0} categories)
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                              {(loadedSplits[t.id] || []).map((s, idx) => (
                                <div
                                   key={idx}
                                   className="bg-white p-2.5 rounded-xl border border-indigo-100 shadow-2xs flex items-center justify-between text-xs"
                                >
                                  <div>
                                    <span className="font-bold text-slate-700">{s.category_name}</span>
                                    {s.memo && <span className="text-slate-400 block text-[11px] mt-0.5">{s.memo}</span>}
                                  </div>
                                  <span
                                    className={`font-mono font-bold tabular-nums ${
                                      s.amount < 0 ? 'text-red-500' : 'text-green-600'
                                    }`}
                                  >
                                    {formatCurrency(s.amount, { showSign: true })}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Reconciliation Modal */}
      {isReconciling && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 w-full max-w-2xl shadow-2xl space-y-6 animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-2xl">
                  <Scale size={22} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-800">Reconcile Account</h2>
                  <p className="text-xs text-slate-500">
                    Match cleared transactions against your official bank or card statement
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsReconciling(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100"
              >
                <X size={20} />
              </button>
            </div>

            {/* Account & Statement Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Target Account</label>
                <select
                  value={reconcileAccountId}
                  onChange={(e) => {
                    const id = parseInt(e.target.value);
                    setReconcileAccountId(id);
                    const checked = new Set<number>();
                    transactions
                      .filter((t) => t.account_id === id && (t.status === 'cleared' || t.status === 'reconciled'))
                      .forEach((t) => checked.add(t.id));
                    setTempCheckedIds(checked);
                  }}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white text-sm outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Statement Date</label>
                <input
                  type="date"
                  value={statementDate}
                  onChange={(e) => setStatementDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white text-sm outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Statement Ending Balance ({currency.symbol.trim()})</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="e.g. 4850.25"
                  value={statementBalance}
                  onChange={(e) => setStatementBalance(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white text-sm outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                />
              </div>
            </div>

            {/* Reconciliation Balance Math Bar */}
            {(() => {
              const account = accounts.find((a) => a.id === reconcileAccountId);
              const targetStatementAmt = parseFloat(statementBalance) || 0;
              const accountTransactions = transactions.filter((t) => t.account_id === reconcileAccountId);
              const clearedTotal = accountTransactions
                .filter((t) => tempCheckedIds.has(t.id))
                .reduce((sum, t) => sum + t.amount, 0);
              const diff = statementBalance !== '' ? clearedTotal - targetStatementAmt : 0;
              const isBalanced = statementBalance !== '' && Math.abs(diff) < 0.01;

              return (
                <div className="bg-slate-900 text-white p-4 rounded-2xl flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <span className="text-xs text-slate-400 block font-semibold uppercase">Account Balance</span>
                    <span className="text-lg font-bold tabular-nums text-slate-200">
                      {formatCurrency(account?.balance || 0)}
                    </span>
                  </div>

                  <div>
                    <span className="text-xs text-slate-400 block font-semibold uppercase">Cleared Total</span>
                    <span className="text-lg font-bold tabular-nums text-emerald-400">
                      {formatCurrency(clearedTotal)}
                    </span>
                  </div>

                  <div>
                    <span className="text-xs text-slate-400 block font-semibold uppercase">Difference</span>
                    <span
                      className={`text-xl font-black tabular-nums ${
                        statementBalance === ''
                          ? 'text-slate-400'
                          : isBalanced
                          ? 'text-emerald-400'
                          : 'text-amber-400'
                      }`}
                    >
                      {statementBalance === ''
                        ? 'Enter balance'
                        : isBalanced
                        ? `${formatCurrency(0)} (Balanced!)`
                        : formatCurrency(diff, { showSign: true })}
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Transaction Checklist */}
            <div className="flex-1 overflow-y-auto space-y-2 max-h-64 pr-1">
              {transactions.filter((t) => t.account_id === reconcileAccountId).length === 0 ? (
                <p className="text-center text-xs text-slate-400 italic py-6">
                  No transactions recorded for this account.
                </p>
              ) : (
                transactions
                  .filter((t) => t.account_id === reconcileAccountId)
                  .map((t) => {
                    const isChecked = tempCheckedIds.has(t.id);
                    return (
                      <div
                        key={t.id}
                        onClick={() => toggleReconcileCheck(t.id)}
                        className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                          isChecked
                            ? 'bg-emerald-50/60 border-emerald-300'
                            : 'bg-white border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}} // handled by div click
                            className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                          />
                          <div>
                            <p className="font-semibold text-slate-800 text-sm">{t.payee}</p>
                            <p className="text-xs text-slate-400">
                              {t.date} • {t.category_name || 'General'}
                            </p>
                          </div>
                        </div>
                        <span
                          className={`font-bold tabular-nums text-sm ${
                            t.amount < 0 ? 'text-red-500' : 'text-green-600'
                          }`}
                        >
                          {formatCurrency(t.amount, { showSign: true })}
                        </span>
                      </div>
                    );
                  })
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between border-t border-slate-100 pt-4">
              <span className="text-xs text-slate-500">
                {tempCheckedIds.size} transactions marked as cleared
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsReconciling(false)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800 text-sm font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleFinishReconciliation}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm transition-all shadow-md flex items-center gap-2"
                >
                  <ShieldCheck size={18} />
                  <span>Finish & Reconcile</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Edit Transaction Modal */}
      {editingTx && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 w-full max-w-2xl shadow-2xl space-y-6 animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-50 text-blue-600 rounded-2xl">
                  <Edit2 size={22} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-800">Edit Transaction</h2>
                  <p className="text-xs text-slate-500">Update transaction details, category, or splits</p>
                </div>
              </div>
              <button
                onClick={() => setEditingTx(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100"
              >
                <X size={20} />
              </button>
            </div>

            {/* Type selector & Split toggle */}
            <div className="flex items-center justify-between">
              <div className="flex gap-2 bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setEditForm((prev) => ({ ...prev, txType: 'expense' }))}
                  className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                    editForm.txType === 'expense' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  Expense
                </button>
                <button
                  type="button"
                  onClick={() => setEditForm((prev) => ({ ...prev, txType: 'income' }))}
                  className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                    editForm.txType === 'income' ? 'bg-white text-green-600 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  Income
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  const next = !editIsSplit;
                  setEditIsSplit(next);
                  if (next && editSplits.length === 0) {
                    const defaultCatId = editForm.categoryId || categories[0]?.id || 0;
                    setEditSplits([
                      {
                        categoryId: defaultCatId,
                        amount: editForm.amount ? (parseFloat(editForm.amount) / 2).toFixed(2) : '',
                        memo: '',
                      },
                      {
                        categoryId: defaultCatId,
                        amount: editForm.amount
                          ? (parseFloat(editForm.amount) - parseFloat(editForm.amount) / 2).toFixed(2)
                          : '',
                        memo: '',
                      },
                    ]);
                  }
                }}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all border ${
                  editIsSplit
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'bg-white text-slate-600 hover:text-indigo-600 border-slate-200'
                }`}
              >
                <Split size={14} />
                {editIsSplit ? 'Split Enabled' : 'Split Across Categories'}
              </button>
            </div>

            {/* Main Fields Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Account</label>
                <select
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium bg-white"
                  value={editForm.accountId}
                  onChange={(e) => setEditForm({ ...editForm, accountId: parseInt(e.target.value) })}
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Date</label>
                <input
                  type="date"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  value={editForm.date}
                  onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Amount ({currency.symbol.trim()})</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-semibold"
                  value={editForm.amount}
                  onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>

              {editIsSplit ? (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-indigo-600 uppercase flex items-center gap-1">
                    <Split size={12} /> Category
                  </label>
                  <div className="px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-xl text-xs font-bold text-indigo-700 flex items-center justify-between">
                    <span>Multiple ({editSplits.length})</span>
                    <span className="text-[10px] bg-indigo-200 text-indigo-900 px-1.5 py-0.5 rounded-full">
                      Split
                    </span>
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Category</label>
                  <select
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium bg-white"
                    value={editForm.categoryId}
                    onChange={(e) => setEditForm({ ...editForm, categoryId: parseInt(e.target.value) })}
                  >
                    {categories
                      .filter((c) =>
                        editForm.txType === 'income' ? c.type === 'income' : c.type === 'expense'
                      )
                      .map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              <div className="space-y-1 relative md:col-span-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Payee / Description</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  value={editForm.payee}
                  onChange={(e) => handleEditPayeeChange(e.target.value)}
                  onFocus={() => {
                    if (editForm.payee.trim().length > 0 && editPayeeSuggestions.length > 0) {
                      setShowEditSuggestions(true);
                    }
                  }}
                  onBlur={() => {
                    setTimeout(() => setShowEditSuggestions(false), 200);
                  }}
                  placeholder="e.g. Grocery Store"
                  autoComplete="off"
                />
                {showEditSuggestions && editPayeeSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-30 py-1.5 overflow-hidden animate-in fade-in-50 zoom-in-95 duration-100">
                    <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50">
                      Suggested Payees
                    </div>
                    {editPayeeSuggestions.map((suggestion, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectEditPayeeSuggestion(suggestion);
                        }}
                        className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors flex items-center justify-between"
                      >
                        <span className="font-medium">{suggestion}</span>
                        <span className="text-xs text-slate-400 font-normal">Auto-fill category</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1 md:col-span-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Memo / Note</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  value={editForm.memo}
                  onChange={(e) => setEditForm({ ...editForm, memo: e.target.value })}
                  placeholder="Optional notes"
                />
              </div>
            </div>

            {/* Split Lines Editor if isSplit is true */}
            {editIsSplit && (
              <div className="bg-indigo-50/60 p-4 rounded-2xl border border-indigo-100 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers size={16} className="text-indigo-600" />
                    <h4 className="text-sm font-bold text-indigo-900">Category Split Breakdown</h4>
                  </div>
                  <div className="text-xs font-bold flex items-center gap-3">
                    <span className="text-slate-500">
                      Total Assigned:{' '}
                      <span className="font-mono text-slate-800">
                        ${editSplits.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0).toFixed(2)}
                      </span>
                    </span>
                    {(() => {
                      const totalAmt = parseFloat(editForm.amount) || 0;
                      const assignedAmt = editSplits.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
                      const diff = totalAmt - assignedAmt;
                      return (
                        <span
                          className={`px-2 py-0.5 rounded-md font-mono ${
                            Math.abs(diff) < 0.01
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {Math.abs(diff) < 0.01
                            ? 'Balanced'
                            : diff > 0
                            ? `$${diff.toFixed(2)} remaining`
                            : `$${Math.abs(diff).toFixed(2)} over limit`}
                        </span>
                      );
                    })()}
                  </div>
                </div>

                <div className="space-y-2">
                  {editSplits.map((split, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 bg-white p-2.5 rounded-xl border border-indigo-100 shadow-2xs"
                    >
                      <span className="text-xs font-bold text-slate-400 w-6 text-center">#{idx + 1}</span>
                      <div className="flex-1">
                        <select
                          className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-500"
                          value={split.categoryId}
                          onChange={(e) => updateEditSplitRow(idx, 'categoryId', parseInt(e.target.value))}
                        >
                          {categories
                            .filter((c) =>
                              editForm.txType === 'income' ? c.type === 'income' : c.type === 'expense'
                            )
                            .map((cat) => (
                              <option key={cat.id} value={cat.id}>
                                {cat.name}
                              </option>
                            ))}
                        </select>
                      </div>
                      <div className="w-32">
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">
                            $
                          </span>
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            placeholder="0.00"
                            className="w-full pl-6 pr-2.5 py-1.5 border border-slate-200 rounded-lg text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-500"
                            value={split.amount}
                            onChange={(e) => updateEditSplitRow(idx, 'amount', e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="flex-1">
                        <input
                          type="text"
                          placeholder="Split memo (optional)"
                          className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                          value={split.memo}
                          onChange={(e) => updateEditSplitRow(idx, 'memo', e.target.value)}
                        />
                      </div>
                      {editSplits.length > 2 && (
                        <button
                          type="button"
                          onClick={() => removeEditSplitRow(idx)}
                          className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                          title="Remove split line"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={addEditSplitRow}
                    className="px-3 py-1.5 bg-white text-indigo-600 hover:bg-indigo-50 border border-indigo-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs"
                  >
                    <Plus size={14} /> Add Another Split Row
                  </button>

                  {(() => {
                    const totalAmt = parseFloat(editForm.amount) || 0;
                    const assignedAmt = editSplits.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
                    const diff = totalAmt - assignedAmt;
                    if (diff > 0.009) {
                      return (
                        <button
                          type="button"
                          onClick={() => {
                            const lastIdx = editSplits.length - 1;
                            const currentLastAmt = parseFloat(editSplits[lastIdx].amount) || 0;
                            updateEditSplitRow(lastIdx, 'amount', (currentLastAmt + diff).toFixed(2));
                          }}
                          className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 underline underline-offset-2"
                        >
                          Fill remaining (${diff.toFixed(2)}) into row #{editSplits.length}
                        </button>
                      );
                    }
                    return null;
                  })()}
                </div>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setEditingTx(null)}
                className="px-5 py-2.5 text-slate-600 hover:text-slate-800 font-semibold rounded-xl hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md transition-all flex items-center gap-2"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Receipt & Document Viewer Modal */}
      <ReceiptModal
        isOpen={Boolean(viewingReceiptTx)}
        onClose={() => setViewingReceiptTx(null)}
        transactionId={viewingReceiptTx?.id}
        payee={viewingReceiptTx?.payee}
        date={viewingReceiptTx?.date}
        amount={viewingReceiptTx?.amount}
        onAttachmentChanged={loadData}
        proStatus={proStatus}
        onTriggerUpgrade={onTriggerUpgrade}
      />
    </div>
  );
};

export default TransactionsPage;
