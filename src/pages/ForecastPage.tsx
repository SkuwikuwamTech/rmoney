import { useState, useEffect } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
} from 'recharts';
import {
  BarChart3,
  Calendar,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  List,
  ShieldAlert,
  Wallet,
  Edit2,
  RotateCcw,
  X,
  Sparkles,
  Clock,
  Lightbulb,
  Plus,
  Check,
  Trash2,
  ArrowRightLeft,
  Calculator,
} from 'lucide-react';
import { getDb } from '../utils/db';
import { Account, ScheduledTransaction, ScheduledTransactionOverride } from '../types';
import { useRegionalSettings } from '../utils/currency';
import DebtPayoffPlanner from '../components/DebtPayoffPlanner';

interface ForecastPoint {
  date: string;
  balance: number;
}

export interface ScenarioEvent {
  id: string;
  statementType: 'spend_date' | 'receive_date' | 'transfer_date';
  payee: string;
  amount: number;
  date: string;
  frequency?: string; // 'once' | 'daily' | 'weekly' | 'bi-weekly' | 'monthly' | 'yearly'
  accountId: number | 'all';
  toAccountId?: number;
}

interface FutureTransaction {
  scheduledId: number | string;
  date: string;
  originalDate: string;
  isDateChanged?: boolean;
  payee: string;
  amount: number;
  type: string;
  runningBalance: number;
  isOverridden?: boolean;
  isScenario?: boolean;
  originalAmount: number;
  originalPayee: string;
  frequency?: string;
}

interface ScheduledOccurrence {
  bill: ScheduledTransaction;
  originalDate: string;
  effectiveDate: string;
  effectiveAmount: number;
  effectivePayee: string;
  isOverridden: boolean;
  isDateChanged: boolean;
}

function advanceDateStr(dateStr: string, frequency: string): string {
  const parts = dateStr.split('-').map(Number);
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  switch (frequency) {
    case 'daily':
      d.setDate(d.getDate() + 1);
      break;
    case 'weekly':
      d.setDate(d.getDate() + 7);
      break;
    case 'bi-weekly':
      d.setDate(d.getDate() + 14);
      break;
    case 'monthly':
      d.setMonth(d.getMonth() + 1);
      break;
    case 'yearly':
      d.setFullYear(d.getFullYear() + 1);
      break;
    default:
      d.setDate(d.getDate() + 1);
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toISODateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

interface ForecastPageProps {
  proStatus?: boolean;
  onTriggerUpgrade?: (reason: 'accounts_limit' | 'what_if_locked' | 'general' | 'reports_locked') => void;
}

const ForecastPage = ({ proStatus = false, onTriggerUpgrade }: ForecastPageProps) => {
  const { formatCurrency, formatDate, currency } = useRegionalSettings();
  const [activeView, setActiveView] = useState<'forecast' | 'debt'>('forecast');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number | 'all'>('all');
  const [horizonDays, setHorizonDays] = useState<number>(365);
  const [data, setData] = useState<ForecastPoint[]>([]);
  const [futureTxs, setFutureTxs] = useState<FutureTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Instance Edit Modal State
  const [editingInstance, setEditingInstance] = useState<{
    scheduledId: number;
    originalDate: string;
    date: string;
    payee: string;
    amount: string;
    originalAmount: number;
    originalPayee: string;
    type: string;
  } | null>(null);

  // What-If Scenario State
  const [isScenarioModalOpen, setIsScenarioModalOpen] = useState(false);
  const [scenarioEvents, setScenarioEvents] = useState<ScenarioEvent[]>([]);

  // What-If Builder Inputs
  const [scenarioAccount, setScenarioAccount] = useState<number | 'all'>('all');
  const [scenarioToAccount, setScenarioToAccount] = useState<number>(0);
  const [scenarioStatement, setScenarioStatement] = useState<'spend_date' | 'receive_date' | 'transfer_date'>('spend_date');
  const [scenarioPayee, setScenarioPayee] = useState('');
  const [scenarioAmount, setScenarioAmount] = useState('100.00');
  const [scenarioDate, setScenarioDate] = useState(() => toISODateString(new Date()));
  const [scenarioFrequency, setScenarioFrequency] = useState<string>('once');

  // Summary Metrics
  const [metrics, setMetrics] = useState({
    startBalance: 0,
    endBalance: 0,
    lowestBalance: 0,
    lowestDate: '',
    netChange: 0,
  });

  const generateForecast = async () => {
    setLoading(true);
    setError(null);
    try {
      const db = await getDb();

      const allAccounts = (await db.select('SELECT * FROM accounts ORDER BY name ASC')) as Account[];
      setAccounts(allAccounts);

      let startBalance = 0;
      if (selectedAccountId === 'all') {
        startBalance = allAccounts.reduce((sum, acc) => sum + (acc.balance || 0), 0);
      } else {
        const acc = allAccounts.find((a) => a.id === selectedAccountId);
        startBalance = acc?.balance || 0;
      }

      let bills: ScheduledTransaction[] = [];
      try {
        bills = (await db.select('SELECT * FROM scheduled_transactions')) as ScheduledTransaction[];
      } catch (err) {
        console.warn('Error querying scheduled_transactions:', err);
      }

      let overrides: ScheduledTransactionOverride[] = [];
      try {
        overrides = (await db.select('SELECT * FROM scheduled_transaction_overrides')) as ScheduledTransactionOverride[];
      } catch (err) {
        console.warn('Error querying scheduled_transaction_overrides:', err);
      }

      const overrideMap = new Map<string, ScheduledTransactionOverride>();
      (overrides || []).forEach((ov) => {
        const key = ov.original_date ? `${ov.scheduled_id}_${ov.original_date}` : `${ov.scheduled_id}_${ov.date}`;
        overrideMap.set(key, ov);
      });

      const forecast: ForecastPoint[] = [];
      const transactions: FutureTransaction[] = [];
      let currentBalance = startBalance;

      const today = new Date();
      const startDateStr = toISODateString(today);

      const targetEnd = new Date(today);
      targetEnd.setDate(today.getDate() + horizonDays);
      const endDateStr = toISODateString(targetEnd);

      // Pre-calculate occurrences within horizon, taking rescheduled dates into account
      const occurrenceMap = new Map<string, ScheduledOccurrence[]>();
      (bills || []).forEach((pBill) => {
        if (!pBill || !pBill.next_date) return;
        const bill = { ...pBill, amount: Math.abs(pBill.amount || 0) };
        let curDateStr = String(bill.next_date).trim();
        if (!curDateStr || curDateStr.length < 10) return;

        if (bill.frequency === 'once') {
          const ov = overrideMap.get(`${bill.id}_${curDateStr}`);
          const effectiveDate = ov?.new_date && ov.new_date.trim() ? ov.new_date.trim() : curDateStr;
          const effectiveAmount = ov?.amount !== undefined && ov?.amount !== null ? Math.abs(ov.amount) : bill.amount;
          const effectivePayee =
            ov?.payee !== undefined && ov?.payee !== null && ov.payee.trim()
              ? ov.payee
              : bill.payee || 'Scheduled';
          const isDateChanged = !!(ov?.new_date && ov.new_date.trim() && ov.new_date.trim() !== curDateStr);

          if (effectiveDate >= startDateStr && effectiveDate <= endDateStr) {
            if (!occurrenceMap.has(effectiveDate)) {
              occurrenceMap.set(effectiveDate, []);
            }
            occurrenceMap.get(effectiveDate)!.push({
              bill,
              originalDate: curDateStr,
              effectiveDate,
              effectiveAmount,
              effectivePayee,
              isOverridden: !!ov,
              isDateChanged,
            });
          }
        } else {
          let safety = 0;
          let remaining = bill.is_closed_ended && bill.remaining_count != null ? bill.remaining_count : Infinity;
          while (curDateStr <= endDateStr && safety < 1000 && remaining > 0) {
            if (bill.is_closed_ended && bill.end_date && curDateStr > bill.end_date) break;
            safety++;
            const ov = overrideMap.get(`${bill.id}_${curDateStr}`);
            const effectiveDate = ov?.new_date && ov.new_date.trim() ? ov.new_date.trim() : curDateStr;
            const effectiveAmount = ov?.amount !== undefined && ov?.amount !== null ? Math.abs(ov.amount) : bill.amount;
            const effectivePayee =
              ov?.payee !== undefined && ov?.payee !== null && ov.payee.trim()
                ? ov.payee
                : bill.payee || 'Scheduled';
            const isDateChanged = !!(ov?.new_date && ov.new_date.trim() && ov.new_date.trim() !== curDateStr);

            if (effectiveDate >= startDateStr && effectiveDate <= endDateStr) {
              if (!occurrenceMap.has(effectiveDate)) {
                occurrenceMap.set(effectiveDate, []);
              }
              occurrenceMap.get(effectiveDate)!.push({
                bill,
                originalDate: curDateStr,
                effectiveDate,
                effectiveAmount,
                effectivePayee,
                isOverridden: !!ov,
                isDateChanged,
              });
            }
            if (bill.is_closed_ended && remaining !== Infinity) {
              remaining--;
            }
            const nextD = advanceDateStr(curDateStr, bill.frequency || 'monthly');
            if (!nextD || nextD === curDateStr || nextD.includes('NaN')) break;
            curDateStr = nextD;
          }
        }
      });

      // Pre-calculate scenario occurrences within horizon (supports recurring scenarios)
      const scenarioMap = new Map<string, ScenarioEvent[]>();
      scenarioEvents.forEach((sc) => {
        let curDateStr = sc.date;
        const freq = sc.frequency || 'once';
        if (freq === 'once') {
          if (curDateStr >= startDateStr && curDateStr <= endDateStr) {
            if (!scenarioMap.has(curDateStr)) {
              scenarioMap.set(curDateStr, []);
            }
            scenarioMap.get(curDateStr)!.push(sc);
          }
        } else {
          // If starting in the past, advance until we reach or pass today
          while (curDateStr < startDateStr) {
            curDateStr = advanceDateStr(curDateStr, freq);
          }
          while (curDateStr <= endDateStr) {
            if (curDateStr >= startDateStr) {
              if (!scenarioMap.has(curDateStr)) {
                scenarioMap.set(curDateStr, []);
              }
              scenarioMap.get(curDateStr)!.push(sc);
            }
            curDateStr = advanceDateStr(curDateStr, freq);
          }
        }
      });

      let lowestBal = startBalance;
      let lowestDt = startDateStr;

      for (let i = 0; i < horizonDays; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        const curDateStr = toISODateString(d);

        const todaysOccurrences = occurrenceMap.get(curDateStr) || [];
        todaysOccurrences.forEach((occ) => {
          const bill = occ.bill;
          const effectiveAmount = occ.effectiveAmount;
          const effectivePayee = occ.effectivePayee;

          if (bill.type === 'income') {
            if (selectedAccountId === 'all' || bill.account_id === selectedAccountId) {
              currentBalance += effectiveAmount;
              transactions.push({
                scheduledId: bill.id,
                date: curDateStr,
                originalDate: occ.originalDate,
                isDateChanged: occ.isDateChanged,
                payee: effectivePayee,
                originalPayee: bill.payee || 'Scheduled',
                amount: effectiveAmount,
                originalAmount: bill.amount,
                type: 'income',
                runningBalance: currentBalance,
                isOverridden: occ.isOverridden,
                frequency: bill.frequency,
              });
            }
          } else if (bill.type === 'expense') {
            if (selectedAccountId === 'all' || bill.account_id === selectedAccountId) {
              currentBalance -= effectiveAmount;
              transactions.push({
                scheduledId: bill.id,
                date: curDateStr,
                originalDate: occ.originalDate,
                isDateChanged: occ.isDateChanged,
                payee: effectivePayee,
                originalPayee: bill.payee || 'Scheduled',
                amount: -effectiveAmount,
                originalAmount: -bill.amount,
                type: 'expense',
                runningBalance: currentBalance,
                isOverridden: occ.isOverridden,
                frequency: bill.frequency,
              });
            }
          } else if (bill.type === 'transfer') {
            if (selectedAccountId === 'all') {
              transactions.push({
                scheduledId: bill.id,
                date: curDateStr,
                originalDate: occ.originalDate,
                isDateChanged: occ.isDateChanged,
                payee: `Transfer: ${effectivePayee}`,
                originalPayee: bill.payee || 'Transfer',
                amount: 0,
                originalAmount: 0,
                type: 'transfer',
                runningBalance: currentBalance,
                isOverridden: occ.isOverridden,
                frequency: bill.frequency,
              });
            } else {
              if (bill.account_id === selectedAccountId) {
                currentBalance -= effectiveAmount;
                transactions.push({
                  scheduledId: bill.id,
                  date: curDateStr,
                  originalDate: occ.originalDate,
                  isDateChanged: occ.isDateChanged,
                  payee: `Transfer Out: ${effectivePayee}`,
                  originalPayee: bill.payee || 'Transfer',
                  amount: -effectiveAmount,
                  originalAmount: -bill.amount,
                  type: 'transfer',
                  runningBalance: currentBalance,
                  isOverridden: occ.isOverridden,
                  frequency: bill.frequency,
                });
              } else if (bill.to_account_id === selectedAccountId) {
                currentBalance += effectiveAmount;
                transactions.push({
                  scheduledId: bill.id,
                  date: curDateStr,
                  originalDate: occ.originalDate,
                  isDateChanged: occ.isDateChanged,
                  payee: `Transfer In: ${effectivePayee}`,
                  originalPayee: bill.payee || 'Transfer',
                  amount: effectiveAmount,
                  originalAmount: bill.amount,
                  type: 'transfer',
                  runningBalance: currentBalance,
                  isOverridden: occ.isOverridden,
                  frequency: bill.frequency,
                });
              }
            }
          }
        });

        // Apply What-If Scenario Events for this date
        const todaysScenarios = scenarioMap.get(curDateStr) || [];
        todaysScenarios.forEach((sc) => {
          const freqLabel = sc.frequency && sc.frequency !== 'once' ? ` (${sc.frequency})` : '';
          if (sc.statementType === 'spend_date') {
            if (selectedAccountId === 'all' || sc.accountId === 'all' || sc.accountId === selectedAccountId) {
              currentBalance -= sc.amount;
              transactions.push({
                scheduledId: `scenario-${sc.id}-${curDateStr}`,
                date: curDateStr,
                originalDate: curDateStr,
                payee: `[Scenario] ${sc.payee || 'Simulated Expense'}${freqLabel}`,
                originalPayee: sc.payee,
                amount: -sc.amount,
                originalAmount: -sc.amount,
                type: 'expense',
                runningBalance: currentBalance,
                isScenario: true,
                frequency: sc.frequency,
              });
            }
          } else if (sc.statementType === 'receive_date') {
            if (selectedAccountId === 'all' || sc.accountId === 'all' || sc.accountId === selectedAccountId) {
              currentBalance += sc.amount;
              transactions.push({
                scheduledId: `scenario-${sc.id}-${curDateStr}`,
                date: curDateStr,
                originalDate: curDateStr,
                payee: `[Scenario] ${sc.payee || 'Simulated Income'}${freqLabel}`,
                originalPayee: sc.payee,
                amount: sc.amount,
                originalAmount: sc.amount,
                type: 'income',
                runningBalance: currentBalance,
                isScenario: true,
                frequency: sc.frequency,
              });
            }
          } else if (sc.statementType === 'transfer_date') {
            if (selectedAccountId === 'all') {
              transactions.push({
                scheduledId: `scenario-${sc.id}-${curDateStr}`,
                date: curDateStr,
                originalDate: curDateStr,
                payee: `[Scenario] Transfer: ${sc.payee || 'Move Money'}${freqLabel}`,
                originalPayee: sc.payee,
                amount: 0,
                originalAmount: 0,
                type: 'transfer',
                runningBalance: currentBalance,
                isScenario: true,
                frequency: sc.frequency,
              });
            } else {
              if (sc.accountId === selectedAccountId) {
                currentBalance -= sc.amount;
                transactions.push({
                  scheduledId: `scenario-${sc.id}-${curDateStr}`,
                  date: curDateStr,
                  originalDate: curDateStr,
                  payee: `[Scenario] Transfer Out: ${sc.payee || 'Move Money'}${freqLabel}`,
                  originalPayee: sc.payee,
                  amount: -sc.amount,
                  originalAmount: -sc.amount,
                  type: 'transfer',
                  runningBalance: currentBalance,
                  isScenario: true,
                  frequency: sc.frequency,
                });
              } else if (sc.toAccountId === selectedAccountId) {
                currentBalance += sc.amount;
                transactions.push({
                  scheduledId: `scenario-${sc.id}-${curDateStr}`,
                  date: curDateStr,
                  originalDate: curDateStr,
                  payee: `[Scenario] Transfer In: ${sc.payee || 'Move Money'}${freqLabel}`,
                  originalPayee: sc.payee,
                  amount: sc.amount,
                  originalAmount: sc.amount,
                  type: 'transfer',
                  runningBalance: currentBalance,
                  isScenario: true,
                  frequency: sc.frequency,
                });
              }
            }
          }
        });

        if (currentBalance < lowestBal) {
          lowestBal = currentBalance;
          lowestDt = curDateStr;
        }

        forecast.push({
          date: curDateStr,
          balance: currentBalance,
        });
      }

      setData(forecast);
      setFutureTxs(transactions);
      setMetrics({
        startBalance,
        endBalance: currentBalance,
        lowestBalance: lowestBal,
        lowestDate: lowestDt,
        netChange: currentBalance - startBalance,
      });
    } catch (e) {
      console.error('Forecast error:', e);
      setError('Failed to generate forecast.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    generateForecast();
  }, [selectedAccountId, horizonDays, scenarioEvents]);

  const handleSaveInstanceOverride = async () => {
    if (!editingInstance) return;
    const numAmount = parseFloat(editingInstance.amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      alert('Please enter a valid positive amount.');
      return;
    }

    if (!editingInstance.date) {
      alert('Please choose a valid date for this occurrence.');
      return;
    }

    try {
      const db = await getDb();
      await db.execute(
        'DELETE FROM scheduled_transaction_overrides WHERE scheduled_id = ? AND (original_date = ? OR date = ?)',
        [editingInstance.scheduledId, editingInstance.originalDate, editingInstance.originalDate]
      );
      await db.execute(
        'INSERT INTO scheduled_transaction_overrides (scheduled_id, original_date, new_date, date, amount, payee) VALUES (?, ?, ?, ?, ?, ?)',
        [
          editingInstance.scheduledId,
          editingInstance.originalDate,
          editingInstance.date,
          editingInstance.originalDate,
          numAmount,
          editingInstance.payee.trim(),
        ]
      );
      setEditingInstance(null);
      await generateForecast();
    } catch (e) {
      console.error('Error saving instance override:', e);
      alert('Failed to save instance override.');
    }
  };

  const handleResetInstanceOverride = async (scheduledId: number, originalDate: string) => {
    if (!confirm(`Reset this occurrence back to the recurring template schedule (originally on ${formatDate(originalDate)})?`)) {
      return;
    }
    try {
      const db = await getDb();
      await db.execute(
        'DELETE FROM scheduled_transaction_overrides WHERE scheduled_id = ? AND (original_date = ? OR date = ?)',
        [scheduledId, originalDate, originalDate]
      );
      await generateForecast();
    } catch (e) {
      console.error('Error resetting instance override:', e);
      alert('Failed to reset instance override.');
    }
  };

  // Calculate the gradient split offset at balance = 0
  const maxBalance = data.length > 0 ? Math.max(...data.map((d) => d.balance)) : 0;
  const minBalance = data.length > 0 ? Math.min(...data.map((d) => d.balance)) : 0;
  let gradientOffset = 0;
  if (maxBalance <= 0) {
    gradientOffset = 0; // All negative: entirely red
  } else if (minBalance >= 0) {
    gradientOffset = 1; // All positive: entirely blue
  } else {
    // Zero lies between minBalance and maxBalance
    gradientOffset = maxBalance / (maxBalance - minBalance);
  }

  // Find exact data points for High and Low
  const highPoint = data.length > 0 ? data.find((d) => d.balance === maxBalance) : null;
  const lowPoint = data.length > 0 ? data.find((d) => d.balance === minBalance) : null;
  const isHighLowDistinct =
    highPoint && lowPoint && (highPoint.date !== lowPoint.date || highPoint.balance !== lowPoint.balance);

  return (
    <div className="w-full space-y-6 sm:space-y-8 pb-6">
      {/* Top View Selector: Cash Flow Runway vs. Debt Payoff */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div className="bg-slate-200/80 p-1 rounded-xl flex items-center gap-1 border border-slate-300/60 shadow-2xs">
          <button
            onClick={() => setActiveView('forecast')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeView === 'forecast'
                ? 'bg-white text-slate-800 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <TrendingUp size={15} className="text-blue-600" />
            Cash Flow Runway & Forecast
          </button>
          <button
            onClick={() => setActiveView('debt')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeView === 'debt'
                ? 'bg-white text-slate-800 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Calculator size={15} className="text-indigo-600" />
            Debt Payoff & Amortization
            <span className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-2xs">
              PRO
            </span>
          </button>
        </div>
      </div>

      {activeView === 'debt' ? (
        <DebtPayoffPlanner
          accounts={accounts}
          proStatus={proStatus}
          onTriggerUpgrade={onTriggerUpgrade}
        />
      ) : (
        <>
          {/* Header & Controls */}
          <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Cash Flow Forecast</h1>
          <p className="text-slate-500">Projected financial trajectory based on recurring schedules</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Horizon Selector */}
          <div className="flex rounded-xl bg-white border border-slate-200 p-1 shadow-xs">
            <button
              onClick={() => setHorizonDays(30)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                horizonDays === 30 ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              30 Days
            </button>
            <button
              onClick={() => setHorizonDays(90)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                horizonDays === 90 ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              90 Days
            </button>
            <button
              onClick={() => setHorizonDays(180)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                horizonDays === 180 ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              6 Months
            </button>
            <button
              onClick={() => setHorizonDays(365)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                horizonDays === 365 ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              1 Year
            </button>
          </div>

          {/* Account Filter */}
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-xs font-bold text-slate-400 uppercase">Account:</span>
            <select
              className="bg-transparent outline-none text-sm font-medium text-slate-700 pr-2 cursor-pointer"
              value={selectedAccountId}
              onChange={(e) =>
                setSelectedAccountId(e.target.value === 'all' ? 'all' : parseInt(e.target.value))
              }
            >
              <option value="all">All Accounts</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => {
              if (!proStatus) {
                onTriggerUpgrade?.('what_if_locked');
                return;
              }
              setIsScenarioModalOpen(true);
            }}
            className={`px-3.5 py-2 rounded-xl transition-all font-semibold flex items-center gap-1.5 shadow-xs text-sm border ${
              !proStatus
                ? 'bg-amber-50/70 border-amber-200 text-amber-900 hover:bg-amber-100 hover:border-amber-300'
                : scenarioEvents.length > 0
                ? 'bg-amber-500 text-white border-amber-600 hover:bg-amber-600 animate-pulse'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
            title={!proStatus ? 'What-If Cash Flow Simulator is an rMoney Pro feature' : 'Play What-If Cash Flow Scenarios'}
          >
            <Lightbulb size={16} className={!proStatus ? 'text-amber-600' : scenarioEvents.length > 0 ? 'text-white' : 'text-amber-500'} />
            <span>Play What-If</span>
            {!proStatus && (
              <span className="px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-md bg-gradient-to-r from-amber-500 to-indigo-600 text-white shadow-xs">
                PRO
              </span>
            )}
            {proStatus && scenarioEvents.length > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-white text-amber-700 ml-1">
                {scenarioEvents.length}
              </span>
            )}
          </button>

          <button
            onClick={generateForecast}
            className="bg-white border border-slate-200 text-slate-600 px-3 py-2 rounded-xl hover:bg-slate-50 transition-colors font-medium flex items-center gap-1.5 shadow-xs text-sm"
          >
            <TrendingUp size={16} />
            Refresh
          </button>
        </div>
      </header>

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-2xl flex items-center gap-3">
          <AlertCircle size={20} />
          <p>{error}</p>
        </div>
      )}

      {scenarioEvents.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-300 dark:border-amber-700/60 p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in duration-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500 text-white rounded-xl">
              <Lightbulb size={20} />
            </div>
            <div>
              <p className="text-sm font-bold text-amber-900 dark:text-amber-200">
                What-If Scenario Mode Active ({scenarioEvents.length} simulated event{scenarioEvents.length > 1 ? 's' : ''})
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400">
                You are previewing hypothetical financial events. No changes are saved to your actual accounts or transaction history.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-center">
            <button
              onClick={() => setIsScenarioModalOpen(true)}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-colors shadow-xs"
            >
              Manage Events
            </button>
            <button
              onClick={() => setScenarioEvents([])}
              className="px-3 py-1.5 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 hover:bg-amber-500/20 rounded-xl text-xs font-bold transition-colors"
            >
              Clear Scenario
            </button>
          </div>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3 sm:gap-4">
          <div className="p-2 sm:p-3 bg-blue-50 text-blue-600 rounded-xl shrink-0">
            <Wallet size={18} className="sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase truncate">Current Balance</p>
            <p className="text-lg sm:text-xl font-bold text-slate-900 tabular-nums truncate">
              {formatCurrency(metrics.startBalance)}
            </p>
          </div>
        </div>

        <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3 sm:gap-4">
          <div className={`p-2 sm:p-3 rounded-xl shrink-0 ${metrics.netChange >= 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
            {metrics.netChange >= 0 ? <TrendingUp size={18} className="sm:w-5 sm:h-5" /> : <TrendingDown size={18} className="sm:w-5 sm:h-5" />}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase truncate">Net Flow</p>
            <p className={`text-lg sm:text-xl font-bold tabular-nums truncate ${metrics.netChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {metrics.netChange >= 0 ? '+' : ''}{formatCurrency(metrics.netChange)}
            </p>
          </div>
        </div>

        <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3 sm:gap-4">
          <div className={`p-2 sm:p-3 rounded-xl shrink-0 ${metrics.lowestBalance < 0 ? 'bg-red-100 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
            <ShieldAlert size={18} className="sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase truncate">Lowest Balance</p>
            <p className={`text-lg sm:text-xl font-bold tabular-nums truncate ${metrics.lowestBalance < 0 ? 'text-red-600' : 'text-slate-900'}`}>
              {formatCurrency(metrics.lowestBalance)}
            </p>
            <p className="text-[10px] sm:text-xs text-slate-400 truncate">{metrics.lowestDate ? formatDate(metrics.lowestDate) : 'N/A'}</p>
          </div>
        </div>

        <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3 sm:gap-4">
          <div className="p-2 sm:p-3 bg-purple-50 text-purple-600 rounded-xl shrink-0">
            <BarChart3 size={18} className="sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase truncate">Ending Balance</p>
            <p className="text-lg sm:text-xl font-bold text-slate-900 tabular-nums truncate">
              {formatCurrency(metrics.endBalance)}
            </p>
          </div>
        </div>
      </div>

      {/* Main Charts & Ledger Section */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Forecast Chart */}
        <div className="xl:col-span-2 bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-4 sm:mb-6">
            <h2 className="text-lg sm:text-xl font-semibold text-slate-800 flex items-center gap-2">
              <BarChart3 size={20} className="text-blue-500" />
              Cash Flow Projection
            </h2>
            <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-500">
              <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-blue-500 rounded-full"></div>
              <span>Simulated Balance</span>
            </div>
          </div>

          <div className="h-64 sm:h-80 w-full pt-2">
            {loading ? (
              <div className="h-full w-full flex items-center justify-center text-slate-400 italic">
                Calculating future cash flow...
              </div>
            ) : data.length === 0 ? (
              <div className="h-full w-full flex flex-col items-center justify-center text-slate-400 italic space-y-2">
                <Calendar size={48} className="text-slate-200 mb-2" />
                <p>No data available. Add accounts and scheduled transactions.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 32, right: 35, left: 10, bottom: 25 }}>
                  <defs>
                    <linearGradient id="strokeGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" />
                      <stop offset={`${Math.max(0, gradientOffset - 0.01) * 100}%`} stopColor="#3b82f6" />
                      <stop offset={`${gradientOffset * 100}%`} stopColor="#ef4444" />
                      <stop offset="100%" stopColor="#ef4444" />
                    </linearGradient>
                    <linearGradient id="fillGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
                      <stop offset={`${gradientOffset * 100}%`} stopColor="#3b82f6" stopOpacity={0.05} />
                      <stop offset={`${gradientOffset * 100}%`} stopColor="#ef4444" stopOpacity={0.05} />
                      <stop offset="100%" stopColor="#ef4444" stopOpacity={0.35} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="date"
                    stroke="#94a3b8"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(str) => {
                      const parts = str.split('-').map(Number);
                      const date = new Date(parts[0], parts[1] - 1, parts[2]);
                      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    }}
                    minTickGap={35}
                  />
                  <YAxis
                    stroke="#94a3b8"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(val) => formatCurrency(val, { compact: true })}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#fff',
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    }}
                    formatter={(value) => [
                      formatCurrency(Number(value)),
                      'Projected Balance',
                    ]}
                    labelFormatter={(label: unknown) => {
                      if (!label) return '';
                      return formatDate(String(label));
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="balance"
                    stroke="url(#strokeGradient)"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#fillGradient)"
                  />

                  {/* High Point Marker */}
                  {highPoint && (
                    <ReferenceDot
                      x={highPoint.date}
                      y={highPoint.balance}
                      r={7}
                      fill="#2563eb"
                      stroke="#ffffff"
                      strokeWidth={2.5}
                      label={(props: any) => {
                        const { x, y } = props;
                        if (x == null || y == null) return null;
                        const text = `High: ${formatCurrency(highPoint.balance, { compact: true })}`;
                        const badgeWidth = text.length * 7.5 + 24;
                        const badgeHeight = 26;
                        const badgeX = x - badgeWidth / 2;
                        const badgeY = y - badgeHeight - 10;
                        return (
                          <g>
                            <defs>
                              <filter id="badgeShadowHigh" x="-20%" y="-20%" width="140%" height="140%">
                                <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.25" />
                              </filter>
                            </defs>
                            <rect
                              x={badgeX}
                              y={badgeY}
                              width={badgeWidth}
                              height={badgeHeight}
                              rx={13}
                              ry={13}
                              fill="#1e40af"
                              stroke="#ffffff"
                              strokeWidth={1.5}
                              filter="url(#badgeShadowHigh)"
                            />
                            <text
                              x={x}
                              y={badgeY + 17}
                              textAnchor="middle"
                              fill="#ffffff"
                              fontSize={12}
                              fontWeight={800}
                              fontFamily="system-ui, -apple-system, sans-serif"
                            >
                              ▲ {text}
                            </text>
                          </g>
                        );
                      }}
                    />
                  )}

                  {/* Low Point Marker */}
                  {lowPoint && isHighLowDistinct && (
                    <ReferenceDot
                      x={lowPoint.date}
                      y={lowPoint.balance}
                      r={7}
                      fill={lowPoint.balance < 0 ? '#dc2626' : '#d97706'}
                      stroke="#ffffff"
                      strokeWidth={2.5}
                      label={(props: any) => {
                        const { x, y } = props;
                        if (x == null || y == null) return null;
                        const text = `Low: ${formatCurrency(lowPoint.balance, { compact: true })}`;
                        const badgeWidth = text.length * 7.5 + 24;
                        const badgeHeight = 26;
                        const badgeX = x - badgeWidth / 2;
                        const badgeY = y + 12;
                        const isNeg = lowPoint.balance < 0;
                        return (
                          <g>
                            <defs>
                              <filter id="badgeShadowLow" x="-20%" y="-20%" width="140%" height="140%">
                                <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.25" />
                              </filter>
                            </defs>
                            <rect
                              x={badgeX}
                              y={badgeY}
                              width={badgeWidth}
                              height={badgeHeight}
                              rx={13}
                              ry={13}
                              fill={isNeg ? '#b91c1c' : '#b45309'}
                              stroke="#ffffff"
                              strokeWidth={1.5}
                              filter="url(#badgeShadowLow)"
                            />
                            <text
                              x={x}
                              y={badgeY + 17}
                              textAnchor="middle"
                              fill="#ffffff"
                              fontSize={12}
                              fontWeight={800}
                              fontFamily="system-ui, -apple-system, sans-serif"
                            >
                              ▼ {text}
                            </text>
                          </g>
                        );
                      }}
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Future Transactions Ledger */}
        <div className="bg-white rounded-2xl sm:rounded-3xl shadow-sm border border-slate-200">
          <div className="p-4 sm:p-6 border-b border-slate-100">
            <div className="flex justify-between items-center mb-1">
              <h2 className="text-lg sm:text-xl font-semibold text-slate-800 flex items-center gap-2">
                <List size={20} className="text-blue-500" />
                Upcoming Occurrences
              </h2>
            </div>
            <p className="text-xs text-slate-500">
              {futureTxs.length} items over {horizonDays} days (click pencil to edit date or amount)
            </p>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center text-slate-400 italic">Loading ledger...</div>
            ) : futureTxs.length === 0 ? (
              <div className="p-8 text-center text-slate-400 italic">
                No scheduled transactions within this timeframe.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 text-sm">
                {futureTxs.map((tx, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 hover:bg-slate-50 transition-colors flex justify-between items-center gap-2"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-medium text-slate-800 truncate">{tx.payee}</p>
                        {tx.isScenario && (
                          <span
                            className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500 text-white flex items-center gap-0.5 shadow-xs"
                            title="Hypothetical What-If scenario event (not in your actual data)"
                          >
                            <Lightbulb size={10} />
                            What-If
                          </span>
                        )}
                        {tx.isDateChanged && !tx.isScenario && (
                          <span
                            className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 flex items-center gap-0.5"
                            title={`Rescheduled from ${formatDate(tx.originalDate)} to ${formatDate(tx.date)}`}
                          >
                            <Clock size={10} />
                            Moved ({formatDate(tx.originalDate)})
                          </span>
                        )}
                        {tx.isOverridden && !tx.isDateChanged && !tx.isScenario && (
                          <span
                            className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 flex items-center gap-0.5"
                            title="This specific instance has custom amount or payee edits"
                          >
                            <Sparkles size={10} />
                            Custom
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400">{formatDate(tx.date)}</p>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                      <div className="text-right">
                        <div
                          className={`font-semibold tabular-nums text-xs sm:text-sm ${
                            tx.amount > 0 ? 'text-green-600' : tx.amount < 0 ? 'text-red-500' : 'text-slate-600'
                          }`}
                        >
                          {tx.amount > 0 ? `+${formatCurrency(tx.amount)}` : tx.amount < 0 ? `-${formatCurrency(Math.abs(tx.amount))}` : formatCurrency(0)}
                        </div>
                        <div
                          className={`font-mono text-[10px] sm:text-xs font-bold tabular-nums ${
                            tx.runningBalance >= 0 ? 'text-slate-500' : 'text-red-600'
                          }`}
                        >
                          Bal: {formatCurrency(tx.runningBalance)}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 pl-1">
                      {tx.isScenario ? (
                        <button
                          onClick={() => {
                            // Extract base scenario event ID (format: scenario-{sc.id}-{curDateStr})
                            const raw = String(tx.scheduledId).replace(/^scenario-/, '');
                            const scId = raw.replace(/-[0-9]{4}-[0-9]{2}-[0-9]{2}$/, '');
                            setScenarioEvents((prev) => prev.filter((ev) => ev.id !== scId && ev.id !== raw));
                          }}
                          className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                          title="Remove this simulated event from the What-If scenario"
                        >
                          <Trash2 size={14} />
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() =>
                              setEditingInstance({
                                scheduledId: Number(tx.scheduledId),
                                originalDate: tx.originalDate,
                                date: tx.date,
                                payee: tx.payee,
                                amount: String(Math.abs(tx.amount)),
                                originalAmount: Math.abs(tx.originalAmount),
                                originalPayee: tx.originalPayee,
                                type: tx.type,
                              })
                            }
                            className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-slate-100 transition-colors"
                            title="Edit date or amount for this individual instance"
                          >
                            <Edit2 size={14} />
                          </button>

                          {tx.isOverridden && (
                            <button
                              onClick={() => handleResetInstanceOverride(Number(tx.scheduledId), tx.originalDate)}
                              className="p-1.5 text-slate-400 hover:text-amber-600 rounded-lg hover:bg-amber-50 transition-colors"
                              title="Reset instance back to recurring template date & amount"
                            >
                              <RotateCcw size={14} />
                            </button>
                          )}
                        </>
                      )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      </>
      )}

      {/* Edit Individual Instance Modal */}
      {editingInstance && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl animate-in zoom-in-95 duration-150 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                  <Sparkles size={18} className="text-amber-500" />
                  Edit Occurrence
                </h3>
                <p className="text-xs text-slate-400">
                  Recurring slot: {editingInstance.originalDate}
                </p>
              </div>
              <button
                onClick={() => setEditingInstance(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200/60 rounded-xl text-xs text-amber-800 leading-relaxed">
              <strong>Individual Instance Edit:</strong> Adjusting the date or amount here applies <strong>only to this occurrence</strong>. Subsequent occurrences in the recurring schedule will continue on their normal dates and amounts.
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Occurrence Date</label>
                <input
                  type="date"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium"
                  value={editingInstance.date}
                  onChange={(e) =>
                    setEditingInstance({ ...editingInstance, date: e.target.value })
                  }
                />
                {editingInstance.date !== editingInstance.originalDate && (
                  <p className="text-[11px] text-blue-600 font-medium">
                    Rescheduled from standard date ({editingInstance.originalDate})
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Payee / Description</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  value={editingInstance.payee}
                  onChange={(e) =>
                    setEditingInstance({ ...editingInstance, payee: e.target.value })
                  }
                  placeholder="Payee for this instance"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Amount ({currency.symbol})</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-semibold"
                  value={editingInstance.amount}
                  onChange={(e) =>
                    setEditingInstance({ ...editingInstance, amount: e.target.value })
                  }
                  placeholder="0.00"
                />
                <p className="text-[11px] text-slate-400">
                  Standard recurring series amount: {formatCurrency(editingInstance.originalAmount)}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setEditingInstance(null)}
                className="px-4 py-2 text-slate-500 hover:text-slate-700 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveInstanceOverride}
                className="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors shadow-sm"
              >
                Save This Instance
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Play What-If With Cash Flow Scenario Modal */}
      {isScenarioModalOpen && proStatus && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-2xl shadow-2xl animate-in zoom-in-95 duration-150 space-y-5 border border-slate-200">
            {/* Modal Header */}
            <div className="flex justify-between items-start border-b border-slate-100 pb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-amber-500 text-white rounded-xl">
                    <Lightbulb size={20} />
                  </div>
                  <h3 className="font-bold text-xl text-slate-800">Play What-If with Cash Flow</h3>
                </div>
                <p className="text-xs text-slate-500">
                  Experiment with various financial events to see how they may affect your future cash flow without modifying actual accounts.
                </p>
              </div>
              <button
                onClick={() => setIsScenarioModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            {/* Scenario Builder Form (inspired by Microsoft Money) */}
            <div className="bg-slate-50/70 border border-slate-200/80 rounded-2xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Add a What-If Statement
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase mr-1">1-Click Demo Presets:</span>
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date();
                      d.setDate(d.getDate() + 14);
                      setScenarioEvents((prev) => [
                        ...prev,
                        {
                          id: String(Date.now() + Math.random()),
                          statementType: 'spend_date',
                          payee: 'New Vehicle Loan Payment',
                          amount: 450,
                          date: toISODateString(d),
                          frequency: 'monthly',
                          accountId: 'all',
                        },
                      ]);
                    }}
                    className="px-2 py-1 rounded-lg bg-white border border-slate-200 hover:border-amber-400 text-[11px] font-semibold text-slate-700 transition-colors cursor-pointer"
                  >
                    + New Car ($450/mo)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date();
                      d.setDate(d.getDate() + 45);
                      setScenarioEvents((prev) => [
                        ...prev,
                        {
                          id: String(Date.now() + Math.random()),
                          statementType: 'spend_date',
                          payee: 'European Family Vacation',
                          amount: 2400,
                          date: toISODateString(d),
                          frequency: 'once',
                          accountId: 'all',
                        },
                      ]);
                    }}
                    className="px-2 py-1 rounded-lg bg-white border border-slate-200 hover:border-amber-400 text-[11px] font-semibold text-slate-700 transition-colors cursor-pointer"
                  >
                    + Vacation ($2,400)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date();
                      d.setDate(d.getDate() + 15);
                      setScenarioEvents((prev) => [
                        ...prev,
                        {
                          id: String(Date.now() + Math.random()),
                          statementType: 'receive_date',
                          payee: 'Promotion / Salary Raise',
                          amount: 550,
                          date: toISODateString(d),
                          frequency: 'monthly',
                          accountId: 'all',
                        },
                      ]);
                    }}
                    className="px-2 py-1 rounded-lg bg-white border border-slate-200 hover:border-emerald-400 text-[11px] font-semibold text-emerald-700 transition-colors cursor-pointer"
                  >
                    + Raise (+$550/mo)
                  </button>
                </div>
              </div>

              {/* Account Selector */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center">
                <label className="text-sm font-semibold text-slate-700">Account:</label>
                <select
                  className="sm:col-span-2 px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white font-medium"
                  value={scenarioAccount}
                  onChange={(e) =>
                    setScenarioAccount(e.target.value === 'all' ? 'all' : parseInt(e.target.value))
                  }
                >
                  <option value="all">All Accounts (Total Cash Flow)</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Statement Type Selector */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center">
                <label className="text-sm font-semibold text-slate-700">Statement:</label>
                <select
                  className="sm:col-span-2 px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white font-medium"
                  value={scenarioStatement}
                  onChange={(e) =>
                    setScenarioStatement(
                      e.target.value as 'spend_date' | 'receive_date' | 'transfer_date'
                    )
                  }
                >
                  <option value="spend_date">What if I spend X on a specific date?</option>
                  <option value="receive_date">What if I receive/deposit X on a specific date?</option>
                  <option value="transfer_date">What if I transfer X to another account on a date?</option>
                </select>
              </div>

              {/* Destination Account (if transfer) */}
              {scenarioStatement === 'transfer_date' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center">
                  <label className="text-sm font-semibold text-slate-700">To Account:</label>
                  <select
                    className="sm:col-span-2 px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white font-medium"
                    value={scenarioToAccount}
                    onChange={(e) => setScenarioToAccount(parseInt(e.target.value))}
                  >
                    <option value={0}>Select destination account...</option>
                    {accounts
                      .filter((acc) => acc.id !== scenarioAccount)
                      .map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {/* Description / Payee */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center">
                <label className="text-sm font-semibold text-slate-700">Description:</label>
                <input
                  type="text"
                  placeholder="e.g. Major repair, bonus check, vacation"
                  className="sm:col-span-2 px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                  value={scenarioPayee}
                  onChange={(e) => setScenarioPayee(e.target.value)}
                />
              </div>

              {/* Amount, Frequency & Date */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Amount ({currency.symbol})</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-semibold bg-white"
                    value={scenarioAmount}
                    onChange={(e) => setScenarioAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Frequency</label>
                  <select
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium bg-white"
                    value={scenarioFrequency}
                    onChange={(e) => setScenarioFrequency(e.target.value)}
                  >
                    <option value="once">One-Time Only</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="bi-weekly">Every 2 Weeks (Bi-Weekly)</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">
                    {scenarioFrequency === 'once' ? 'Simulated Date' : 'Starting Date'}
                  </label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium bg-white"
                    value={scenarioDate}
                    onChange={(e) => setScenarioDate(e.target.value)}
                  />
                </div>
              </div>

              {/* Add Event Button */}
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => {
                    const num = parseFloat(scenarioAmount);
                    if (isNaN(num) || num <= 0) {
                      alert('Please enter a valid positive dollar amount.');
                      return;
                    }
                    if (!scenarioDate) {
                      alert('Please select a simulated date.');
                      return;
                    }
                    if (scenarioStatement === 'transfer_date' && !scenarioToAccount) {
                      alert('Please select a destination account for the transfer.');
                      return;
                    }

                    const newEvent: ScenarioEvent = {
                      id: String(Date.now() + Math.random()),
                      statementType: scenarioStatement,
                      payee: scenarioPayee.trim() || (scenarioStatement === 'spend_date' ? 'Simulated Expense' : scenarioStatement === 'receive_date' ? 'Simulated Income' : 'Simulated Transfer'),
                      amount: num,
                      date: scenarioDate,
                      frequency: scenarioFrequency,
                      accountId: scenarioAccount,
                      toAccountId: scenarioStatement === 'transfer_date' ? scenarioToAccount : undefined,
                    };

                    setScenarioEvents((prev) => [...prev, newEvent]);
                    setScenarioPayee('');
                  }}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-bold flex items-center gap-1.5 shadow-sm transition-all"
                >
                  <Plus size={16} />
                  Calculate & Add to Scenario
                </button>
              </div>
            </div>

            {/* Active Scenario Events List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Active Scenario Statements ({scenarioEvents.length})
                </h4>
                {scenarioEvents.length > 0 && (
                  <button
                    onClick={() => setScenarioEvents([])}
                    className="text-xs text-red-500 hover:text-red-700 font-semibold"
                  >
                    Clear All
                  </button>
                )}
              </div>

              {scenarioEvents.length === 0 ? (
                <div className="p-5 border border-dashed border-slate-200 rounded-2xl text-center text-xs text-slate-400 italic">
                  No hypothetical events added yet. Use the statement builder above to simulate one!
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {scenarioEvents.map((ev) => (
                    <div
                      key={ev.id}
                      className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-3 shadow-2xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`p-1.5 rounded-lg ${
                            ev.statementType === 'spend_date'
                              ? 'bg-red-50 text-red-600'
                              : ev.statementType === 'receive_date'
                              ? 'bg-green-50 text-green-600'
                              : 'bg-purple-50 text-purple-600'
                          }`}
                        >
                          {ev.statementType === 'spend_date' && <TrendingDown size={14} />}
                          {ev.statementType === 'receive_date' && <TrendingUp size={14} />}
                          {ev.statementType === 'transfer_date' && <ArrowRightLeft size={14} />}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="font-semibold text-sm text-slate-800">{ev.payee}</p>
                            {ev.frequency && ev.frequency !== 'once' && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700 capitalize">
                                {ev.frequency}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400">
                            {ev.frequency && ev.frequency !== 'once' ? `Starts ${formatDate(ev.date)}` : formatDate(ev.date)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span
                          className={`font-bold tabular-nums text-sm ${
                            ev.statementType === 'spend_date'
                              ? 'text-red-600'
                              : ev.statementType === 'receive_date'
                              ? 'text-green-600'
                              : 'text-purple-600'
                          }`}
                        >
                          {ev.statementType === 'spend_date' ? '-' : ev.statementType === 'receive_date' ? '+' : ''}
                          {formatCurrency(ev.amount)}
                        </span>

                        <button
                          onClick={() =>
                            setScenarioEvents((prev) => prev.filter((item) => item.id !== ev.id))
                          }
                          className="p-1 text-slate-400 hover:text-red-500 rounded"
                          title="Remove statement"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between border-t border-slate-100 pt-4">
              <p className="text-xs text-slate-400">
                Changes only apply to your current simulation session.
              </p>
              <button
                onClick={() => setIsScenarioModalOpen(false)}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-sm transition-all flex items-center gap-2"
              >
                <Check size={16} />
                Done (View Projected Graph)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ForecastPage;
