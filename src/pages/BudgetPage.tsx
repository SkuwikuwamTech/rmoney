import { useState, useEffect, useMemo } from 'react';
import {
  Target,
  ChevronLeft,
  ChevronRight,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Edit2,
  Check,
  X,
  SlidersHorizontal,
  Search,
  Sparkles,
  Calendar,
  Receipt,
} from 'lucide-react';
import { getDb } from '../utils/db';
import { Category, CategoryBudgetProgress } from '../types';
import { useRegionalSettings } from '../utils/currency';

interface RawTxForBudget {
  id: number;
  category_id: number;
  amount: number;
  date: string;
  payee: string;
  memo?: string;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const BudgetPage = () => {
  const { formatCurrency, currency } = useRegionalSettings();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // Month selector (defaults to current year and month)
  const today = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(today.getMonth()); // 0-indexed

  // Transactions in the selected month
  const [monthTxs, setMonthTxs] = useState<RawTxForBudget[]>([]);
  const [splitMap, setSplitMap] = useState<{ [txId: number]: { category_id: number; amount: number; memo?: string }[] }>({});

  // Inline editing state for a category's monthly budget
  const [editingCatId, setEditingCatId] = useState<number | null>(null);
  const [editingBudgetVal, setEditingBudgetVal] = useState<string>('');

  // Bulk Target Editor Modal
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkBudgets, setBulkBudgets] = useState<{ [catId: number]: string }>({});
  const [bulkSearch, setBulkSearch] = useState('');

  // Category Detail Modal State (Drill-down)
  const [selectedCategoryDetail, setSelectedCategoryDetail] = useState<CategoryBudgetProgress | null>(null);

  // Filter & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'over_budget' | 'under_budget' | 'unbudgeted'>('all');
  const [sortBy, setSortBy] = useState<'percent_desc' | 'spent_desc' | 'name_asc' | 'remaining_asc'>('percent_desc');

  // Success / Info toast
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const showFeedback = (msg: string) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  // Keyboard shortcut listener to close modals dynamically on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedCategoryDetail) setSelectedCategoryDetail(null);
        else if (isBulkModalOpen) setIsBulkModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedCategoryDetail, isBulkModalOpen]);

  // Check if viewing current real month
  const isCurrentMonth = selectedYear === today.getFullYear() && selectedMonth === today.getMonth();

  // Load Categories & Month Data
  const loadData = async () => {
    setLoading(true);
    try {
      const db = await getDb();
      const allCats = (await db.select(
        'SELECT id, name, type, parent_id, COALESCE(monthly_budget, 0) as monthly_budget FROM categories ORDER BY name ASC'
      )) as Category[];
      setCategories(allCats);

      // Compute start and end date strings for selected month
      const startStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`;
      // Last day of month
      const lastDay = new Date(selectedYear, selectedMonth + 1, 0).getDate();
      const endStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      // Query transactions in this month
      const txs = (await db.select(
        `SELECT id, category_id, amount, date, payee, COALESCE(memo, '') as memo
         FROM transactions 
         WHERE date >= ? AND date <= ?`,
        [startStr, endStr]
      )) as RawTxForBudget[];
      setMonthTxs(txs);

      // Query splits for transactions in this month
      try {
        const splits = (await db.select(
          `SELECT ts.transaction_id, ts.category_id, ts.amount, COALESCE(ts.memo, '') as memo
           FROM transaction_splits ts
           JOIN transactions t ON ts.transaction_id = t.id
           WHERE t.date >= ? AND t.date <= ?`,
          [startStr, endStr]
        )) as { transaction_id: number; category_id: number; amount: number; memo?: string }[];

        const map: { [txId: number]: { category_id: number; amount: number; memo?: string }[] } = {};
        for (const s of splits) {
          if (!map[s.transaction_id]) map[s.transaction_id] = [];
          map[s.transaction_id].push({ category_id: s.category_id, amount: s.amount, memo: s.memo });
        }
        setSplitMap(map);
      } catch (e) {
        console.warn('Could not query splits for budget:', e);
      }
    } catch (err) {
      console.error('Error loading budget data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedYear, selectedMonth]);

  // Navigate months
  const handlePrevMonth = () => {
    if (selectedMonth === 0) {
      setSelectedYear((y) => y - 1);
      setSelectedMonth(11);
    } else {
      setSelectedMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedYear((y) => y + 1);
      setSelectedMonth(0);
    } else {
      setSelectedMonth((m) => m + 1);
    }
  };

  const handleJumpCurrentMonth = () => {
    setSelectedYear(today.getFullYear());
    setSelectedMonth(today.getMonth());
  };

  // Calculate actual spending per category for this month
  const categorySpendingMap = useMemo(() => {
    const spending: { [catId: number]: number } = {};

    for (const tx of monthTxs) {
      // Exclude transfers
      if (tx.payee.startsWith('Transfer to ') || tx.payee.startsWith('Transfer from ')) {
        continue;
      }

      // If tx has splits, attribute amounts to the respective split categories
      const splits = splitMap[tx.id];
      if (splits && splits.length > 0) {
        for (const sp of splits) {
          if (sp.amount < 0) {
            spending[sp.category_id] = (spending[sp.category_id] || 0) + Math.abs(sp.amount);
          }
        }
      } else {
        // Normal single transaction
        if (tx.amount < 0) {
          spending[tx.category_id] = (spending[tx.category_id] || 0) + Math.abs(tx.amount);
        }
      }
    }

    return spending;
  }, [monthTxs, splitMap]);

  // Aggregate Category Budget Progress
  const budgetList: CategoryBudgetProgress[] = useMemo(() => {
    // Only include expense categories
    const expenseCats = categories.filter((c) => c.type === 'expense');

    return expenseCats.map((cat) => {
      const budget = cat.monthly_budget || 0;
      const spent = categorySpendingMap[cat.id] || 0;
      const remaining = budget - spent;
      const percentage = budget > 0 ? (spent / budget) * 100 : spent > 0 ? 100 : 0;
      const is_over_budget = budget > 0 && spent > budget;

      return {
        category_id: cat.id,
        category_name: cat.name,
        category_type: 'expense',
        monthly_budget: budget,
        spent,
        remaining,
        percentage,
        is_over_budget,
      };
    });
  }, [categories, categorySpendingMap]);

  // Summary Metrics
  const summary = useMemo(() => {
    const budgetedItems = budgetList.filter((b) => b.monthly_budget > 0);
    const totalBudget = budgetedItems.reduce((sum, b) => sum + b.monthly_budget, 0);
    const totalSpent = budgetList.reduce((sum, b) => sum + b.spent, 0);
    const totalRemaining = totalBudget - totalSpent;
    const overallPct = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;
    const overBudgetCount = budgetList.filter((b) => b.is_over_budget).length;

    return {
      totalBudget,
      totalSpent,
      totalRemaining,
      overallPct,
      overBudgetCount,
      budgetedCount: budgetedItems.length,
      unbudgetedCount: budgetList.filter((b) => b.monthly_budget === 0 && b.spent > 0).length,
    };
  }, [budgetList]);

  // Save inline category budget target
  const handleSaveBudget = async (catId: number) => {
    const parsed = parseFloat(editingBudgetVal);
    const newBudget = isNaN(parsed) || parsed < 0 ? 0 : parsed;

    try {
      const db = await getDb();
      await db.execute('UPDATE categories SET monthly_budget = ? WHERE id = ?', [newBudget, catId]);
      setCategories((prev) =>
        prev.map((c) => (c.id === catId ? { ...c, monthly_budget: newBudget } : c))
      );
      setEditingCatId(null);
      showFeedback('Monthly budget target updated!');
    } catch (err) {
      console.error('Failed to update budget:', err);
    }
  };

  // Open Bulk Target Editor Modal
  const openBulkEditor = () => {
    const initialVals: { [catId: number]: string } = {};
    for (const cat of categories.filter((c) => c.type === 'expense')) {
      initialVals[cat.id] = (cat.monthly_budget || 0) > 0 ? String(cat.monthly_budget) : '';
    }
    setBulkBudgets(initialVals);
    setBulkSearch('');
    setIsBulkModalOpen(true);
  };

  // Transactions belonging to the currently inspected category in detail modal
  const categoryTransactions = useMemo(() => {
    if (!selectedCategoryDetail) return [];
    const catId = selectedCategoryDetail.category_id;
    const list: { key: string; id: number; payee: string; amount: number; date: string; memo?: string; isSplit: boolean }[] = [];

    for (const tx of monthTxs) {
      if (tx.payee.startsWith('Transfer to ') || tx.payee.startsWith('Transfer from ')) {
        continue;
      }
      const splits = splitMap[tx.id];
      if (splits && splits.length > 0) {
        splits.forEach((sp, idx) => {
          if (sp.category_id === catId && sp.amount < 0) {
            list.push({
              key: `${tx.id}-split-${idx}`,
              id: tx.id,
              payee: tx.payee,
              amount: sp.amount,
              date: tx.date,
              memo: sp.memo || tx.memo,
              isSplit: true,
            });
          }
        });
      } else if (tx.category_id === catId && tx.amount < 0) {
        list.push({
          key: `${tx.id}`,
          id: tx.id,
          payee: tx.payee,
          amount: tx.amount,
          date: tx.date,
          memo: tx.memo,
          isSplit: false,
        });
      }
    }
    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [selectedCategoryDetail, monthTxs, splitMap]);

  // Save Bulk Target Editor
  const handleSaveBulkEditor = async () => {
    try {
      const db = await getDb();
      const updatedCats = [...categories];

      for (const cat of updatedCats.filter((c) => c.type === 'expense')) {
        const val = bulkBudgets[cat.id];
        const num = val !== undefined && val !== '' ? parseFloat(val) : 0;
        const cleanNum = isNaN(num) || num < 0 ? 0 : num;

        await db.execute('UPDATE categories SET monthly_budget = ? WHERE id = ?', [cleanNum, cat.id]);
        cat.monthly_budget = cleanNum;
      }

      setCategories(updatedCats);
      setIsBulkModalOpen(false);
      showFeedback('All monthly budget targets successfully saved!');
    } catch (err) {
      console.error('Failed to save bulk budgets:', err);
    }
  };

  // Filter and Sort budget list
  const filteredList = useMemo(() => {
    return budgetList
      .filter((item) => {
        // Search filter
        if (searchQuery.trim() && !item.category_name.toLowerCase().includes(searchQuery.toLowerCase())) {
          return false;
        }

        // Mode filter
        if (filterMode === 'over_budget') {
          return item.is_over_budget;
        }
        if (filterMode === 'under_budget') {
          return item.monthly_budget > 0 && !item.is_over_budget;
        }
        if (filterMode === 'unbudgeted') {
          return item.monthly_budget === 0;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'percent_desc') {
          return b.percentage - a.percentage;
        }
        if (sortBy === 'spent_desc') {
          return b.spent - a.spent;
        }
        if (sortBy === 'name_asc') {
          return a.category_name.localeCompare(b.category_name);
        }
        if (sortBy === 'remaining_asc') {
          return a.remaining - b.remaining;
        }
        return 0;
      });
  }, [budgetList, searchQuery, filterMode, sortBy]);

  // Days in month calculation for pacing
  const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
  const currentDay = isCurrentMonth ? today.getDate() : daysInMonth;
  const monthElapsedPct = (currentDay / daysInMonth) * 100;

  return (
    <div className="space-y-8 w-full max-w-7xl mx-auto pb-12">
      {/* Toast Notification */}
      {feedbackMsg && (
        <div className="fixed top-6 right-6 z-50 bg-emerald-600 text-white px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 text-sm font-semibold animate-in fade-in slide-in-from-top-3 duration-200">
          <CheckCircle size={18} />
          <span>{feedbackMsg}</span>
        </div>
      )}

      {/* Header & Month Navigator */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-3xl font-bold text-slate-800">Monthly Budget</h1>
            <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
              Live Tracker
            </span>
          </div>
          <p className="text-slate-500 text-sm mt-0.5">
            Assign monthly category limits and monitor your spending trajectory in real time
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Month Selector Bar */}
          <div className="flex items-center bg-white border border-slate-200 rounded-2xl p-1 shadow-xs">
            <button
              onClick={handlePrevMonth}
              title="Previous Month"
              className="p-2 hover:bg-slate-100 rounded-xl text-slate-600 transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="px-3 py-1 text-center min-w-[140px]">
              <span className="font-bold text-slate-800 text-sm block">
                {MONTH_NAMES[selectedMonth]} {selectedYear}
              </span>
            </div>
            <button
              onClick={handleNextMonth}
              title="Next Month"
              className="p-2 hover:bg-slate-100 rounded-xl text-slate-600 transition-colors"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {!isCurrentMonth && (
            <button
              onClick={handleJumpCurrentMonth}
              className="px-3 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-bold rounded-xl text-xs transition-colors shadow-xs"
            >
              Current Month
            </button>
          )}

          <button
            onClick={openBulkEditor}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-2xl text-xs sm:text-sm flex items-center gap-2 transition-all shadow-xs"
          >
            <SlidersHorizontal size={16} />
            <span>Set Category Budgets</span>
          </button>
        </div>
      </header>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Budgeted */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Budgeted</p>
            <p className="text-2xl font-black text-slate-900 mt-1 tabular-nums">
              {formatCurrency(summary.totalBudget)}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">Across {summary.budgetedCount} active categories</p>
          </div>
          <div className="p-3.5 bg-indigo-50 text-indigo-600 rounded-2xl">
            <Target size={24} />
          </div>
        </div>

        {/* Total Spent */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Spent</p>
            <p className="text-2xl font-black text-slate-900 mt-1 tabular-nums">
              {formatCurrency(summary.totalSpent)}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              {MONTH_NAMES[selectedMonth]} expenditure
            </p>
          </div>
          <div className="p-3.5 bg-rose-50 text-rose-600 rounded-2xl">
            <TrendingDown size={24} />
          </div>
        </div>

        {/* Remaining / Over Budget */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              {summary.totalRemaining >= 0 ? 'Remaining Budget' : 'Over Budget'}
            </p>
            <p
              className={`text-2xl font-black mt-1 tabular-nums ${
                summary.totalRemaining >= 0 ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              {formatCurrency(Math.abs(summary.totalRemaining))}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              {summary.totalRemaining >= 0 ? 'Safe to spend' : 'Total monthly overage'}
            </p>
          </div>
          <div
            className={`p-3.5 rounded-2xl ${
              summary.totalRemaining >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
            }`}
          >
            {summary.totalRemaining >= 0 ? <CheckCircle size={24} /> : <AlertTriangle size={24} />}
          </div>
        </div>

        {/* Budget Health / Utilization */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Budget Health</p>
            <p className="text-2xl font-black text-slate-900 mt-1 tabular-nums">
              {Math.round(summary.overallPct)}%
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              {summary.overBudgetCount > 0
                ? `${summary.overBudgetCount} category over limit`
                : 'All budgeted categories on track'}
            </p>
          </div>
          <div
            className={`p-3.5 rounded-2xl ${
              summary.overallPct > 100
                ? 'bg-rose-50 text-rose-600'
                : summary.overallPct > 80
                ? 'bg-amber-50 text-amber-600'
                : 'bg-indigo-50 text-indigo-600'
            }`}
          >
            <Sparkles size={24} />
          </div>
        </div>
      </div>

      {/* Monthly Pace & Trajectory Card */}
      {summary.totalBudget > 0 && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Calendar size={16} className="text-indigo-600" />
                Monthly Spending Pacing
              </h3>
              <p className="text-xs text-slate-500">
                Day {currentDay} of {daysInMonth} ({Math.round(monthElapsedPct)}% of month elapsed)
              </p>
            </div>
            <div className="text-xs font-semibold text-right">
              {summary.overallPct <= monthElapsedPct ? (
                <span className="text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 font-bold">
                  ✓ Spending slower than month pace (Excellent)
                </span>
              ) : summary.overallPct > 100 ? (
                <span className="text-rose-700 bg-rose-50 px-2.5 py-1 rounded-full border border-rose-200 font-bold">
                  ⚠️ Over Monthly Budget Target
                </span>
              ) : (
                <span className="text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200 font-bold">
                  ⚡ Spending faster than month pace
                </span>
              )}
            </div>
          </div>

          {/* Dual Bar: Spending vs Month Days */}
          <div className="relative pt-2">
            {/* Background Track */}
            <div className="h-4 w-full bg-slate-100 rounded-full overflow-hidden flex">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  summary.overallPct > 100
                    ? 'bg-rose-500'
                    : summary.overallPct > 80
                    ? 'bg-amber-500'
                    : 'bg-indigo-600'
                }`}
                style={{ width: `${Math.min(summary.overallPct, 100)}%` }}
              />
            </div>

            {/* Target Day Marker */}
            {isCurrentMonth && (
              <div
                className="absolute top-0 bottom-0 flex flex-col items-center pointer-events-none"
                style={{ left: `${Math.min(monthElapsedPct, 98)}%` }}
              >
                <div className="h-2 w-0.5 bg-slate-800" />
                <span className="text-[9px] font-bold text-slate-700 bg-white px-1 py-0.5 rounded shadow-xs border border-slate-300 mt-4 whitespace-nowrap">
                  Today (Day {currentDay})
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Filter and Control Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setFilterMode('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              filterMode === 'all'
                ? 'bg-slate-800 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            All Categories ({budgetList.length})
          </button>
          <button
            onClick={() => setFilterMode('over_budget')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              filterMode === 'over_budget'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <span>Over Budget</span>
            {summary.overBudgetCount > 0 && (
              <span className="px-1.5 py-0.2 text-[10px] bg-rose-100 text-rose-700 rounded-full font-black">
                {summary.overBudgetCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setFilterMode('under_budget')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              filterMode === 'under_budget'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            Under Budget
          </button>
          <button
            onClick={() => setFilterMode('unbudgeted')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              filterMode === 'unbudgeted'
                ? 'bg-slate-800 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            Unbudgeted ({summary.unbudgetedCount})
          </button>
        </div>

        {/* Search & Sort */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="percent_desc">% Used (High to Low)</option>
            <option value="spent_desc">Highest Spending</option>
            <option value="remaining_asc">Least Remaining</option>
            <option value="name_asc">Category Name</option>
          </select>
        </div>
      </div>

      {/* Category Progress Gauges List */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs divide-y divide-slate-100 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400">Loading budget data...</div>
        ) : filteredList.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Target size={36} className="mx-auto text-slate-300" />
            <p className="text-slate-600 font-bold text-sm">No categories match the selected filter</p>
            <p className="text-xs text-slate-400">
              Try adjusting your search query or reset the filter to view all categories.
            </p>
          </div>
        ) : (
          filteredList.map((item) => {
            const hasBudget = item.monthly_budget > 0;
            const isEditing = editingCatId === item.category_id;

            return (
              <div
                key={item.category_id}
                onClick={() => setSelectedCategoryDetail(item)}
                className="p-5 hover:bg-slate-50/80 transition-all space-y-3 cursor-pointer group"
                title="Click to view category transactions breakdown"
              >
                {/* Row Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-2xl flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                        item.is_over_budget
                          ? 'bg-rose-100 text-rose-700'
                          : hasBudget && item.percentage >= 80
                          ? 'bg-amber-100 text-amber-700'
                          : hasBudget
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {item.category_name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm group-hover:text-indigo-600 transition-colors">
                          {item.category_name}
                        </span>
                        {item.is_over_budget && (
                          <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider rounded-md bg-rose-100 text-rose-700 border border-rose-200 flex-shrink-0">
                            Over Budget
                          </span>
                        )}
                        {!hasBudget && item.spent > 0 && (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-slate-100 text-slate-600 flex-shrink-0">
                            Unbudgeted
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {hasBudget ? (
                          item.remaining >= 0 ? (
                            <span className="text-emerald-700 font-semibold">
                              {formatCurrency(item.remaining)} remaining of {formatCurrency(item.monthly_budget)} target
                            </span>
                          ) : (
                            <span className="text-rose-700 font-bold">
                              +{formatCurrency(Math.abs(item.remaining))} over {formatCurrency(item.monthly_budget)} target
                            </span>
                          )
                        ) : (
                          <span>No monthly budget target set</span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Right side: Amount & Inline Edit */}
                  <div
                    className="flex items-center gap-3 self-end sm:self-center flex-shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="text-right">
                      <div className="text-sm font-black tabular-nums text-slate-900">
                        {formatCurrency(item.spent)}
                      </div>
                      <div className="text-[11px] text-slate-400 font-medium">
                        {hasBudget ? `${Math.round(item.percentage)}% of target` : 'Spent this month'}
                      </div>
                    </div>

                    {/* Inline Budget Target Editor */}
                    {isEditing ? (
                      <div className="flex items-center gap-1 bg-white border border-indigo-400 rounded-xl p-1 shadow-sm">
                        <span className="text-xs font-bold text-slate-400 pl-1.5">{currency.symbol.trim()}</span>
                        <input
                          type="number"
                          step="10"
                          min="0"
                          value={editingBudgetVal}
                          onChange={(e) => setEditingBudgetVal(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveBudget(item.category_id);
                            if (e.key === 'Escape') setEditingCatId(null);
                          }}
                          className="w-20 px-1 py-0.5 text-xs font-bold tabular-nums outline-none"
                          autoFocus
                        />
                        <button
                          onClick={() => handleSaveBudget(item.category_id)}
                          className="p-1 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                          title="Save target"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          onClick={() => setEditingCatId(null)}
                          className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                          title="Cancel"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingCatId(item.category_id);
                          setEditingBudgetVal(item.monthly_budget > 0 ? String(item.monthly_budget) : '');
                        }}
                        className="px-2.5 py-1 text-xs font-semibold text-slate-500 hover:text-indigo-600 hover:bg-indigo-50/80 rounded-xl transition-colors flex items-center gap-1 border border-transparent hover:border-indigo-200"
                        title="Edit monthly budget target"
                      >
                        <Edit2 size={13} />
                        <span>{hasBudget ? `$${item.monthly_budget}` : 'Set Target'}</span>
                      </button>
                    )}

                    <ChevronRight size={16} className="text-slate-300 group-hover:text-indigo-500 transition-colors hidden sm:block" />
                  </div>
                </div>

                {/* Progress Gauge */}
                <div className="space-y-1">
                  <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden flex">
                    <div
                      className={`h-full transition-all duration-500 rounded-full ${
                        !hasBudget
                          ? 'bg-slate-300'
                          : item.is_over_budget
                          ? 'bg-rose-500 shadow-xs shadow-rose-500/50'
                          : item.percentage >= 80
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                      }`}
                      style={{
                        width: hasBudget ? `${Math.min(item.percentage, 100)}%` : item.spent > 0 ? '100%' : '0%',
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Bulk Budget Targets Editor Modal */}
      {isBulkModalOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 sm:p-5 md:p-6 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsBulkModalOpen(false);
          }}
        >
          <div className="bg-white rounded-3xl w-full max-w-lg md:max-w-2xl lg:max-w-4xl xl:max-w-5xl shadow-2xl flex flex-col border border-slate-200 overflow-hidden max-h-[92vh] sm:max-h-[88vh] transition-all duration-200">
            {/* Modal Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5 sm:p-6 border-b border-slate-100 flex-shrink-0 bg-white">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-2xl">
                  <SlidersHorizontal size={22} />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
                    Set Monthly Category Targets
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Set recurring monthly spending limits for your expense categories
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center">
                {/* Search inside bulk editor */}
                <div className="relative w-40 sm:w-56">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Filter categories..."
                    value={bulkSearch}
                    onChange={(e) => setBulkSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                  />
                  {bulkSearch && (
                    <button
                      onClick={() => setBulkSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                <button
                  onClick={() => setIsBulkModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
                  title="Close (Esc)"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Total Planned Summary Banner */}
            <div className="mx-5 my-3 sm:mx-6 sm:my-4 bg-gradient-to-r from-indigo-50 via-indigo-50/70 to-slate-50 border border-indigo-100/80 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-100/80 text-indigo-700 rounded-xl">
                  <Target size={18} />
                </div>
                <div>
                  <span className="text-xs font-bold text-indigo-950 block">Total Planned Monthly Budget</span>
                  <span className="text-[11px] text-indigo-700/90">
                    Combined across {categories.filter((c) => c.type === 'expense').length} active expense categories
                  </span>
                </div>
              </div>
              <div className="text-xl sm:text-2xl font-black tabular-nums text-indigo-950 sm:text-right">
                {formatCurrency(
                  Object.values(bulkBudgets).reduce((sum, v) => sum + (parseFloat(v) || 0), 0)
                )}
              </div>
            </div>

            {/* Categories Table Inputs - Responsive 1 col on mobile, 2 cols on wide screens */}
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-2 sm:px-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pb-4">
                {categories
                  .filter((c) => c.type === 'expense')
                  .filter((c) => !bulkSearch.trim() || c.name.toLowerCase().includes(bulkSearch.toLowerCase()))
                  .map((cat) => (
                    <div
                      key={cat.id}
                      className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-slate-50/70 border border-slate-200/80 hover:bg-slate-50 hover:border-indigo-200 transition-all"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="font-semibold text-sm text-slate-800 block truncate" title={cat.name}>
                          {cat.name}
                        </span>
                        <span className="text-[11px] text-slate-400 block truncate">
                          Spent this month: {formatCurrency(categorySpendingMap[cat.id] || 0)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="text-xs font-bold text-slate-400 pl-1">{currency.symbol.trim()}</span>
                        <input
                          type="number"
                          step="10"
                          min="0"
                          placeholder="0.00"
                          value={bulkBudgets[cat.id] !== undefined ? bulkBudgets[cat.id] : ''}
                          onChange={(e) =>
                            setBulkBudgets((prev) => ({
                              ...prev,
                              [cat.id]: e.target.value,
                            }))
                          }
                          className="w-24 sm:w-28 px-2.5 py-1.5 border border-slate-200 bg-white rounded-xl text-xs sm:text-sm font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-xs"
                        />
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 sm:px-6 sm:py-4 border-t border-slate-100 bg-slate-50/70 flex-shrink-0">
              <button
                type="button"
                onClick={() => setIsBulkModalOpen(false)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-200/60 font-semibold rounded-xl text-sm transition-colors text-center cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveBulkEditor}
                className="w-full sm:w-auto px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Check size={16} />
                <span>Save All Budget Targets</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category Spending Details Modal (Drill-down) */}
      {selectedCategoryDetail && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 sm:p-5 md:p-6 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedCategoryDetail(null);
          }}
        >
          <div className="bg-white rounded-3xl w-full max-w-lg md:max-w-2xl lg:max-w-3xl shadow-2xl flex flex-col border border-slate-200 overflow-hidden max-h-[92vh] sm:max-h-[88vh] transition-all duration-200">
            {/* Header */}
            <div className="flex items-center justify-between p-5 sm:p-6 border-b border-slate-100 flex-shrink-0 bg-white">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-base flex-shrink-0 ${
                    selectedCategoryDetail.is_over_budget
                      ? 'bg-rose-100 text-rose-700'
                      : selectedCategoryDetail.monthly_budget > 0 && selectedCategoryDetail.percentage >= 80
                      ? 'bg-amber-100 text-amber-700'
                      : selectedCategoryDetail.monthly_budget > 0
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {selectedCategoryDetail.category_name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg sm:text-xl font-bold text-slate-900 truncate">
                      {selectedCategoryDetail.category_name}
                    </h2>
                    {selectedCategoryDetail.is_over_budget ? (
                      <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider rounded-md bg-rose-100 text-rose-700 border border-rose-200">
                        Over Budget
                      </span>
                    ) : selectedCategoryDetail.monthly_budget > 0 ? (
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-emerald-100 text-emerald-700 border border-emerald-200">
                        On Track
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-slate-100 text-slate-600">
                        Unbudgeted
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Spending breakdown for {MONTH_NAMES[selectedMonth]} {selectedYear}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedCategoryDetail(null)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors flex-shrink-0 cursor-pointer"
                title="Close (Esc)"
              >
                <X size={20} />
              </button>
            </div>

            {/* Summary Cards */}
            <div className="p-4 sm:p-6 bg-slate-50/70 border-b border-slate-100 flex-shrink-0 space-y-3">
              <div className="grid grid-cols-3 gap-2.5 sm:gap-3 text-center sm:text-left">
                <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400 block truncate">
                    Monthly Target
                  </span>
                  <span className="text-sm sm:text-xl font-black text-slate-800 tabular-nums mt-0.5 block truncate">
                    {selectedCategoryDetail.monthly_budget > 0
                      ? formatCurrency(selectedCategoryDetail.monthly_budget)
                      : 'None'}
                  </span>
                </div>
                <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400 block truncate">
                    Total Spent
                  </span>
                  <span className="text-sm sm:text-xl font-black text-rose-600 tabular-nums mt-0.5 block truncate">
                    {formatCurrency(selectedCategoryDetail.spent)}
                  </span>
                </div>
                <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400 block truncate">
                    {selectedCategoryDetail.remaining >= 0 ? 'Remaining' : 'Over Budget'}
                  </span>
                  <span
                    className={`text-sm sm:text-xl font-black tabular-nums mt-0.5 block truncate ${
                      selectedCategoryDetail.remaining >= 0 ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  >
                    {formatCurrency(Math.abs(selectedCategoryDetail.remaining))}
                  </span>
                </div>
              </div>

              {/* Progress Gauge */}
              {selectedCategoryDetail.monthly_budget > 0 && (
                <div className="space-y-1 pt-1">
                  <div className="flex justify-between text-xs font-semibold text-slate-500">
                    <span>Target Utilization</span>
                    <span>{Math.round(selectedCategoryDetail.percentage)}%</span>
                  </div>
                  <div className="h-2.5 w-full bg-slate-200/70 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        selectedCategoryDetail.is_over_budget
                          ? 'bg-rose-500'
                          : selectedCategoryDetail.percentage >= 80
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(selectedCategoryDetail.percentage, 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Transactions List */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-2">
              <div className="flex items-center justify-between pb-1">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Category Transactions ({categoryTransactions.length})
                </span>
              </div>

              {categoryTransactions.length === 0 ? (
                <div className="p-8 text-center space-y-2 text-slate-400">
                  <Receipt size={32} className="mx-auto text-slate-300" />
                  <p className="text-sm font-semibold text-slate-600">No transactions recorded</p>
                  <p className="text-xs">
                    No debits were booked for this category in {MONTH_NAMES[selectedMonth]} {selectedYear}.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200/80 overflow-hidden bg-white shadow-2xs">
                  {categoryTransactions.map((tx) => (
                    <div key={tx.key} className="p-3.5 hover:bg-slate-50/80 transition-colors flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-800 truncate block">
                            {tx.payee}
                          </span>
                          {tx.isSplit && (
                            <span className="px-1.5 py-0.2 text-[9px] font-bold bg-indigo-50 text-indigo-700 rounded-md border border-indigo-200">
                              Split
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                          <span>{tx.date}</span>
                          {tx.memo && <span>• {tx.memo}</span>}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className="font-black text-sm text-rose-600 tabular-nums block">
                          -{formatCurrency(Math.abs(tx.amount))}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 sm:px-6 sm:py-4 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between flex-shrink-0">
              <button
                type="button"
                onClick={() => setSelectedCategoryDetail(null)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-200/60 font-semibold rounded-xl text-sm transition-colors cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  const targetCat = categories.find((c) => c.id === selectedCategoryDetail.category_id);
                  if (targetCat) {
                    setEditingCatId(targetCat.id);
                    setEditingBudgetVal((targetCat.monthly_budget || 0) > 0 ? String(targetCat.monthly_budget) : '');
                  }
                  setSelectedCategoryDetail(null);
                }}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Edit2 size={14} />
                <span>Edit Target</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BudgetPage;
