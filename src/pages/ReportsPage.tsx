import { useState, useEffect, useMemo } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  PieChart as PieChartIcon,
  BarChart3,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Percent,
  Award,
  Layers,
  Printer,
  Download,
  FileDown,
  FileSpreadsheet,
  Target,
  FileText,
  Activity,
  Check,
  Paperclip,
} from 'lucide-react';
import { getDb } from '../utils/db';
import { Account, Category } from '../types';
import { generateReportPDF } from '../utils/pdfGenerator';
import { useRegionalSettings, isTransferPayee, getLocalTodayStr, toLocalDateStr } from '../utils/currency';
import ReceiptModal from '../components/ReceiptModal';

interface RawTx {
  id: number;
  account_id: number;
  category_id: number;
  category_name: string;
  category_type: string;
  date: string;
  payee: string;
  amount: number;
  memo?: string;
  attachment_count?: number;
}

const CATEGORY_COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#10b981', // emerald
  '#f59e0b', // amber
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#84cc16', // lime
  '#f97316', // orange
  '#6366f1', // indigo
  '#14b8a6', // teal
  '#64748b', // slate
];

type TimeRange = 'this_month' | 'last_month' | 'last_90_days' | 'this_year' | 'all_time' | 'custom';
type ReportTab = 'overview' | 'budget_variance' | 'net_worth' | 'income_statement' | 'tax_summary';

interface ReportsPageProps {
  proStatus?: boolean;
  onTriggerUpgrade?: (reason: 'accounts_limit' | 'what_if_locked' | 'reports_locked' | 'general' | 'receipts_locked') => void;
}

const ReportsPage = ({ proStatus = false, onTriggerUpgrade }: ReportsPageProps) => {
  const { formatCurrency, formatDate, currency } = useRegionalSettings();
  const [activeTab, setActiveTab] = useState<ReportTab>('overview');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number | 'all'>('all');
  const [timeRange, setTimeRange] = useState<TimeRange>('this_month');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [viewingReceiptTxId, setViewingReceiptTxId] = useState<number | null>(null);

  // Raw dataset
  const [allTxs, setAllTxs] = useState<RawTx[]>([]);
  const [filteredTxs, setFilteredTxs] = useState<RawTx[]>([]);

  // Overview Computed data states
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalExpense, setTotalExpense] = useState(0);
  const [netSavings, setNetSavings] = useState(0);
  const [savingsRate, setSavingsRate] = useState(0);

  const [categoryData, setCategoryData] = useState<{ name: string; value: number; count: number; pct: number }[]>([]);
  const [monthlyTrend, setMonthlyTrend] = useState<{ month: string; income: number; expense: number; net: number }[]>([]);
  const [topPayees, setTopPayees] = useState<{ name: string; amount: number; count: number; pct: number }[]>([]);

  // Load all foundational data
  const loadReportData = async () => {
    setLoading(true);
    try {
      const db = await getDb();
      const accs = (await db.select('SELECT * FROM accounts ORDER BY name ASC')) as Account[];
      setAccounts(accs);

      const cats = (await db.select(
        'SELECT id, name, type, parent_id, COALESCE(monthly_budget, 0) as monthly_budget FROM categories ORDER BY name ASC'
      )) as Category[];
      setAllCategories(cats);

      // Fetch all transactions with category metadata
      const rawTxs = (await db.select(`
        SELECT 
          t.id,
          t.account_id,
          t.category_id,
          COALESCE(c.name, 'General') as category_name,
          COALESCE(c.type, 'expense') as category_type,
          t.date,
          t.payee,
          t.amount,
          t.memo,
          (SELECT COUNT(*) FROM transaction_attachments ta WHERE ta.transaction_id = t.id) as attachment_count
        FROM transactions t
        LEFT JOIN categories c ON t.category_id = c.id
        ORDER BY t.date ASC
      `)) as RawTx[];

      // Splits support
      const txIds = rawTxs.map((t) => t.id);
      let splitMap: { [txId: number]: { category_name: string; category_id: number; amount: number }[] } = {};
      if (txIds.length > 0) {
        try {
          const splitRows = (await db.select(
            `SELECT ts.transaction_id, ts.category_id, ts.amount, c.name as category_name 
             FROM transaction_splits ts
             JOIN categories c ON ts.category_id = c.id`
          )) as { transaction_id: number; category_id: number; amount: number; category_name: string }[];
          for (const s of splitRows) {
            if (!splitMap[s.transaction_id]) splitMap[s.transaction_id] = [];
            splitMap[s.transaction_id].push({
              category_name: s.category_name,
              category_id: s.category_id,
              amount: s.amount,
            });
          }
        } catch (e) {
          console.warn('Could not load splits for report:', e);
        }
      }

      setAllTxs(rawTxs);

      // Filter by Account and Time Range
      const now = new Date();
      let startStr = '';
      let endStr = '';

      if (timeRange === 'this_month') {
        startStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      } else if (timeRange === 'last_month') {
        const dStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const dEnd = new Date(now.getFullYear(), now.getMonth(), 0);
        startStr = toLocalDateStr(dStart);
        endStr = toLocalDateStr(dEnd);
      } else if (timeRange === 'last_90_days') {
        startStr = getLocalTodayStr(-90);
      } else if (timeRange === 'this_year') {
        startStr = `${now.getFullYear()}-01-01`;
      } else if (timeRange === 'custom') {
        startStr = customStart;
        endStr = customEnd;
      }

      const filtered = rawTxs.filter((tx) => {
        if (selectedAccountId !== 'all' && tx.account_id !== selectedAccountId) return false;
        if (startStr && tx.date < startStr) return false;
        if (endStr && tx.date > endStr) return false;
        return true;
      });

      setFilteredTxs(filtered);

      // Compute Overview Aggregates
      let incomeSum = 0;
      let expenseSum = 0;
      const catTotals: { [name: string]: { total: number; count: number } } = {};
      const payeeTotals: { [name: string]: { total: number; count: number } } = {};
      const monthlyMap: { [monthKey: string]: { income: number; expense: number } } = {};

      for (const tx of filtered) {
        if (isTransferPayee(tx.payee)) continue;

        if (tx.amount > 0) {
          incomeSum += tx.amount;
        } else {
          expenseSum += Math.abs(tx.amount);

          const cleanPayee = tx.payee.trim() || 'Unknown';
          if (!payeeTotals[cleanPayee]) payeeTotals[cleanPayee] = { total: 0, count: 0 };
          payeeTotals[cleanPayee].total += Math.abs(tx.amount);
          payeeTotals[cleanPayee].count += 1;
        }

        // Category breakdown
        if (tx.amount < 0) {
          const splits = splitMap[tx.id];
          if (splits && splits.length > 0) {
            for (const sp of splits) {
              const cat = sp.category_name || 'General';
              if (!catTotals[cat]) catTotals[cat] = { total: 0, count: 0 };
              catTotals[cat].total += Math.abs(sp.amount);
              catTotals[cat].count += 1;
            }
          } else {
            const cat = tx.category_name || 'General';
            if (!catTotals[cat]) catTotals[cat] = { total: 0, count: 0 };
            catTotals[cat].total += Math.abs(tx.amount);
            catTotals[cat].count += 1;
          }
        }

        // Monthly Trend
        const mKey = tx.date.substring(0, 7); // 'YYYY-MM'
        if (!monthlyMap[mKey]) monthlyMap[mKey] = { income: 0, expense: 0 };
        if (tx.amount > 0) {
          monthlyMap[mKey].income += tx.amount;
        } else {
          monthlyMap[mKey].expense += Math.abs(tx.amount);
        }
      }

      setTotalIncome(incomeSum);
      setTotalExpense(expenseSum);
      const net = incomeSum - expenseSum;
      setNetSavings(net);
      setSavingsRate(incomeSum > 0 ? (net > 0 ? (net / incomeSum) * 100 : 0) : 0);

      // Category Chart items
      const cList = Object.entries(catTotals).map(([name, data]) => ({
        name,
        value: data.total,
        count: data.count,
        pct: expenseSum > 0 ? (data.total / expenseSum) * 100 : 0,
      }));
      cList.sort((a, b) => b.value - a.value);
      setCategoryData(cList);

      // Monthly Trend items
      const monthsSorted = Object.keys(monthlyMap).sort();
      const mTrend = monthsSorted.map((k) => {
        const parts = k.split('-');
        const monthIndex = parseInt(parts[1], 10) - 1;
        const shortName = [
          'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
          'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
        ][monthIndex] || parts[1];
        const label = `${shortName} '${parts[0].substring(2)}`;
        const inc = monthlyMap[k].income;
        const exp = monthlyMap[k].expense;
        return {
          month: label,
          income: inc,
          expense: exp,
          net: inc - exp,
        };
      });
      setMonthlyTrend(mTrend);

      // Top Payees Leaderboard
      const pList = Object.entries(payeeTotals).map(([name, data]) => ({
        name,
        amount: data.total,
        count: data.count,
        pct: expenseSum > 0 ? (data.total / expenseSum) * 100 : 0,
      }));
      pList.sort((a, b) => b.amount - a.amount);
      setTopPayees(pList.slice(0, 8));
    } catch (err) {
      console.error('Error loading report data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReportData();
  }, [selectedAccountId, timeRange, customStart, customEnd]);

  // Handle Tab Switching with Pro Gating
  const handleSelectTab = (tab: ReportTab) => {
    if (tab !== 'overview' && !proStatus) {
      onTriggerUpgrade?.('reports_locked');
      return;
    }
    setActiveTab(tab);
  };

  // Handle Custom Date Range with Pro Gating
  const handleSelectCustomTimeRange = () => {
    if (!proStatus) {
      onTriggerUpgrade?.('reports_locked');
      return;
    }
    setTimeRange('custom');
    if (!customStart) {
      const now = new Date();
      setCustomStart(`${now.getFullYear()}-01-01`);
      setCustomEnd(now.toISOString().split('T')[0]);
    }
  };

  // 1-Click Generate & Download PDF
  const handleDownloadPDF = async () => {
    // If attempting to download an advanced report and user is not Pro, prompt upgrade
    if (activeTab !== 'overview' && !proStatus) {
      onTriggerUpgrade?.('reports_locked');
      return;
    }

    setIsGeneratingPdf(true);
    setDownloadSuccess(false);

    try {
      // Yield briefly so UI immediately reflects "Generating..." state
      await new Promise((resolve) => setTimeout(resolve, 60));

      const accName = selectedAccountId === 'all'
        ? 'All Accounts'
        : accounts.find((a) => a.id === selectedAccountId)?.name || 'Account';

      const periodLabel = timeRange === 'this_month'
        ? 'This Month'
        : timeRange === 'last_month'
        ? 'Last Month'
        : timeRange === 'last_90_days'
        ? 'Last 90 Days'
        : timeRange === 'this_year'
        ? 'This Year'
        : timeRange === 'custom'
        ? `${customStart || 'Start'} to ${customEnd || 'End'}`
        : 'All Time';

      if (activeTab === 'budget_variance') {
        generateReportPDF({
          title: 'Budget vs. Actual Variance Statement',
          subtitle: 'Comprehensive audit of planned monthly category targets versus realized ledger debits',
          period: periodLabel,
          accountName: accName,
          kpis: [
            { label: 'Total Planned Budget', value: formatCurrency(varianceSummary.totalBudget), type: 'neutral' },
            { label: 'Actual Period Spending', value: formatCurrency(varianceSummary.totalSpent), type: 'expense' },
            {
              label: varianceSummary.netVariance >= 0 ? 'Net Budget Surplus' : 'Net Budget Deficit',
              value: `${varianceSummary.netVariance >= 0 ? '+' : '-'}${formatCurrency(Math.abs(varianceSummary.netVariance))}`,
              type: varianceSummary.netVariance >= 0 ? 'income' : 'expense',
            },
          ],
          tables: [
            {
              title: 'Category Spending Adherence',
              head: [['Category', 'Monthly Target', 'Actual Spent', `Variance (${currency.symbol})`, '% Used']],
              body: budgetVarianceData.map((b) => [
                b.name,
                b.budget > 0 ? formatCurrency(b.budget) : '—',
                formatCurrency(b.spent),
                b.budget > 0 ? `${b.variance >= 0 ? '+' : '-'}${formatCurrency(Math.abs(b.variance))}` : '—',
                b.budget > 0 ? `${Math.round(b.pct)}%` : '—',
              ]),
              foot: [
                [
                  'Portfolio Totals',
                  formatCurrency(varianceSummary.totalBudget),
                  formatCurrency(varianceSummary.totalSpent),
                  `${varianceSummary.netVariance >= 0 ? '+' : '-'}${formatCurrency(Math.abs(varianceSummary.netVariance))}`,
                  varianceSummary.totalBudget > 0 ? `${Math.round((varianceSummary.totalSpent / varianceSummary.totalBudget) * 100)}%` : '—',
                ],
              ],
            },
          ],
          filename: `rMoney_Budget_Variance_${new Date().toISOString().split('T')[0]}.pdf`,
        });
      } else if (activeTab === 'net_worth') {
        const totalNetWorth = accounts.reduce((sum, a) => sum + a.balance, 0);
        generateReportPDF({
          title: 'Balance Sheet & Asset Holdings Statement',
          subtitle: 'Cumulative balance progression and itemized account holdings breakdown',
          period: periodLabel,
          accountName: accName,
          kpis: [
            {
              label: 'Total Net Worth',
              value: formatCurrency(totalNetWorth),
              type: totalNetWorth >= 0 ? 'income' : 'expense',
            },
            { label: 'Active Financial Accounts', value: String(accounts.length), type: 'neutral' },
          ],
          tables: [
            {
              title: 'Account Holdings Breakdown',
              head: [['Account Name', 'Account Type', 'Current Balance']],
              body: accounts.map((a) => [
                a.name,
                a.type || 'Checking',
                formatCurrency(a.balance),
              ]),
              foot: [
                [
                  'Total Net Assets',
                  `${accounts.length} Accounts`,
                  formatCurrency(totalNetWorth),
                ],
              ],
            },
          ],
          filename: `rMoney_Net_Worth_${new Date().toISOString().split('T')[0]}.pdf`,
        });
      } else if (activeTab === 'income_statement') {
        generateReportPDF({
          title: 'Statement of Income & Expense (P&L)',
          subtitle: 'Formal accounting breakdown of revenues, direct expenditures, and net surplus',
          period: periodLabel,
          accountName: accName,
          kpis: [
            { label: 'Operating Revenues (Income)', value: formatCurrency(totalIncome), type: 'income' },
            { label: 'Operating Outflows (Expenses)', value: formatCurrency(totalExpense), type: 'expense' },
            {
              label: 'Net Operating Surplus / Deficit',
              value: `${netSavings >= 0 ? '+' : '-'}${formatCurrency(Math.abs(netSavings))}`,
              type: netSavings >= 0 ? 'income' : 'expense',
            },
          ],
          tables: [
            {
              title: 'Operating Revenues (Income)',
              head: [['Category', 'Classification', 'Amount']],
              body: incomeStatementData.incomeRows.map((r) => [r.name, 'Operating Income', formatCurrency(r.total)]),
              foot: [['Total Operating Revenues', '', formatCurrency(totalIncome)]],
            },
            {
              title: 'Operating Outflows (Expenses)',
              head: [['Category', 'Classification', 'Amount']],
              body: incomeStatementData.expenseRows.map((r) => [r.name, 'Operating Expense', formatCurrency(r.total)]),
              foot: [['Total Operating Expenses', '', formatCurrency(totalExpense)]],
            },
          ],
          filename: `rMoney_Income_Statement_${new Date().toISOString().split('T')[0]}.pdf`,
        });
      } else if (activeTab === 'tax_summary') {
        generateReportPDF({
          title: 'Tax Deductions & Schedule Itemized Record',
          subtitle: 'Itemized compilation of deductible medical, charitable, property, and business expenses',
          period: periodLabel,
          accountName: accName,
          kpis: [
            { label: 'Total Potential Deductions', value: formatCurrency(taxDeductibleTotal), type: 'neutral' },
            { label: 'Deductible Transactions', value: String(taxDeductibleExpenses.length), type: 'neutral' },
          ],
          tables: [
            {
              title: 'Itemized Deduction Entries',
              head: [['Date', 'Payee / Merchant', 'Category', 'Memo', 'Receipt Audit', 'Amount']],
              body: taxDeductibleExpenses.map((t) => [
                formatDate(t.date),
                t.payee,
                t.category_name,
                t.memo || '—',
                t.attachment_count && t.attachment_count > 0 ? `Verified (${t.attachment_count})` : '—',
                formatCurrency(Math.abs(t.amount)),
              ]),
              foot: [['Total Qualified Deductions', '', '', '', '', formatCurrency(taxDeductibleTotal)]],
            },
          ],
          filename: `rMoney_Tax_Deductions_${new Date().toISOString().split('T')[0]}.pdf`,
        });
      } else {
        generateReportPDF({
          title: 'Cash Flow & Financial Overview Report',
          subtitle: 'Executive summary of income, category spending distribution, and top payees',
          period: periodLabel,
          accountName: accName,
          kpis: [
            { label: 'Total Income', value: formatCurrency(totalIncome), type: 'income' },
            { label: 'Total Spending', value: formatCurrency(totalExpense), type: 'expense' },
            {
              label: 'Net Savings',
              value: `${netSavings >= 0 ? '+' : '-'}${formatCurrency(Math.abs(netSavings))}`,
              type: netSavings >= 0 ? 'income' : 'expense',
            },
            { label: 'Savings Rate', value: `${savingsRate.toFixed(1)}%`, type: 'neutral' },
          ],
          tables: [
            {
              title: 'Category Spending Distribution',
              head: [['Category', `Spent (${currency.symbol})`, '% of Total Outflow', 'Transactions']],
              body: categoryData.map((c) => [
                c.name,
                formatCurrency(c.value),
                `${c.pct.toFixed(1)}%`,
                String(c.count),
              ]),
              foot: [['Total Category Outflows', formatCurrency(totalExpense), '100.0%', String(categoryData.reduce((s, c) => s + c.count, 0))]],
            },
            {
              title: 'Top Payees Leaderboard',
              head: [['Payee / Merchant', `Total Spent (${currency.symbol})`, '% of Outflows', 'Transactions']],
              body: topPayees.map((p) => [
                p.name,
                formatCurrency(p.amount),
                `${p.pct.toFixed(1)}%`,
                String(p.count),
              ]),
            },
          ],
          filename: `rMoney_Financial_Overview_${new Date().toISOString().split('T')[0]}.pdf`,
        });
      }

      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 2500);
    } catch (err: any) {
      console.error('Failed to generate PDF report:', err);
      alert(`Could not generate PDF: ${err?.message || err}. Please try again.`);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // 1-Click Print & PDF
  const handlePrintReport = () => {
    if (activeTab !== 'overview' && !proStatus) {
      onTriggerUpgrade?.('reports_locked');
      return;
    }
    window.print();
  };

  // 1-Click CSV Export of Active Report Data
  const handleExportCSV = () => {
    if (!proStatus) {
      onTriggerUpgrade?.('reports_locked');
      return;
    }

    try {
      let csvContent = 'data:text/csv;charset=utf-8,';

      if (activeTab === 'budget_variance') {
        csvContent += 'Category,Monthly Target Budget,Actual Spent,Variance,Percentage Used\n';
        for (const item of budgetVarianceData) {
          csvContent += `"${item.name}",${item.budget.toFixed(2)},${item.spent.toFixed(2)},${item.variance.toFixed(2)},${item.pct.toFixed(1)}%\n`;
        }
      } else if (activeTab === 'net_worth') {
        csvContent += 'Date,Net Worth\n';
        for (const item of netWorthTrajectory) {
          csvContent += `"${item.date}",${item.balance.toFixed(2)}\n`;
        }
      } else if (activeTab === 'income_statement') {
        csvContent += 'Category,Type,Total\n';
        for (const row of incomeStatementData.incomeRows) {
          csvContent += `"${row.name}",Income,${row.total.toFixed(2)}\n`;
        }
        for (const row of incomeStatementData.expenseRows) {
          csvContent += `"${row.name}",Expense,${row.total.toFixed(2)}\n`;
        }
      } else {
        csvContent += 'Category,Spent,Percentage,Transaction Count\n';
        for (const item of categoryData) {
          csvContent += `"${item.name}",${item.value.toFixed(2)},${item.pct.toFixed(1)}%,${item.count}\n`;
        }
      }

      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute(
        'download',
        `rmoney_report_${activeTab}_${new Date().toISOString().split('T')[0]}.csv`
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error('Failed to export CSV report:', e);
    }
  };

  // --------------------------------------------------------------------------
  // PRO FEATURE 1: Budget vs. Actual Variance Data
  // --------------------------------------------------------------------------
  const budgetVarianceData = useMemo(() => {
    const expenseCats = allCategories.filter((c) => c.type === 'expense');
    const spendingMap: { [catId: number]: number } = {};

    for (const tx of filteredTxs) {
      if (tx.amount < 0 && !isTransferPayee(tx.payee)) {
        spendingMap[tx.category_id] = (spendingMap[tx.category_id] || 0) + Math.abs(tx.amount);
      }
    }

    return expenseCats.map((cat) => {
      const budget = cat.monthly_budget || 0;
      const spent = spendingMap[cat.id] || 0;
      const variance = budget - spent;
      const pct = budget > 0 ? (spent / budget) * 100 : spent > 0 ? 100 : 0;
      const isOver = budget > 0 && spent > budget;

      return {
        id: cat.id,
        name: cat.name,
        budget,
        spent,
        variance,
        pct,
        isOver,
      };
    }).sort((a, b) => b.spent - a.spent);
  }, [allCategories, filteredTxs]);

  const varianceSummary = useMemo(() => {
    const totalBudget = budgetVarianceData.reduce((sum, b) => sum + b.budget, 0);
    const totalSpent = budgetVarianceData.reduce((sum, b) => sum + b.spent, 0);
    const netVariance = totalBudget - totalSpent;
    const overCount = budgetVarianceData.filter((b) => b.isOver).length;
    return { totalBudget, totalSpent, netVariance, overCount };
  }, [budgetVarianceData]);

  // --------------------------------------------------------------------------
  // PRO FEATURE 2: Net Worth Trajectory Over Time
  // --------------------------------------------------------------------------
  const netWorthTrajectory = useMemo(() => {
    if (allTxs.length === 0 || accounts.length === 0) return [];

    // Current total net worth across selected account(s)
    const currentTotal = accounts
      .filter((a) => (selectedAccountId === 'all' ? true : a.id === selectedAccountId))
      .reduce((sum, a) => sum + a.balance, 0);

    // Group transactions by date
    const dateMap: { [date: string]: number } = {};
    for (const tx of allTxs) {
      if (selectedAccountId !== 'all' && tx.account_id !== selectedAccountId) continue;
      dateMap[tx.date] = (dateMap[tx.date] || 0) + tx.amount;
    }

    const sortedDates = Object.keys(dateMap).sort();
    if (sortedDates.length === 0) return [];

    // Calculate balances moving backwards from currentTotal
    const pointList: { date: string; balance: number }[] = [];
    let rolling = currentTotal;

    // Last point is today with currentTotal
    const todayStr = getLocalTodayStr(0);
    pointList.unshift({ date: todayStr, balance: Math.round(rolling) });

    for (let i = sortedDates.length - 1; i >= 0; i--) {
      const d = sortedDates[i];
      const delta = dateMap[d];
      rolling -= delta;
      pointList.unshift({ date: d, balance: Math.round(rolling) });
    }

    // Filter to selected timeframe if needed
    if (filteredTxs.length > 0) {
      const minDate = filteredTxs[0].date;
      const maxDate = filteredTxs[filteredTxs.length - 1].date;
      return pointList.filter((p) => p.date >= minDate && p.date <= (maxDate || todayStr));
    }

    return pointList;
  }, [allTxs, accounts, selectedAccountId, filteredTxs]);

  // --------------------------------------------------------------------------
  // PRO FEATURE 3: Income Statement / Annual P&L Matrix
  // --------------------------------------------------------------------------
  const incomeStatementData = useMemo(() => {
    const incomeRows: { name: string; total: number }[] = [];
    const expenseRows: { name: string; total: number }[] = [];
    const catMap: { [catName: string]: { type: string; total: number } } = {};

    for (const tx of filteredTxs) {
      if (isTransferPayee(tx.payee)) continue;
      const name = tx.category_name || 'General';
      const isInc = tx.amount > 0;
      if (!catMap[name]) {
        catMap[name] = { type: isInc ? 'income' : 'expense', total: 0 };
      }
      catMap[name].total += Math.abs(tx.amount);
    }

    for (const [name, val] of Object.entries(catMap)) {
      if (val.type === 'income') {
        incomeRows.push({ name, total: val.total });
      } else {
        expenseRows.push({ name, total: val.total });
      }
    }

    incomeRows.sort((a, b) => b.total - a.total);
    expenseRows.sort((a, b) => b.total - a.total);

    return { incomeRows, expenseRows };
  }, [filteredTxs]);

  // --------------------------------------------------------------------------
  // PRO FEATURE 4: Tax Deductible Summary
  // --------------------------------------------------------------------------
  const taxDeductibleExpenses = useMemo(() => {
    const taxKeywords = [
      'tax', 'health', 'medical', 'charity', 'donation',
      'business', 'wellness', 'mortgage', 'doctor', 'hospital'
    ];

    return filteredTxs.filter((tx) => {
      if (tx.amount >= 0) return false;
      const catLower = (tx.category_name || '').toLowerCase();
      const payeeLower = (tx.payee || '').toLowerCase();
      const memoLower = (tx.memo || '').toLowerCase();

      return taxKeywords.some(
        (kw) => catLower.includes(kw) || payeeLower.includes(kw) || memoLower.includes(kw)
      );
    });
  }, [filteredTxs]);

  const taxDeductibleTotal = useMemo(() => {
    return taxDeductibleExpenses.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
  }, [taxDeductibleExpenses]);

  const currentPeriodLabel =
    timeRange === 'this_month'
      ? 'This Month'
      : timeRange === 'last_month'
      ? 'Last Month'
      : timeRange === 'last_90_days'
      ? 'Last 90 Days'
      : timeRange === 'this_year'
      ? 'This Year'
      : timeRange === 'custom'
      ? `${customStart || 'Start'} to ${customEnd || 'End'}`
      : 'All Time';

  const currentAccountLabel =
    selectedAccountId === 'all'
      ? `All Accounts (${accounts.length})`
      : accounts.find((a) => a.id === selectedAccountId)?.name || 'Selected Account';

  const reportHeadings: Record<ReportTab, { title: string; subtitle: string; refCode: string }> = {
    overview: {
      title: 'Cash Flow & Expenditure Statement',
      subtitle: 'Comprehensive audit of cash inflows, category distributions, and major payees',
      refCode: 'CF-STMT',
    },
    budget_variance: {
      title: 'Budget vs. Actual Variance Audit',
      subtitle: 'Audit comparing assigned category monthly spending targets against realized ledger debits',
      refCode: 'BGT-VAR',
    },
    net_worth: {
      title: 'Balance Sheet & Asset Holdings Statement',
      subtitle: 'Historical cumulative wealth trajectory and itemized account balance breakdown',
      refCode: 'NET-WTH',
    },
    income_statement: {
      title: 'Statement of Income & Expense (P&L)',
      subtitle: 'Formal accounting statement of operating revenues, direct expenditures, and net surplus',
      refCode: 'PL-STMT',
    },
    tax_summary: {
      title: 'Tax Deductions & Schedule Itemized Record',
      subtitle: 'Detailed compilation of qualified medical, charitable, mortgage, and business expenditures',
      refCode: 'TAX-DED',
    },
  };

  return (
    <>
      {/* ===================================================================== */}
      {/* 1. DEDICATED GRAYSCALE BUSINESS FINANCIAL STATEMENT (Print Only)      */}
      {/* ===================================================================== */}
      <div className="hidden print:block font-sans text-black bg-white w-full max-w-full">
        {/* Formal Business Letterhead */}
        <div className="border-b-2 border-black pb-2 mb-4">
          <div className="flex justify-between items-end">
            <div>
              <h1 className="text-xl font-black tracking-tight uppercase text-black">rMoney</h1>
              <p className="text-[8pt] font-bold tracking-wider uppercase text-neutral-600">
                Personal Financial Management & Accounting System
              </p>
            </div>
            <div className="text-right text-[7.5pt] leading-tight text-neutral-700">
              <p className="font-bold tracking-wider uppercase text-black">Official Financial Statement</p>
              <p>Reference: RM-{new Date().getFullYear()}-{reportHeadings[activeTab].refCode}</p>
              <p>Issued: {formatDate(new Date())}</p>
            </div>
          </div>
        </div>

        {/* Statement Title & Scope Table */}
        <div className="mb-4">
          <h2 className="text-sm font-black uppercase tracking-wide text-black pb-0.5 mb-1.5 border-b border-black">
            {reportHeadings[activeTab].title}
          </h2>
          <table className="biz-table !my-1">
            <tbody>
              <tr>
                <td className="!py-1 !px-2 font-bold !bg-neutral-100 text-[7pt] uppercase w-1/4">Reporting Scope:</td>
                <td className="!py-1 !px-2 text-[7.5pt] font-semibold w-1/4">{currentAccountLabel}</td>
                <td className="!py-1 !px-2 font-bold !bg-neutral-100 text-[7pt] uppercase w-1/4">Statement Horizon:</td>
                <td className="!py-1 !px-2 text-[7.5pt] font-semibold w-1/4">{currentPeriodLabel}</td>
              </tr>
              <tr>
                <td className="!py-1 !px-2 font-bold !bg-neutral-100 text-[7pt] uppercase">Classification:</td>
                <td className="!py-1 !px-2 text-[7.5pt]">Confidential Personal Record</td>
                <td className="!py-1 !px-2 font-bold !bg-neutral-100 text-[7pt] uppercase">Accounting Basis:</td>
                <td className="!py-1 !px-2 text-[7.5pt]">Cash Basis (Reconciled)</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* =================================================================== */}
        {/* TAB 1: OVERVIEW & CASH FLOW (BUSINESS PRINT)                        */}
        {/* =================================================================== */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            {/* Executive Summary Table */}
            <div className="biz-section">
              <h3 className="text-[8.5pt] font-bold uppercase tracking-wider text-black mb-1">
                Executive Cash Flow Summary
              </h3>
              <table className="biz-table">
                <thead>
                  <tr>
                    <th>Operating Metric</th>
                    <th className="num">Disbursed / Received</th>
                    <th>Classification</th>
                    <th className="num">% Portfolio Metric</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="font-semibold">Gross Cash Inflows (Revenues & Earnings)</td>
                    <td className="num font-mono font-bold">{formatCurrency(totalIncome)}</td>
                    <td>Operating Inflow</td>
                    <td className="num font-mono">100.0%</td>
                  </tr>
                  <tr>
                    <td className="font-semibold">Gross Cash Outflows (Expenditures & Debits)</td>
                    <td className="num font-mono font-bold">{formatCurrency(totalExpense)}</td>
                    <td>Operating Outflow</td>
                    <td className="num font-mono">{totalIncome > 0 ? `${((totalExpense / totalIncome) * 100).toFixed(1)}%` : '—'}</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr>
                    <td>Net Operating Cash Position</td>
                    <td className="num font-mono font-bold">
                      {netSavings >= 0 ? `+${formatCurrency(netSavings)}` : `(${formatCurrency(Math.abs(netSavings))})`}
                    </td>
                    <td>{netSavings >= 0 ? 'Cash Surplus' : 'Operating Deficit'}</td>
                    <td className="num font-mono font-bold">{savingsRate.toFixed(1)}% Retained</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Monthly Trend Schedule */}
            {monthlyTrend.length > 0 && (
              <div className="biz-section">
                <h3 className="text-[8.5pt] font-bold uppercase tracking-wider text-black mb-1">
                  Monthly Cash Flow Progression
                </h3>
                <table className="biz-table">
                  <thead>
                    <tr>
                      <th>Reporting Month</th>
                      <th className="num">Cash Inflows ({currency.symbol})</th>
                      <th className="num">Cash Outflows ({currency.symbol})</th>
                      <th className="num">Net Difference ({currency.symbol})</th>
                      <th className="num">Retention Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyTrend.map((m, idx) => (
                      <tr key={idx}>
                        <td className="font-semibold">{m.month}</td>
                        <td className="num font-mono">{formatCurrency(m.income)}</td>
                        <td className="num font-mono">{formatCurrency(m.expense)}</td>
                        <td className="num font-mono font-bold">
                          {m.net >= 0 ? `+${formatCurrency(m.net)}` : `(${formatCurrency(Math.abs(m.net))})`}
                        </td>
                        <td className="num font-mono">
                          {m.income > 0 ? `${((m.net / m.income) * 100).toFixed(1)}%` : '0.0%'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>Cumulative Portfolio Total</td>
                      <td className="num font-mono font-bold">{formatCurrency(monthlyTrend.reduce((s, m) => s + m.income, 0))}</td>
                      <td className="num font-mono font-bold">{formatCurrency(monthlyTrend.reduce((s, m) => s + m.expense, 0))}</td>
                      <td className="num font-mono font-bold">
                        {monthlyTrend.reduce((s, m) => s + m.net, 0) >= 0 ? '+' : ''}
                        {formatCurrency(monthlyTrend.reduce((s, m) => s + m.net, 0))}
                      </td>
                      <td className="num font-mono font-bold">—</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* Category Expenditure Schedule */}
            <div className="biz-section">
              <h3 className="text-[8.5pt] font-bold uppercase tracking-wider text-black mb-1">
                Category Expenditure Allocation Schedule
              </h3>
              <table className="biz-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}>Rank</th>
                    <th>Expense Category</th>
                    <th className="num">Total Disbursed ({currency.symbol})</th>
                    <th className="num">% of Outflows</th>
                    <th className="num">Transactions</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryData.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center italic py-2">No expenditures recorded for this statement period.</td>
                    </tr>
                  ) : (
                    categoryData.map((cat, idx) => (
                      <tr key={idx}>
                        <td className="font-mono">{idx + 1}</td>
                        <td className="font-semibold">{cat.name}</td>
                        <td className="num font-mono">{formatCurrency(cat.value)}</td>
                        <td className="num font-mono">{cat.pct.toFixed(1)}%</td>
                        <td className="num font-mono">{cat.count}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2}>Total Operating Expenditures</td>
                    <td className="num font-mono font-bold">{formatCurrency(totalExpense)}</td>
                    <td className="num font-mono font-bold">100.0%</td>
                    <td className="num font-mono font-bold">{categoryData.reduce((s, c) => s + c.count, 0)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Primary Vendors / Payees */}
            {topPayees.length > 0 && (
              <div className="biz-section">
                <h3 className="text-[8.5pt] font-bold uppercase tracking-wider text-black mb-1">
                  Primary Payees & Vendor Disbursements
                </h3>
                <table className="biz-table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>Rank</th>
                      <th>Payee / Commercial Entity</th>
                      <th className="num">Total Disbursed ({currency.symbol})</th>
                      <th className="num">% of Outflows</th>
                      <th className="num">Transaction Frequency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topPayees.map((p, idx) => (
                      <tr key={idx}>
                        <td className="font-mono">{idx + 1}</td>
                        <td className="font-semibold">{p.name}</td>
                        <td className="num font-mono">{formatCurrency(p.amount)}</td>
                        <td className="num font-mono">{p.pct.toFixed(1)}%</td>
                        <td className="num font-mono">{p.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 2: BUDGET VS. ACTUAL VARIANCE AUDIT (BUSINESS PRINT)            */}
        {/* =================================================================== */}
        {activeTab === 'budget_variance' && (
          <div className="space-y-4">
            <div className="biz-section">
              <h3 className="text-[8.5pt] font-bold uppercase tracking-wider text-black mb-1">
                Budgetary Performance Summary
              </h3>
              <table className="biz-table">
                <thead>
                  <tr>
                    <th>Approved Target Budget</th>
                    <th className="num">Actual Period Outflow</th>
                    <th className="num">Net Budget Variance</th>
                    <th className="num">Adherence Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="font-mono font-bold">{formatCurrency(varianceSummary.totalBudget)}</td>
                    <td className="num font-mono font-bold">{formatCurrency(varianceSummary.totalSpent)}</td>
                    <td className="num font-mono font-bold">
                      {varianceSummary.netVariance >= 0
                        ? `+${formatCurrency(varianceSummary.netVariance)} (Surplus)`
                        : `(${formatCurrency(Math.abs(varianceSummary.netVariance))}) (Deficit)`}
                    </td>
                    <td className="num font-semibold">
                      {varianceSummary.overCount === 0
                        ? '100% Within Targets'
                        : `${varianceSummary.overCount} Categories Over Limit`}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="biz-section">
              <h3 className="text-[8.5pt] font-bold uppercase tracking-wider text-black mb-1">
                Itemized Category Spending Variance Ledger
              </h3>
              <table className="biz-table">
                <thead>
                  <tr>
                    <th>Expense Category</th>
                    <th className="num">Target Budget ({currency.symbol})</th>
                    <th className="num">Actual Spent ({currency.symbol})</th>
                    <th className="num">Variance ({currency.symbol})</th>
                    <th className="num">% Consumed</th>
                    <th>Audit Finding</th>
                  </tr>
                </thead>
                <tbody>
                  {budgetVarianceData.map((row) => (
                    <tr key={row.id}>
                      <td className="font-semibold">{row.name}</td>
                      <td className="num font-mono">{row.budget > 0 ? formatCurrency(row.budget) : '—'}</td>
                      <td className="num font-mono">{formatCurrency(row.spent)}</td>
                      <td className="num font-mono font-bold">
                        {row.budget > 0
                          ? row.variance >= 0
                            ? `+${formatCurrency(row.variance)}`
                            : `(${formatCurrency(Math.abs(row.variance))})`
                          : '—'}
                      </td>
                      <td className="num font-mono">{row.budget > 0 ? `${Math.round(row.pct)}%` : '—'}</td>
                      <td className="font-semibold text-[7.5pt]">
                        {row.isOver
                          ? 'UNFAVORABLE (OVER BUDGET)'
                          : row.budget > 0
                          ? 'FAVORABLE (ON TARGET)'
                          : 'UNBUDGETED OUTFLOW'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Portfolio Variance Totals</td>
                    <td className="num font-mono font-bold">{formatCurrency(varianceSummary.totalBudget)}</td>
                    <td className="num font-mono font-bold">{formatCurrency(varianceSummary.totalSpent)}</td>
                    <td className="num font-mono font-bold">
                      {varianceSummary.netVariance >= 0
                        ? `+${formatCurrency(varianceSummary.netVariance)}`
                        : `(${formatCurrency(Math.abs(varianceSummary.netVariance))})`}
                    </td>
                    <td className="num font-mono font-bold">
                      {varianceSummary.totalBudget > 0
                        ? `${Math.round((varianceSummary.totalSpent / varianceSummary.totalBudget) * 100)}%`
                        : '—'}
                    </td>
                    <td>{varianceSummary.overCount === 0 ? 'Compliant' : `${varianceSummary.overCount} Exceptions`}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 3: BALANCE SHEET & ASSET HOLDINGS (BUSINESS PRINT)              */}
        {/* =================================================================== */}
        {activeTab === 'net_worth' && (
          <div className="space-y-4">
            <div className="biz-section">
              <h3 className="text-[8.5pt] font-bold uppercase tracking-wider text-black mb-1">
                Balance Sheet & Portfolio Asset Holdings
              </h3>
              <table className="biz-table">
                <thead>
                  <tr>
                    <th>Account Title</th>
                    <th>Account Classification</th>
                    <th>Reconciliation Status</th>
                    <th className="num">Current Book Balance ({currency.symbol})</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((acc) => (
                    <tr key={acc.id}>
                      <td className="font-semibold">{acc.name}</td>
                      <td>{acc.type || 'Checking Account'}</td>
                      <td>Active & Reconciled</td>
                      <td className="num font-mono font-bold">
                        {acc.balance >= 0 ? formatCurrency(acc.balance) : `(${formatCurrency(Math.abs(acc.balance))})`}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3}>Total Net Asset Value (Portfolio Equity)</td>
                    <td className="num font-mono font-bold text-sm">
                      {formatCurrency(accounts.reduce((sum, a) => sum + a.balance, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {netWorthTrajectory.length > 0 && (
              <div className="biz-section">
                <h3 className="text-[8.5pt] font-bold uppercase tracking-wider text-black mb-1">
                  Historical Net Worth Progression Schedule
                </h3>
                <table className="biz-table">
                  <thead>
                    <tr>
                      <th>Statement Date</th>
                      <th className="num">Ending Portfolio Net Worth ({currency.symbol})</th>
                      <th className="num">Period Classification</th>
                    </tr>
                  </thead>
                  <tbody>
                    {netWorthTrajectory.slice(-12).map((pt, idx) => (
                      <tr key={idx}>
                        <td className="font-mono">{formatDate(pt.date)}</td>
                        <td className="num font-mono font-bold">{formatCurrency(pt.balance)}</td>
                        <td className="num text-[7.5pt]">Reconciled Balance</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 4: STATEMENT OF PROFIT & LOSS (BUSINESS PRINT)                  */}
        {/* =================================================================== */}
        {activeTab === 'income_statement' && (
          <div className="space-y-4">
            <div className="biz-section">
              <h3 className="text-[8.5pt] font-bold uppercase tracking-wider text-black mb-1">
                Statement of Operating Revenues and Expenditures (P&L)
              </h3>
              <table className="biz-table">
                <thead>
                  <tr>
                    <th style={{ width: '60%' }}>Accounting Classification</th>
                    <th className="num" style={{ width: '20%' }}>Sub-Account ({currency.symbol})</th>
                    <th className="num" style={{ width: '20%' }}>Line Total ({currency.symbol})</th>
                  </tr>
                </thead>
                <tbody>
                  {/* I. Operating Revenues */}
                  <tr className="!bg-neutral-100 font-bold">
                    <td colSpan={3} className="text-black uppercase text-[8pt] tracking-wide">
                      I. Operating Revenues (Inflows)
                    </td>
                  </tr>
                  {incomeStatementData.incomeRows.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="pl-6 italic text-neutral-500">No revenue entries recorded.</td>
                    </tr>
                  ) : (
                    incomeStatementData.incomeRows.map((r, i) => (
                      <tr key={i}>
                        <td className="pl-6 font-semibold">{r.name}</td>
                        <td className="num font-mono">{formatCurrency(r.total)}</td>
                        <td className="num font-mono">—</td>
                      </tr>
                    ))
                  )}
                  <tr className="font-bold border-t border-black">
                    <td className="pl-4 uppercase">Total Operating Revenues</td>
                    <td className="num font-mono">—</td>
                    <td className="num font-mono font-bold">{formatCurrency(totalIncome)}</td>
                  </tr>

                  {/* Spacer */}
                  <tr><td colSpan={3} className="!py-2 !border-none"></td></tr>

                  {/* II. Operating Expenses */}
                  <tr className="!bg-neutral-100 font-bold">
                    <td colSpan={3} className="text-black uppercase text-[8pt] tracking-wide">
                      II. Operating Expenditures (Outflows)
                    </td>
                  </tr>
                  {incomeStatementData.expenseRows.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="pl-6 italic text-neutral-500">No expenditure entries recorded.</td>
                    </tr>
                  ) : (
                    incomeStatementData.expenseRows.map((r, i) => (
                      <tr key={i}>
                        <td className="pl-6 font-semibold">{r.name}</td>
                        <td className="num font-mono">{formatCurrency(r.total)}</td>
                        <td className="num font-mono">—</td>
                      </tr>
                    ))
                  )}
                  <tr className="font-bold border-t border-black">
                    <td className="pl-4 uppercase">Total Operating Expenditures</td>
                    <td className="num font-mono">—</td>
                    <td className="num font-mono font-bold">{formatCurrency(totalExpense)}</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr>
                    <td className="uppercase text-[9pt] font-black">
                      III. Net Operating Surplus / (Deficit)
                    </td>
                    <td className="num font-mono font-bold">—</td>
                    <td className="num font-mono font-black text-sm">
                      {netSavings >= 0 ? `+${formatCurrency(netSavings)}` : `(${formatCurrency(Math.abs(netSavings))})`}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 5: TAX DEDUCTIONS SCHEDULE (BUSINESS PRINT)                     */}
        {/* =================================================================== */}
        {activeTab === 'tax_summary' && (
          <div className="space-y-4">
            <div className="biz-section">
              <h3 className="text-[8.5pt] font-bold uppercase tracking-wider text-black mb-1">
                Schedule of Qualified Tax Deductions & Business Expenditures
              </h3>
              <table className="biz-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Payee / Commercial Institution</th>
                    <th>Tax Category</th>
                    <th>Business Purpose / Memo</th>
                    <th className="num">Qualified Amount ({currency.symbol})</th>
                  </tr>
                </thead>
                <tbody>
                  {taxDeductibleExpenses.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center italic py-4">No deductible expenditures identified in this period.</td>
                    </tr>
                  ) : (
                    taxDeductibleExpenses.map((tx) => (
                      <tr key={tx.id}>
                        <td className="font-mono text-[7.5pt]">{formatDate(tx.date)}</td>
                        <td className="font-semibold">{tx.payee}</td>
                        <td>{tx.category_name}</td>
                        <td className="italic text-[7.5pt]">{tx.memo || '—'}</td>
                        <td className="num font-mono font-bold">{formatCurrency(Math.abs(tx.amount))}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4} className="uppercase font-bold">
                      Total Qualified Deductions ({taxDeductibleExpenses.length} Items)
                    </td>
                    <td className="num font-mono font-black text-sm">
                      {formatCurrency(taxDeductibleTotal)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Formal Business Footer */}
        <div className="mt-8 pt-2 border-t-2 border-black flex justify-between items-center text-[7pt] text-neutral-600 font-sans">
          <div>
            <span className="font-bold text-black uppercase tracking-wider">CONFIDENTIAL FINANCIAL RECORD</span>
            <span className="mx-2">•</span>
            <span>FOR PERSONAL TAX & FINANCIAL PLANNING PURPOSES ONLY</span>
          </div>
          <div className="font-mono text-black font-semibold">
            rMoney Pro Statement • Page 1 of 1
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 2. INTERACTIVE WEB APPLICATION DASHBOARD (Visible on Screen ONLY)      */}
      {/* ===================================================================== */}
      <div className="print:hidden space-y-8 max-w-6xl pb-16">
        {/* Web Page Header */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-3xl font-bold text-slate-800">Financial Reports</h1>
            {proStatus ? (
              <span className="px-2.5 py-0.5 text-xs font-black uppercase tracking-wider rounded-full bg-gradient-to-r from-amber-500 to-indigo-600 text-white shadow-xs">
                PRO ACTIVE
              </span>
            ) : (
              <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                Standard
              </span>
            )}
          </div>
          <p className="text-slate-500 text-sm mt-0.5">
            Deep-dive financial statements, category distributions, and wealth trajectory
          </p>
        </div>

        {/* Action Buttons: PDF, Print & Export */}
        <div className="flex flex-wrap items-center gap-2 no-print">
          <button
            onClick={handleDownloadPDF}
            disabled={isGeneratingPdf}
            className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 shadow-xs cursor-pointer ${
              proStatus || activeTab === 'overview'
                ? 'bg-indigo-600 border-indigo-700 text-white hover:bg-indigo-700 shadow-sm'
                : 'bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-600'
            } ${isGeneratingPdf ? 'opacity-75 cursor-wait' : ''}`}
            title={
              isGeneratingPdf
                ? 'Generating financial statement PDF...'
                : proStatus || activeTab === 'overview'
                ? 'Download Financial Statement PDF'
                : 'Advanced report PDF export is an rMoney Pro feature'
            }
          >
            {isGeneratingPdf ? (
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : downloadSuccess ? (
              <Check size={15} className="text-emerald-300" />
            ) : (
              <FileDown size={15} />
            )}
            <span>
              {isGeneratingPdf
                ? 'Generating PDF...'
                : downloadSuccess
                ? 'Downloaded!'
                : 'Download PDF'}
            </span>
            {!proStatus && activeTab !== 'overview' && (
              <span className="text-[9px] font-black uppercase bg-gradient-to-r from-amber-500 to-indigo-600 text-white px-1 py-0.2 rounded">
                PRO
              </span>
            )}
          </button>

          <button
            onClick={handlePrintReport}
            className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer ${
              proStatus || activeTab === 'overview'
                ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                : 'bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-600'
            }`}
            title={
              proStatus || activeTab === 'overview'
                ? 'Print or Save as PDF'
                : 'Printable reports are an rMoney Pro feature'
            }
          >
            <Printer size={15} />
            <span>Print Report</span>
            {!proStatus && activeTab !== 'overview' && (
              <span className="text-[9px] font-black uppercase bg-gradient-to-r from-amber-500 to-indigo-600 text-white px-1 py-0.2 rounded">
                PRO
              </span>
            )}
          </button>

          <button
            onClick={handleExportCSV}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-colors flex items-center gap-1.5 shadow-xs ${
              proStatus
                ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                : 'bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-600'
            }`}
            title={proStatus ? 'Export current report to CSV' : 'CSV exports are an rMoney Pro feature'}
          >
            <Download size={15} />
            <span>Export CSV</span>
            {!proStatus && (
              <span className="text-[9px] font-black uppercase bg-gradient-to-r from-amber-500 to-indigo-600 text-white px-1 py-0.2 rounded">
                PRO
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Reports Sub-Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 overflow-x-auto pb-1 no-print">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'overview'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <BarChart3 size={16} />
          <span>Cash Flow & Overview</span>
        </button>

        <button
          onClick={() => handleSelectTab('budget_variance')}
          className={`px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'budget_variance'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Target size={16} className={proStatus ? 'text-amber-500' : 'text-slate-400'} />
          <span>Budget Variance</span>
          {!proStatus && (
            <span className="text-[9px] font-black uppercase bg-gradient-to-r from-amber-500 to-indigo-600 text-white px-1 py-0.2 rounded">
              PRO
            </span>
          )}
        </button>

        <button
          onClick={() => handleSelectTab('net_worth')}
          className={`px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'net_worth'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Activity size={16} className={proStatus ? 'text-indigo-600' : 'text-slate-400'} />
          <span>Net Worth Trajectory</span>
          {!proStatus && (
            <span className="text-[9px] font-black uppercase bg-gradient-to-r from-amber-500 to-indigo-600 text-white px-1 py-0.2 rounded">
              PRO
            </span>
          )}
        </button>

        <button
          onClick={() => handleSelectTab('income_statement')}
          className={`px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'income_statement'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileSpreadsheet size={16} className={proStatus ? 'text-emerald-600' : 'text-slate-400'} />
          <span>Income Statement (P&L)</span>
          {!proStatus && (
            <span className="text-[9px] font-black uppercase bg-gradient-to-r from-amber-500 to-indigo-600 text-white px-1 py-0.2 rounded">
              PRO
            </span>
          )}
        </button>

        <button
          onClick={() => handleSelectTab('tax_summary')}
          className={`px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'tax_summary'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileText size={16} className={proStatus ? 'text-purple-600' : 'text-slate-400'} />
          <span>Tax Deductions</span>
          {!proStatus && (
            <span className="text-[9px] font-black uppercase bg-gradient-to-r from-amber-500 to-indigo-600 text-white px-1 py-0.2 rounded">
              PRO
            </span>
          )}
        </button>
      </div>

      {/* Control Bar: Account Filter & Timeframe Presets */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        {/* Account Selector */}
        <div className="flex items-center gap-2">
          <Wallet size={16} className="text-slate-400 shrink-0" />
          <select
            value={selectedAccountId}
            onChange={(e) =>
              setSelectedAccountId(e.target.value === 'all' ? 'all' : parseInt(e.target.value))
            }
            className="border-none bg-transparent font-bold text-sm text-slate-800 focus:outline-none cursor-pointer"
          >
            <option value="all">All Accounts ({accounts.length})</option>
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.name}
              </option>
            ))}
          </select>
        </div>

        {/* Timeframe Presets & Custom Range */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex items-center bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setTimeRange('this_month')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                timeRange === 'this_month' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              This Month
            </button>
            <button
              onClick={() => setTimeRange('last_month')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                timeRange === 'last_month' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Last Month
            </button>
            <button
              onClick={() => setTimeRange('last_90_days')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                timeRange === 'last_90_days' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              90 Days
            </button>
            <button
              onClick={() => setTimeRange('this_year')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                timeRange === 'this_year' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              This Year
            </button>
            <button
              onClick={() => setTimeRange('all_time')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                timeRange === 'all_time' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              All Time
            </button>
            <button
              onClick={handleSelectCustomTimeRange}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1 ${
                timeRange === 'custom' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>Custom</span>
              {!proStatus && (
                <span className="text-[9px] font-black uppercase bg-gradient-to-r from-amber-500 to-indigo-600 text-white px-1 py-0.2 rounded">
                  PRO
                </span>
              )}
            </button>
          </div>

          {/* Custom Date Pickers when 'custom' is active and user is Pro */}
          {timeRange === 'custom' && proStatus && (
            <div className="flex items-center gap-2 pt-2 sm:pt-0">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="px-2.5 py-1 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 outline-none"
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="px-2.5 py-1 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 outline-none"
              />
            </div>
          )}
        </div>
      </div>

      {loading && (
        <div className="bg-white p-12 rounded-3xl border border-slate-200 text-center text-slate-400 font-semibold animate-pulse">
          Loading financial report data...
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 1: CASH FLOW & OVERVIEW (Available to All)                           */}
      {/* ========================================================================= */}
      {!loading && activeTab === 'overview' && (
        <div className="space-y-8 animate-in fade-in duration-150">
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
            <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider truncate">Total Income</span>
                <div className="p-1.5 sm:p-2 bg-emerald-50 text-emerald-600 rounded-lg sm:rounded-xl shrink-0">
                  <ArrowUpRight size={16} className="sm:w-[18px] sm:h-[18px]" />
                </div>
              </div>
              <p className="text-lg sm:text-2xl font-black text-slate-900 tabular-nums truncate">
                {formatCurrency(totalIncome)}
              </p>
              <p className="text-[10px] sm:text-[11px] text-slate-400 truncate">Deposits & earnings</p>
            </div>

            <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider truncate">Total Spending</span>
                <div className="p-1.5 sm:p-2 bg-red-50 text-red-600 rounded-lg sm:rounded-xl shrink-0">
                  <ArrowDownRight size={16} className="sm:w-[18px] sm:h-[18px]" />
                </div>
              </div>
              <p className="text-lg sm:text-2xl font-black text-slate-900 tabular-nums truncate">
                {formatCurrency(totalExpense)}
              </p>
              <p className="text-[10px] sm:text-[11px] text-slate-400 truncate">Total outflows</p>
            </div>

            <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider truncate">Net Savings</span>
                <div
                  className={`p-1.5 sm:p-2 rounded-lg sm:rounded-xl shrink-0 ${
                    netSavings >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
                  }`}
                >
                  {netSavings >= 0 ? <TrendingUp size={16} className="sm:w-[18px] sm:h-[18px]" /> : <TrendingDown size={16} className="sm:w-[18px] sm:h-[18px]" />}
                </div>
              </div>
              <p
                className={`text-lg sm:text-2xl font-black tabular-nums truncate ${
                  netSavings >= 0 ? 'text-emerald-600' : 'text-red-600'
                }`}
              >
                {netSavings < 0 ? '-' : '+'}{formatCurrency(Math.abs(netSavings))}
              </p>
              <p className="text-[10px] sm:text-[11px] text-slate-400 truncate">Net cash flow</p>
            </div>

            <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider truncate">Savings Rate</span>
                <div className="p-1.5 sm:p-2 bg-indigo-50 text-indigo-600 rounded-lg sm:rounded-xl shrink-0">
                  <Percent size={16} className="sm:w-[18px] sm:h-[18px]" />
                </div>
              </div>
              <p className="text-lg sm:text-2xl font-black text-slate-900 tabular-nums truncate">
                {savingsRate.toFixed(1)}%
              </p>
              <p className="text-[10px] sm:text-[11px] text-slate-400 truncate">Earnings retained</p>
            </div>
          </div>

          {/* Main Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Monthly Cash Flow Trend (7 cols) */}
            <div className="lg:col-span-7 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                    <BarChart3 size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-800">Monthly Cash Flow Trend</h3>
                    <p className="text-xs text-slate-400">Income vs. Expense comparison over time</p>
                  </div>
                </div>
              </div>

              <div className="h-72 w-full pt-2">
                {monthlyTrend.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-slate-400 text-sm italic">
                    No transaction data available for the selected period.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyTrend} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} tickLine={false} />
                      <YAxis
                        stroke="#94a3b8"
                        fontSize={11}
                        tickLine={false}
                        tickFormatter={(val) => formatCurrency(val, { compact: true })}
                      />
                      <Tooltip
                        formatter={(value: any) => [formatCurrency(Number(value)), '']}
                        contentStyle={{
                          backgroundColor: '#ffffff',
                          borderRadius: '16px',
                          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
                          border: '1px solid #e2e8f0',
                          fontSize: '12px',
                        }}
                      />
                      <Legend
                        verticalAlign="top"
                        align="right"
                        iconType="circle"
                        wrapperStyle={{ paddingBottom: '10px', fontSize: '12px' }}
                      />
                      <Bar dataKey="income" name="Income" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={32} />
                      <Bar dataKey="expense" name="Expense" fill="#ef4444" radius={[6, 6, 0, 0]} maxBarSize={32} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Category Spending Donut Chart (5 cols) */}
            <div className="lg:col-span-5 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                    <PieChartIcon size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-800">Spending by Category</h3>
                    <p className="text-xs text-slate-400">Expense breakdown by category</p>
                  </div>
                </div>
              </div>

              <div className="h-72 w-full flex items-center justify-center">
                {categoryData.length === 0 ? (
                  <div className="text-slate-400 text-sm italic">No expenses in this period.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryData}
                        cx="50%"
                        cy="50%"
                        innerRadius={65}
                        outerRadius={95}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {categoryData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: any) => [formatCurrency(Number(value)), 'Spent']}
                        contentStyle={{
                          backgroundColor: '#ffffff',
                          borderRadius: '16px',
                          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
                          border: '1px solid #e2e8f0',
                          fontSize: '12px',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          {/* Category Breakdown Table & Top Payees Ranking */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Category Detailed List (7 cols) */}
            <div className="lg:col-span-7 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
                    <Layers size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-800">Category Distribution</h3>
                    <p className="text-xs text-slate-400">Ranked by highest total spend</p>
                  </div>
                </div>
                <span className="text-xs font-semibold text-slate-400">{categoryData.length} categories</span>
              </div>

              <div className="space-y-3 overflow-y-auto max-h-80 pr-1">
                {categoryData.length === 0 ? (
                  <p className="text-slate-400 text-sm italic py-6 text-center">No category spending recorded.</p>
                ) : (
                  categoryData.map((cat, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: CATEGORY_COLORS[idx % CATEGORY_COLORS.length] }}
                          />
                          <span className="text-slate-800">{cat.name}</span>
                          <span className="text-slate-400 font-normal">({cat.count} txs)</span>
                        </div>
                        <div className="flex items-center gap-2 font-mono">
                          <span className="text-slate-900 font-bold tabular-nums">
                            {formatCurrency(cat.value)}
                          </span>
                          <span className="text-slate-400 w-12 text-right">({cat.pct.toFixed(1)}%)</span>
                        </div>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${Math.min(cat.pct, 100)}%`,
                            backgroundColor: CATEGORY_COLORS[idx % CATEGORY_COLORS.length],
                          }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Top Payees Leaderboard (5 cols) */}
            <div className="lg:col-span-5 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                    <Award size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-800">Top Payees</h3>
                    <p className="text-xs text-slate-400">Where your money goes most</p>
                  </div>
                </div>
                <span className="text-xs font-semibold text-slate-400">Top {topPayees.length}</span>
              </div>

              <div className="space-y-2.5 overflow-y-auto max-h-80 pr-1">
                {topPayees.length === 0 ? (
                  <p className="text-slate-400 text-sm italic py-6 text-center">No payees recorded.</p>
                ) : (
                  topPayees.map((payee, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2.5 bg-slate-50 hover:bg-slate-100/70 rounded-xl transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-xs font-bold text-slate-400 w-5 text-center shrink-0">
                          #{idx + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-800 truncate">{payee.name}</p>
                          <p className="text-[11px] text-slate-400">
                            {payee.count} {payee.count === 1 ? 'transaction' : 'transactions'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-bold text-red-600 font-mono tabular-nums">
                          {formatCurrency(payee.amount)}
                        </p>
                        <p className="text-[10px] text-slate-400">{payee.pct.toFixed(1)}% of expenses</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: BUDGET VS. ACTUAL VARIANCE (PRO)                                  */}
      {/* ========================================================================= */}
      {!loading && activeTab === 'budget_variance' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* Variance KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Planned Budget</span>
              <p className="text-2xl font-black text-slate-900 mt-1 tabular-nums">
                {formatCurrency(varianceSummary.totalBudget)}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">Assigned monthly category targets</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Actual Period Spending</span>
              <p className="text-2xl font-black text-slate-900 mt-1 tabular-nums">
                {formatCurrency(varianceSummary.totalSpent)}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">Total outflows recorded in this period</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                {varianceSummary.netVariance >= 0 ? 'Net Budget Surplus' : 'Net Budget Deficit'}
              </span>
              <p
                className={`text-2xl font-black mt-1 tabular-nums ${
                  varianceSummary.netVariance >= 0 ? 'text-emerald-600' : 'text-rose-600'
                }`}
              >
                {varianceSummary.netVariance >= 0 ? '+' : '-'}{formatCurrency(Math.abs(varianceSummary.netVariance))}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {varianceSummary.overCount > 0
                  ? `${varianceSummary.overCount} category over target`
                  : 'All categories within targets'}
              </p>
            </div>
          </div>

          {/* Detailed Variance Table */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-800">Category Spending Variance</h3>
                <p className="text-xs text-slate-400">Side-by-side comparison of planned budgets versus real ledger debits</p>
              </div>
              <span className="text-xs font-bold text-slate-500 bg-slate-50 border border-slate-200 px-3 py-1 rounded-xl">
                {budgetVarianceData.length} Expense Categories
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-100">
                  <tr>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4 text-right">Target Budget</th>
                    <th className="py-3 px-4 text-right">Actual Spent</th>
                    <th className="py-3 px-4 text-right">Variance ({currency.symbol})</th>
                    <th className="py-3 px-4 text-right">% Used</th>
                    <th className="py-3 px-4 w-48">Adherence Track</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {budgetVarianceData.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4 font-bold text-slate-800 flex items-center gap-2">
                        <span>{row.name}</span>
                        {row.isOver && (
                          <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.2 bg-rose-100 text-rose-700 rounded border border-rose-200">
                            Over
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-slate-600">
                        {row.budget > 0 ? formatCurrency(row.budget) : '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        {formatCurrency(row.spent)}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono font-bold ${
                          row.variance >= 0 ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                      >
                        {row.budget > 0
                          ? row.variance >= 0
                            ? `+${formatCurrency(row.variance)}`
                            : `-${formatCurrency(Math.abs(row.variance))}`
                          : '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-slate-700">
                        {row.budget > 0 ? `${Math.round(row.pct)}%` : '—'}
                      </td>
                      <td className="py-3 px-4">
                        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden flex">
                          <div
                            className={`h-full rounded-full transition-all ${
                              row.isOver
                                ? 'bg-rose-500'
                                : row.pct >= 80
                                ? 'bg-amber-500'
                                : 'bg-emerald-500'
                            }`}
                            style={{
                              width: row.budget > 0 ? `${Math.min(row.pct, 100)}%` : row.spent > 0 ? '100%' : '0%',
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300">
                  <tr>
                    <td className="py-3 px-4 text-slate-800 uppercase tracking-wider text-xs font-bold">
                      Portfolio Totals:
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-800">
                      {formatCurrency(varianceSummary.totalBudget)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-800">
                      {formatCurrency(varianceSummary.totalSpent)}
                    </td>
                    <td className={`py-3 px-4 text-right font-mono font-bold ${varianceSummary.netVariance >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {varianceSummary.netVariance >= 0 ? '+' : '-'}{formatCurrency(Math.abs(varianceSummary.netVariance))}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-800">
                      {varianceSummary.totalBudget > 0 ? `${Math.round((varianceSummary.totalSpent / varianceSummary.totalBudget) * 100)}%` : '—'}
                    </td>
                    <td className="py-3 px-4 text-slate-500 font-normal text-xs">
                      {varianceSummary.overCount === 0 ? 'All within targets' : `${varianceSummary.overCount} over limit`}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: NET WORTH TRAJECTORY (PRO)                                         */}
      {/* ========================================================================= */}
      {!loading && activeTab === 'net_worth' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-800">Historical Net Worth Trajectory</h3>
                <p className="text-xs text-slate-400">Cumulative assets & liabilities progression over time</p>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-400 uppercase font-bold">Current Net Worth</span>
                <p className="text-xl font-black text-indigo-950 tabular-nums">
                  {formatCurrency(accounts.reduce((sum, a) => sum + a.balance, 0))}
                </p>
              </div>
            </div>

            <div className="h-80 w-full pt-2">
              {netWorthTrajectory.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-400 text-sm italic">
                  No historical balance records available.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={netWorthTrajectory} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="netWorthGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} />
                    <YAxis
                      stroke="#94a3b8"
                      fontSize={11}
                      tickLine={false}
                      tickFormatter={(val) => formatCurrency(val, { compact: true })}
                    />
                    <Tooltip
                      formatter={(val: any) => [formatCurrency(Number(val)), 'Net Worth']}
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        borderRadius: '16px',
                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
                        border: '1px solid #e2e8f0',
                        fontSize: '12px',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="balance"
                      stroke="#4f46e5"
                      strokeWidth={3}
                      fillOpacity={1}
                      fill="url(#netWorthGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Account Composition Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {accounts.map((acc) => (
              <div key={acc.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
                <div>
                  <p className="font-bold text-sm text-slate-800">{acc.name}</p>
                  <p className="text-xs text-slate-400">{acc.type || 'Checking'}</p>
                </div>
                <div className="text-right">
                  <p
                    className={`font-mono font-bold text-sm ${
                      acc.balance < 0 ? 'text-red-500' : 'text-slate-900'
                    }`}
                  >
                    {formatCurrency(acc.balance)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: INCOME STATEMENT / P&L (PRO)                                       */}
      {/* ========================================================================= */}
      {!loading && activeTab === 'income_statement' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <FileSpreadsheet size={18} className="text-emerald-600" />
                  Statement of Income & Expense (P&L)
                </h3>
                <p className="text-xs text-slate-400">Formal itemized accounting breakdown for the period</p>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-400 font-bold uppercase">Net Profit / Loss</span>
                <p
                  className={`text-xl font-black tabular-nums ${
                    netSavings >= 0 ? 'text-emerald-600' : 'text-rose-600'
                  }`}
                >
                  {netSavings < 0 ? '-' : '+'}{formatCurrency(Math.abs(netSavings))}
                </p>
              </div>
            </div>

            <div className="p-6 space-y-6 text-sm">
              {/* Operating Income Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between font-bold text-xs uppercase tracking-wider text-emerald-800 bg-emerald-50/70 p-2.5 rounded-xl border border-emerald-100">
                  <span>Operating Income (Revenues)</span>
                  <span className="font-mono">{formatCurrency(totalIncome)}</span>
                </div>
                <div className="divide-y divide-slate-100 pl-3">
                  {incomeStatementData.incomeRows.length === 0 ? (
                    <p className="text-xs text-slate-400 italic py-2">No income entries recorded.</p>
                  ) : (
                    incomeStatementData.incomeRows.map((r, i) => (
                      <div key={i} className="py-2 flex items-center justify-between text-xs">
                        <span className="text-slate-700 font-medium">{r.name}</span>
                        <span className="font-mono font-semibold text-slate-900">{formatCurrency(r.total)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Operating Expenses Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between font-bold text-xs uppercase tracking-wider text-rose-800 bg-rose-50/70 p-2.5 rounded-xl border border-rose-100">
                  <span>Operating Expenses (Outflows)</span>
                  <span className="font-mono">{formatCurrency(totalExpense)}</span>
                </div>
                <div className="divide-y divide-slate-100 pl-3">
                  {incomeStatementData.expenseRows.length === 0 ? (
                    <p className="text-xs text-slate-400 italic py-2">No expense entries recorded.</p>
                  ) : (
                    incomeStatementData.expenseRows.map((r, i) => (
                      <div key={i} className="py-2 flex items-center justify-between text-xs">
                        <span className="text-slate-700 font-medium">{r.name}</span>
                        <span className="font-mono font-semibold text-slate-900">{formatCurrency(r.total)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Net Income Summary with GAAP accounting double underline */}
              <div className="pt-4 border-t-2 border-slate-900 border-b-4 border-double border-slate-900 pb-2 flex items-center justify-between font-bold text-sm">
                <span className="text-slate-900 uppercase tracking-wide font-black">Net Operating Surplus / (Deficit)</span>
                <span
                  className={`font-mono text-base font-black ${
                    netSavings >= 0 ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  {netSavings < 0 ? '-' : '+'}{formatCurrency(Math.abs(netSavings))}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: TAX DEDUCTIONS & SUMMARY (PRO)                                      */}
      {/* ========================================================================= */}
      {!loading && activeTab === 'tax_summary' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-purple-50 text-purple-600 rounded-2xl">
                <FileText size={24} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">Tax Deductible Expenditures</h3>
                <p className="text-xs text-slate-400">
                  Automatically aggregated healthcare, medical, charitable donation, and business expenses
                </p>
              </div>
            </div>
            <div className="text-right bg-purple-50/70 border border-purple-100 px-5 py-3 rounded-2xl">
              <span className="text-xs font-bold text-purple-700 uppercase tracking-wider block">
                Total Potential Deductions
              </span>
              <span className="text-2xl font-black text-purple-950 font-mono tabular-nums">
                {formatCurrency(taxDeductibleTotal)}
              </span>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Itemized Tax Deduction Entries ({taxDeductibleExpenses.length})
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-100">
                  <tr>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Payee / Merchant</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Memo</th>
                    <th className="py-3 px-4">Receipt Audit</th>
                    <th className="py-3 px-4 text-right">Deductible Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {taxDeductibleExpenses.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400 italic">
                        No deductible entries found in this period.
                      </td>
                    </tr>
                  ) : (
                    taxDeductibleExpenses.map((tx) => (
                      <tr key={tx.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-4 text-slate-600 font-mono">{formatDate(tx.date)}</td>
                        <td className="py-3 px-4 font-bold text-slate-800">{tx.payee}</td>
                        <td className="py-3 px-4 text-slate-600">
                          <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 font-semibold border border-purple-100">
                            {tx.category_name}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-400 italic">{tx.memo || '—'}</td>
                        <td className="py-3 px-4">
                          {tx.attachment_count && tx.attachment_count > 0 ? (
                            <button
                              onClick={() => setViewingReceiptTxId(tx.id)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors cursor-pointer"
                              title="Click to view or manage attached receipts"
                            >
                              <Paperclip size={12} />
                              <span>Verified ({tx.attachment_count})</span>
                            </button>
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-purple-900">
                          {formatCurrency(Math.abs(tx.amount))}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300">
                  <tr>
                    <td colSpan={5} className="py-3 px-4 text-slate-800 uppercase text-right tracking-wider text-xs">
                      Total Qualified Deductions:
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-purple-950 text-sm">
                      {formatCurrency(taxDeductibleTotal)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox / Audit Attachment Viewer Modal */}
      {viewingReceiptTxId !== null && (
        <ReceiptModal
          isOpen={true}
          transactionId={viewingReceiptTxId}
          proStatus={proStatus}
          onTriggerUpgrade={onTriggerUpgrade}
          onClose={() => {
            setViewingReceiptTxId(null);
            loadReportData();
          }}
        />
      )}

      </div>
    </>
  );
};

export default ReportsPage;
