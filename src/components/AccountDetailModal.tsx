import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  TrendingUp,
  CheckCircle2,
  Clock,
  Paperclip,
  ExternalLink,
  ChevronRight,
  Wallet,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Account, Transaction } from '../types';
import { getDb } from '../utils/db';
import { useRegionalSettings, getLocalTodayStr, toLocalDateStr } from '../utils/currency';

interface AccountDetailModalProps {
  account: Account | null;
  isOpen: boolean;
  onClose: () => void;
  onNavigateToLedger?: (accountId: number) => void;
}

interface BalanceHistoryPoint {
  date: string;
  balance: number;
  dailyChange: number;
  txSummary?: string;
}

export const AccountDetailModal: React.FC<AccountDetailModalProps> = ({
  account,
  isOpen,
  onClose,
  onNavigateToLedger,
}) => {
  const { formatCurrency } = useRegionalSettings();
  const [timeframe, setTimeframe] = useState<'30d' | '90d' | '180d' | '1y' | 'all'>('90d');
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  useEffect(() => {
    if (!isOpen || !account) return;

    const fetchAccountData = async () => {
      try {
        const db = await getDb();
        const rows = (await db.select(
          `SELECT t.*, c.name as category_name,
            (SELECT COUNT(*) FROM transaction_attachments a WHERE a.transaction_id = t.id) as attachment_count
           FROM transactions t
           LEFT JOIN categories c ON t.category_id = c.id
           WHERE t.account_id = ?
           ORDER BY t.date ASC, t.id ASC`,
          [account.id]
        )) as Transaction[];

        setTransactions(rows);
      } catch (e) {
        console.error('Error fetching account transactions:', e);
      }
    };

    fetchAccountData();
  }, [isOpen, account]);

  // Compute daily running balance curve
  const { historyPoints, clearedBalance, unclearedBalance, timeframeStats } = useMemo(() => {
    if (!account) {
      return {
        historyPoints: [],
        clearedBalance: 0,
        unclearedBalance: 0,
        timeframeStats: { inflow: 0, outflow: 0, netChange: 0, high: 0, low: 0 },
      };
    }

    const totalTxSum = transactions.reduce((acc, t) => acc + t.amount, 0);
    const initialBaseBalance = account.balance - totalTxSum;

    let running = initialBaseBalance;
    let clearedSum = initialBaseBalance;
    let unclearedSum = 0;

    const pointsByDate: { [date: string]: { balance: number; change: number; payees: string[] } } = {};

    transactions.forEach((tx) => {
      running += tx.amount;
      if (tx.status === 'uncleared') {
        unclearedSum += tx.amount;
      } else {
        clearedSum += tx.amount;
      }

      if (!pointsByDate[tx.date]) {
        pointsByDate[tx.date] = { balance: running, change: tx.amount, payees: [tx.payee] };
      } else {
        pointsByDate[tx.date].balance = running;
        pointsByDate[tx.date].change += tx.amount;
        pointsByDate[tx.date].payees.push(tx.payee);
      }
    });

    // Determine timeframe cutoff date
    const now = new Date();
    const cutoffDate = new Date();
    if (timeframe === '30d') cutoffDate.setDate(now.getDate() - 30);
    else if (timeframe === '90d') cutoffDate.setDate(now.getDate() - 90);
    else if (timeframe === '180d') cutoffDate.setDate(now.getDate() - 180);
    else if (timeframe === '1y') cutoffDate.setFullYear(now.getFullYear() - 1);
    else cutoffDate.setFullYear(1970);

    const cutoffStr = toLocalDateStr(cutoffDate);

    // Filter points and transactions within timeframe
    const sortedDates = Object.keys(pointsByDate).sort();
    const filteredPoints: BalanceHistoryPoint[] = [];

    sortedDates.forEach((d) => {
      if (d >= cutoffStr) {
        filteredPoints.push({
          date: d,
          balance: Math.round(pointsByDate[d].balance * 100) / 100,
          dailyChange: pointsByDate[d].change,
          txSummary: pointsByDate[d].payees.slice(0, 2).join(', '),
        });
      }
    });

    if (filteredPoints.length === 0) {
      filteredPoints.push({
        date: getLocalTodayStr(0),
        balance: account.balance,
        dailyChange: 0,
      });
    }

    // Inflow / Outflow in timeframe
    let inflow = 0;
    let outflow = 0;
    transactions.forEach((tx) => {
      if (tx.date >= cutoffStr) {
        if (tx.amount > 0) inflow += tx.amount;
        else outflow += Math.abs(tx.amount);
      }
    });

    const balances = filteredPoints.map((p) => p.balance);
    const high = balances.length > 0 ? Math.max(...balances) : account.balance;
    const low = balances.length > 0 ? Math.min(...balances) : account.balance;
    const netChange = inflow - outflow;

    return {
      historyPoints: filteredPoints,
      clearedBalance: Math.round(clearedSum * 100) / 100,
      unclearedBalance: Math.round(unclearedSum * 100) / 100,
      timeframeStats: {
        inflow: Math.round(inflow * 100) / 100,
        outflow: Math.round(outflow * 100) / 100,
        netChange: Math.round(netChange * 100) / 100,
        high,
        low,
      },
    };
  }, [account, transactions, timeframe]);

  if (!isOpen || !account) return null;

  const recentTxs = [...transactions].reverse().slice(0, 8);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/60">
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-blue-600 text-white rounded-2xl shadow-sm">
              <Wallet size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-800">{account.name}</h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-200 text-slate-700">
                  {account.type || 'Checking'}
                </span>
                {account.is_favorite && (
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full border border-amber-200">
                    Favorite
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Detailed Running Balance History & Liquidity Breakdown
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Key KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4">
            <div className="bg-slate-50 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-200/80">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 truncate block">
                Current Balance
              </span>
              <div
                className={`text-lg sm:text-2xl font-extrabold font-mono mt-0.5 sm:mt-1 truncate ${
                  account.balance < 0 ? 'text-rose-600' : 'text-slate-900'
                }`}
              >
                {formatCurrency(account.balance)}
              </div>
              <span className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5 block truncate">
                {transactions.length} entries
              </span>
            </div>

            <div className="bg-emerald-50/60 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-emerald-200/70">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1 truncate">
                <CheckCircle2 size={12} className="shrink-0" />
                Cleared
              </span>
              <div className="text-lg sm:text-2xl font-extrabold text-emerald-700 font-mono mt-0.5 sm:mt-1 truncate">
                {formatCurrency(clearedBalance)}
              </div>
              <span className="text-[10px] sm:text-[11px] text-emerald-600 mt-0.5 block truncate">
                Reconciled
              </span>
            </div>

            <div className="bg-amber-50/60 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-amber-200/70">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1 truncate">
                <Clock size={12} className="shrink-0" />
                Uncleared
              </span>
              <div className="text-lg sm:text-2xl font-extrabold text-amber-700 font-mono mt-0.5 sm:mt-1 truncate">
                {formatCurrency(unclearedBalance)}
              </div>
              <span className="text-[10px] sm:text-[11px] text-amber-600 mt-0.5 block truncate">
                Pending
              </span>
            </div>

            <div className="bg-blue-50/60 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-blue-200/70">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-blue-800 truncate block">
                Net ({timeframe.toUpperCase()})
              </span>
              <div
                className={`text-lg sm:text-2xl font-extrabold font-mono mt-0.5 sm:mt-1 truncate ${
                  timeframeStats.netChange >= 0 ? 'text-blue-700' : 'text-rose-600'
                }`}
              >
                {formatCurrency(timeframeStats.netChange, { showSign: true })}
              </div>
              <span className="text-[10px] sm:text-[11px] text-blue-600 mt-0.5 block truncate">
                +{formatCurrency(timeframeStats.inflow)} / -{formatCurrency(timeframeStats.outflow)}
              </span>
            </div>
          </div>

          {/* Running Balance Area Chart */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <TrendingUp size={18} className="text-blue-600" />
                  Running Balance Trajectory
                </h3>
                <p className="text-xs text-slate-500">
                  Daily balance evolution over time based on posted transactions.
                </p>
              </div>

              {/* Timeframe Selector */}
              <div className="bg-slate-100 p-1 rounded-xl flex items-center border border-slate-200">
                {(['30d', '90d', '180d', '1y', 'all'] as const).map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setTimeframe(tf)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      timeframe === tf
                        ? 'bg-white text-slate-800 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tf.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-64 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={historyPoints} margin={{ top: 10, right: 15, left: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="accountBalanceGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    formatter={(val: any) => [formatCurrency(Number(val)), 'Account Balance']}
                    labelFormatter={(label) => `Date: ${label}`}
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderRadius: '12px',
                      color: '#fff',
                      fontSize: '12px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="balance"
                    stroke="#2563eb"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#accountBalanceGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Recent Activity Mini-Ledger */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-800">Recent Transactions</h3>
              {onNavigateToLedger && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onNavigateToLedger(account.id);
                  }}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
                >
                  Open in Full Register
                  <ExternalLink size={13} />
                </button>
              )}
            </div>

            {/* Mobile Feed */}
            <div className="sm:hidden divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
              {recentTxs.length === 0 ? (
                <div className="py-6 text-center text-slate-400 font-medium text-xs">
                  No transactions recorded for this account.
                </div>
              ) : (
                recentTxs.map((tx) => (
                  <div key={tx.id} className="p-3 bg-white space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-800 truncate flex items-center gap-1">
                        {tx.payee}
                        {Boolean(tx.attachment_count && tx.attachment_count > 0) && (
                          <Paperclip size={11} className="text-indigo-500 shrink-0" />
                        )}
                      </span>
                      <span
                        className={`font-mono font-bold shrink-0 ${
                          tx.amount < 0 ? 'text-slate-800' : 'text-emerald-600'
                        }`}
                      >
                        {tx.amount > 0 ? '+' : ''}
                        {formatCurrency(tx.amount)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>{tx.date} • {tx.category_name || 'Uncategorized'}</span>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider ${
                          tx.status === 'reconciled'
                            ? 'bg-emerald-100 text-emerald-800'
                            : tx.status === 'cleared'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {tx.status || 'uncleared'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Desktop Table */}
            <div className="hidden sm:block overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="py-2.5 px-4">Date</th>
                    <th className="py-2.5 px-4">Payee</th>
                    <th className="py-2.5 px-4">Category</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentTxs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-400 font-medium">
                        No transactions recorded for this account.
                      </td>
                    </tr>
                  ) : (
                    recentTxs.map((tx) => (
                      <tr key={tx.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-2.5 px-4 text-slate-600 font-mono">{tx.date}</td>
                        <td className="py-2.5 px-4 font-bold text-slate-800">
                          <div className="flex items-center gap-1.5">
                            <span>{tx.payee}</span>
                            {Boolean(tx.attachment_count && tx.attachment_count > 0) && (
                              <span title="Has receipt attachment">
                                <Paperclip size={12} className="text-indigo-500" />
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-4 text-slate-500">{tx.category_name || 'Uncategorized'}</td>
                        <td className="py-2.5 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              tx.status === 'reconciled'
                                ? 'bg-emerald-100 text-emerald-800'
                                : tx.status === 'cleared'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {tx.status || 'uncleared'}
                          </span>
                        </td>
                        <td
                          className={`py-2.5 px-4 text-right font-mono font-bold ${
                            tx.amount < 0 ? 'text-slate-800' : 'text-emerald-600'
                          }`}
                        >
                          {tx.amount > 0 ? '+' : ''}
                          {formatCurrency(tx.amount)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between p-4 px-6 border-t border-slate-100 bg-slate-50/70">
          <p className="text-xs text-slate-400">
            Account ID: #{account.id} • Real-time running balance calculation
          </p>
          <div className="flex items-center gap-2">
            {onNavigateToLedger && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onNavigateToLedger(account.id);
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs flex items-center gap-1.5"
              >
                <span>View Full Register</span>
                <ChevronRight size={14} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccountDetailModal;
