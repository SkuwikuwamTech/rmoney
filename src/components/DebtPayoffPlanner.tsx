import React, { useState, useEffect, useMemo } from 'react';
import {
  Sparkles,
  Calculator,
  Download,
  Plus,
  Trash2,
  DollarSign,
  Zap,
  CheckCircle2,
  RefreshCw,
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
import { Account } from '../types';
import { useRegionalSettings } from '../utils/currency';
import {
  DebtItem,
  compareDebtStrategies,
  calculateSingleLoanAmortization,
  exportAmortizationToCsv,
} from '../utils/debtCalculator';

interface DebtPayoffPlannerProps {
  accounts: Account[];
  proStatus?: boolean;
  onTriggerUpgrade?: (reason: 'accounts_limit' | 'what_if_locked' | 'reports_locked' | 'general') => void;
}

const DEFAULT_DEMO_DEBTS: DebtItem[] = [
  { id: 'demo-1', name: 'Chase Sapphire Card', balance: 4200, interestRate: 22.49, minPayment: 110, isCustom: true },
  { id: 'demo-2', name: 'Auto Loan', balance: 11800, interestRate: 5.9, minPayment: 290, isCustom: true },
  { id: 'demo-3', name: 'Student Loan', balance: 8500, interestRate: 4.8, minPayment: 140, isCustom: true },
];

export const DebtPayoffPlanner: React.FC<DebtPayoffPlannerProps> = ({
  accounts,
  proStatus = true,
  onTriggerUpgrade,
}) => {
  const { formatCurrency } = useRegionalSettings();

  // Mode: 'portfolio' (all debts snowball vs avalanche) or 'single' (single loan amortization)
  const [plannerMode, setPlannerMode] = useState<'portfolio' | 'single'>('portfolio');

  // Debts state stored in localStorage for persistence
  const [debts, setDebts] = useState<DebtItem[]>(() => {
    try {
      const saved = localStorage.getItem('rmoney_debt_planner_debts');
      if (saved) return JSON.parse(saved);
    } catch {
      // fallback
    }
    return DEFAULT_DEMO_DEBTS;
  });

  const [extraPayment, setExtraPayment] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('rmoney_debt_extra_payment');
      if (saved) return Number(saved) || 200;
    } catch {
      // fallback
    }
    return 200;
  });

  const [selectedStrategy, setSelectedStrategy] = useState<'avalanche' | 'snowball'>('avalanche');
  const [showScheduleLimit, setShowScheduleLimit] = useState<number>(24);

  // New Debt Form State
  const [isAddingDebt, setIsAddingDebt] = useState(false);
  const [newDebtName, setNewDebtName] = useState('');
  const [newDebtBalance, setNewDebtBalance] = useState('');
  const [newDebtApr, setNewDebtApr] = useState('');
  const [newDebtMin, setNewDebtMin] = useState('');

  // Single Loan Mode State
  const [singlePrincipal, setSinglePrincipal] = useState<number>(25000);
  const [singleApr, setSingleApr] = useState<number>(6.5);
  const [singleTermYears, setSingleTermYears] = useState<number>(5);
  const [singleExtra, setSingleExtra] = useState<number>(100);

  // Persist debts and extra payment
  useEffect(() => {
    try {
      localStorage.setItem('rmoney_debt_planner_debts', JSON.stringify(debts));
      localStorage.setItem('rmoney_debt_extra_payment', String(extraPayment));
    } catch (e) {
      console.warn('Failed to persist debt planner settings', e);
    }
  }, [debts, extraPayment]);

  // Import from existing liability accounts
  const importAccountsAsDebts = () => {
    const liabilityAccounts = accounts.filter(
      (a) =>
        a.type.toLowerCase().includes('credit') ||
        a.type.toLowerCase().includes('loan') ||
        a.balance < 0
    );

    if (liabilityAccounts.length === 0) {
      alert('No credit card, loan, or negative-balance accounts found in your accounts list.');
      return;
    }

    const newDebts: DebtItem[] = liabilityAccounts.map((acc) => {
      const positiveBal = Math.abs(acc.balance);
      const isCard = acc.type.toLowerCase().includes('credit');
      const apr = isCard ? 21.99 : 6.5;
      const minPay = Math.max(25, Math.round(positiveBal * 0.025));

      return {
        id: `acc-${acc.id}`,
        name: acc.name,
        balance: positiveBal,
        interestRate: apr,
        minPayment: minPay,
      };
    });

    // Merge without duplicates
    const merged = [...debts];
    newDebts.forEach((nd) => {
      const existingIdx = merged.findIndex((d) => d.id === nd.id || d.name === nd.name);
      if (existingIdx >= 0) {
        merged[existingIdx] = nd;
      } else {
        merged.push(nd);
      }
    });

    setDebts(merged);
  };

  const addCustomDebt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDebtName.trim()) return;
    const bal = parseFloat(newDebtBalance) || 0;
    const apr = parseFloat(newDebtApr) || 0;
    const min = parseFloat(newDebtMin) || Math.max(25, Math.round(bal * 0.025));

    if (bal <= 0) {
      alert('Debt balance must be greater than $0.');
      return;
    }

    const newItem: DebtItem = {
      id: `custom-${Date.now()}`,
      name: newDebtName.trim(),
      balance: bal,
      interestRate: apr,
      minPayment: min,
      isCustom: true,
    };

    setDebts([...debts, newItem]);
    setNewDebtName('');
    setNewDebtBalance('');
    setNewDebtApr('');
    setNewDebtMin('');
    setIsAddingDebt(false);
  };

  const removeDebt = (id: string) => {
    setDebts(debts.filter((d) => d.id !== id));
  };

  const updateDebt = (id: string, field: keyof DebtItem, value: number) => {
    setDebts(
      debts.map((d) => {
        if (d.id === id) {
          return { ...d, [field]: value };
        }
        return d;
      })
    );
  };

  // Run comparative debt strategies
  const comparison = useMemo(() => {
    return compareDebtStrategies(debts, extraPayment);
  }, [debts, extraPayment]);

  const activePlan = selectedStrategy === 'avalanche' ? comparison.avalanche : comparison.snowball;

  // Single Loan Calculation
  const singleLoanResult = useMemo(() => {
    return calculateSingleLoanAmortization(
      singlePrincipal,
      singleApr,
      singleTermYears * 12,
      singleExtra
    );
  }, [singlePrincipal, singleApr, singleTermYears, singleExtra]);

  // Handle Export Schedule
  const handleExportCsv = () => {
    if (!proStatus && onTriggerUpgrade) {
      onTriggerUpgrade('reports_locked');
      return;
    }
    const csvContent = exportAmortizationToCsv(activePlan.schedule);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `rMoney_${selectedStrategy}_amortization.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Debt Payoff & Amortization</h2>
            <span className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shadow-2xs">
              Pro Feature
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            Compare Debt Snowball vs. Debt Avalanche strategies and calculate exact loan amortization timelines.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="bg-slate-100 p-1 rounded-xl flex items-center border border-slate-200">
            <button
              onClick={() => setPlannerMode('portfolio')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                plannerMode === 'portfolio'
                  ? 'bg-white text-slate-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Debt Portfolio (Snowball / Avalanche)
            </button>
            <button
              onClick={() => setPlannerMode('single')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                plannerMode === 'single'
                  ? 'bg-white text-slate-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Single Loan Amortization
            </button>
          </div>
        </div>
      </div>

      {plannerMode === 'portfolio' ? (
        <>
          {/* Top KPI Comparison Badges */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Debt Balance</span>
              <div className="text-2xl font-extrabold text-slate-800 font-mono mt-1">
                {formatCurrency(comparison.initialDebt)}
              </div>
              <span className="text-xs text-slate-500 mt-1 block">
                {debts.filter((d) => d.balance > 0).length} active liabilities
              </span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Debt-Free Date</span>
              <div className="text-2xl font-extrabold text-emerald-600 font-mono mt-1">
                {activePlan.debtFreeDateStr}
              </div>
              <span className="text-xs text-emerald-700 font-medium mt-1 flex items-center gap-1">
                <CheckCircle2 size={13} />
                {activePlan.debtFreeMonths} months to freedom ({comparison.monthsSavedVsBaseline[selectedStrategy]} months faster!)
              </span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Interest Saved</span>
              <div className="text-2xl font-extrabold text-indigo-600 font-mono mt-1">
                {formatCurrency(comparison.interestSavedVsBaseline[selectedStrategy])}
              </div>
              <span className="text-xs text-slate-500 mt-1 block">
                vs. making minimum payments only
              </span>
            </div>

            <div className="bg-gradient-to-br from-indigo-50 to-blue-50 p-5 rounded-2xl border border-indigo-200/80 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-700">Best Strategy</span>
                <span className="text-[10px] font-bold bg-indigo-600 text-white px-2 py-0.5 rounded-full">
                  Recommended
                </span>
              </div>
              <div className="text-xl font-bold text-indigo-900 mt-1 capitalize">
                {comparison.bestMethod === 'avalanche' ? 'Debt Avalanche' : 'Debt Snowball'}
              </div>
              <span className="text-xs text-indigo-700 mt-1 block font-medium">
                Saves {formatCurrency(comparison.savingsDiff)} more in total interest charges
              </span>
            </div>
          </div>

          {/* Controls: Strategy Switcher & Extra Monthly Payment Slider */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-slate-100">
              {/* Strategy Selector */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600 block">
                  Select Payoff Methodology
                </label>
                <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200">
                  <button
                    onClick={() => setSelectedStrategy('avalanche')}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                      selectedStrategy === 'avalanche'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Zap size={14} />
                    Avalanche (Highest APR First)
                  </button>
                  <button
                    onClick={() => setSelectedStrategy('snowball')}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                      selectedStrategy === 'snowball'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Sparkles size={14} />
                    Snowball (Lowest Balance First)
                  </button>
                </div>
                <p className="text-xs text-slate-500 max-w-md">
                  {selectedStrategy === 'avalanche'
                    ? 'Avalanche targets high-interest debt first to minimize total interest paid over time.'
                    : 'Snowball pays off the smallest balance first for quick psychological momentum and fewer active monthly bills.'}
                </p>
              </div>

              {/* Extra Payment Slider & Presets */}
              <div className="flex-1 max-w-lg space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    Extra Monthly Contribution
                  </label>
                  <span className="font-mono font-bold text-blue-600 text-sm">
                    +{formatCurrency(extraPayment)} / month
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="2000"
                  step="25"
                  value={extraPayment}
                  onChange={(e) => setExtraPayment(Number(e.target.value))}
                  className="w-full accent-blue-600 cursor-pointer h-2 bg-slate-200 rounded-lg"
                />
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400 font-medium">Quick add:</span>
                  {[50, 100, 200, 500].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setExtraPayment(amt)}
                      className={`text-xs px-2.5 py-1 rounded-md font-medium border transition-colors cursor-pointer ${
                        extraPayment === amt
                          ? 'bg-blue-50 border-blue-300 text-blue-700 font-bold'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      +${amt}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setExtraPayment(0)}
                    className="text-xs px-2.5 py-1 rounded-md font-medium text-slate-500 hover:text-slate-800 ml-auto cursor-pointer"
                  >
                    Reset ($0)
                  </button>
                </div>
              </div>
            </div>

            {/* Debts Table & Management */}
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <DollarSign size={18} className="text-blue-500" />
                  Your Debt Portfolio
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={importAccountsAsDebts}
                    className="text-xs font-semibold px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
                    title="Import credit card or loan accounts from your accounts ledger"
                  >
                    <RefreshCw size={13} />
                    Sync Accounts
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAddingDebt(!isAddingDebt)}
                    className="text-xs font-semibold px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus size={13} />
                    Add Custom Debt
                  </button>
                </div>
              </div>

              {/* Add Debt Inline Form */}
              {isAddingDebt && (
                <form
                  onSubmit={addCustomDebt}
                  className="mb-4 p-4 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-5 gap-3 items-end animate-in fade-in"
                >
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">Debt Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Visa Card"
                      value={newDebtName}
                      onChange={(e) => setNewDebtName(e.target.value)}
                      className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">Balance ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="3500.00"
                      value={newDebtBalance}
                      onChange={(e) => setNewDebtBalance(e.target.value)}
                      className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">APR (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="19.99"
                      value={newDebtApr}
                      onChange={(e) => setNewDebtApr(e.target.value)}
                      className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 block mb-1">Min Payment ($/mo)</label>
                    <input
                      type="number"
                      step="1"
                      placeholder="85.00"
                      value={newDebtMin}
                      onChange={(e) => setNewDebtMin(e.target.value)}
                      className="w-full text-xs px-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      className="flex-1 text-xs font-bold py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors cursor-pointer"
                    >
                      Save Debt
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsAddingDebt(false)}
                      className="text-xs font-semibold py-2 px-3 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {/* Debts Table */}
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                    <tr>
                      <th className="py-2.5 px-4">Debt / Liability</th>
                      <th className="py-2.5 px-4">Current Balance</th>
                      <th className="py-2.5 px-4">APR (%)</th>
                      <th className="py-2.5 px-4">Min Monthly Payment</th>
                      <th className="py-2.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {debts.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-slate-400 font-medium">
                          No active debts added. Click "Sync Accounts" or "Add Custom Debt" above.
                        </td>
                      </tr>
                    ) : (
                      debts.map((d) => (
                        <tr key={d.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-4 font-bold text-slate-800">
                            {d.name}
                            {d.isCustom && (
                              <span className="ml-2 text-[10px] font-normal text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                                custom
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono font-semibold text-slate-700">
                            <input
                              type="number"
                              step="0.01"
                              value={d.balance}
                              onChange={(e) => updateDebt(d.id, 'balance', parseFloat(e.target.value) || 0)}
                              className="w-28 font-mono text-xs px-2 py-1 border border-slate-200 rounded focus:ring-1 focus:ring-blue-500 bg-transparent"
                            />
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-700">
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                step="0.1"
                                value={d.interestRate}
                                onChange={(e) => updateDebt(d.id, 'interestRate', parseFloat(e.target.value) || 0)}
                                className="w-20 font-mono text-xs px-2 py-1 border border-slate-200 rounded focus:ring-1 focus:ring-blue-500 bg-transparent"
                              />
                              <span className="text-slate-400 font-mono">%</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-700">
                            <input
                              type="number"
                              step="1"
                              value={d.minPayment}
                              onChange={(e) => updateDebt(d.id, 'minPayment', parseFloat(e.target.value) || 0)}
                              className="w-24 font-mono text-xs px-2 py-1 border border-slate-200 rounded focus:ring-1 focus:ring-blue-500 bg-transparent"
                            />
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => removeDebt(d.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                              title="Delete debt"
                            >
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Payoff Trajectory Chart */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="text-base font-bold text-slate-800">Remaining Balance Trajectory</h3>
                <p className="text-xs text-slate-500">
                  Projected total debt balance reduction over time with your current extra payment.
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs font-medium">
                <span className="flex items-center gap-1.5 text-blue-600 font-bold">
                  <span className="w-3 h-3 rounded-full bg-blue-600 inline-block" />
                  {selectedStrategy === 'avalanche' ? 'Avalanche Payoff' : 'Snowball Payoff'}
                </span>
                <span className="text-slate-400">|</span>
                <span className="text-slate-500 font-mono">
                  Final Payoff: {activePlan.debtFreeDateStr} ({activePlan.debtFreeMonths} mo)
                </span>
              </div>
            </div>

            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={activePlan.timeline} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="debtPayoffGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    formatter={(val: any) => [formatCurrency(Number(val)), 'Total Debt Remaining']}
                    labelFormatter={(label) => `Month: ${label}`}
                    contentStyle={{
                      backgroundColor: '#1e293b',
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
                    fill="url(#debtPayoffGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Month-by-Month Amortization Schedule */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-800">Monthly Amortization Schedule</h3>
                <p className="text-xs text-slate-500">
                  Exact breakdown of principal reduction, interest incurred, and remaining balance.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Download size={14} />
                  Export CSV
                </button>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="py-2.5 px-4">Month</th>
                    <th className="py-2.5 px-4">Starting Balance</th>
                    <th className="py-2.5 px-4">Total Payment</th>
                    <th className="py-2.5 px-4">Principal Paid</th>
                    <th className="py-2.5 px-4">Interest Paid</th>
                    <th className="py-2.5 px-4">Ending Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {activePlan.schedule.slice(0, showScheduleLimit).map((row) => (
                    <tr key={row.monthIndex} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2.5 px-4 font-bold text-slate-800 font-sans">
                        #{row.monthIndex} • {row.dateStr}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600">{formatCurrency(row.startBalance)}</td>
                      <td className="py-2.5 px-4 font-bold text-blue-600">{formatCurrency(row.payment)}</td>
                      <td className="py-2.5 px-4 text-emerald-600 font-semibold">{formatCurrency(row.principal)}</td>
                      <td className="py-2.5 px-4 text-rose-500">{formatCurrency(row.interest)}</td>
                      <td className="py-2.5 px-4 font-bold text-slate-800">{formatCurrency(row.endBalance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {activePlan.schedule.length > showScheduleLimit && (
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => setShowScheduleLimit((prev) => prev + 36)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                >
                  Show More Months ({activePlan.schedule.length - showScheduleLimit} remaining)
                </button>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Single Loan Amortization Mode */
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Monthly Payment</span>
              <div className="text-2xl font-extrabold text-blue-600 font-mono mt-1">
                {formatCurrency(singleLoanResult.monthlyPayment)}
              </div>
              <span className="text-xs text-slate-500 mt-1 block">
                Base loan payment (+{formatCurrency(singleExtra)} extra = {formatCurrency(singleLoanResult.monthlyPayment + singleExtra)})
              </span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Interest</span>
              <div className="text-2xl font-extrabold text-rose-600 font-mono mt-1">
                {formatCurrency(singleLoanResult.totalInterest)}
              </div>
              <span className="text-xs text-slate-500 mt-1 block">Lifetime finance charge</span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Payoff Duration</span>
              <div className="text-2xl font-extrabold text-emerald-600 font-mono mt-1">
                {singleLoanResult.payoffMonths} Months
              </div>
              <span className="text-xs text-emerald-700 font-medium mt-1 block">
                {(singleLoanResult.payoffMonths / 12).toFixed(1)} years
              </span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Cost of Loan</span>
              <div className="text-2xl font-extrabold text-slate-800 font-mono mt-1">
                {formatCurrency(singleLoanResult.totalPayment)}
              </div>
              <span className="text-xs text-slate-500 mt-1 block">Principal + total interest</span>
            </div>
          </div>

          {/* Single Loan Parameter Inputs */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
            <h3 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Calculator size={18} className="text-blue-500" />
              Loan Parameters
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Loan Amount / Principal ($)</label>
                <input
                  type="number"
                  step="500"
                  value={singlePrincipal}
                  onChange={(e) => setSinglePrincipal(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full text-sm px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Annual Interest Rate (APR %)</label>
                <input
                  type="number"
                  step="0.1"
                  value={singleApr}
                  onChange={(e) => setSingleApr(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full text-sm px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Loan Term (Years)</label>
                <select
                  value={singleTermYears}
                  onChange={(e) => setSingleTermYears(Number(e.target.value))}
                  className="w-full text-sm px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 bg-white font-medium"
                >
                  <option value={1}>1 Year (12 months)</option>
                  <option value={2}>2 Years (24 months)</option>
                  <option value={3}>3 Years (36 months)</option>
                  <option value={4}>4 Years (48 months)</option>
                  <option value={5}>5 Years (60 months)</option>
                  <option value={7}>7 Years (84 months)</option>
                  <option value={10}>10 Years (120 months)</option>
                  <option value={15}>15 Years (180 months)</option>
                  <option value={20}>20 Years (240 months)</option>
                  <option value={30}>30 Years (360 months)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">Extra Monthly Payment ($)</label>
                <input
                  type="number"
                  step="25"
                  value={singleExtra}
                  onChange={(e) => setSingleExtra(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full text-sm px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>
            </div>
          </div>

          {/* Single Loan Amortization Table */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
            <h3 className="text-base font-bold text-slate-800 mb-4">Loan Amortization Breakdown</h3>
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="py-2.5 px-4">Payment #</th>
                    <th className="py-2.5 px-4">Date</th>
                    <th className="py-2.5 px-4">Payment</th>
                    <th className="py-2.5 px-4">Principal</th>
                    <th className="py-2.5 px-4">Interest</th>
                    <th className="py-2.5 px-4">Total Interest Paid</th>
                    <th className="py-2.5 px-4">Remaining Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {singleLoanResult.schedule.slice(0, 36).map((r) => (
                    <tr key={r.paymentNumber} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2.5 px-4 font-bold font-sans">#{r.paymentNumber}</td>
                      <td className="py-2.5 px-4 text-slate-600">{r.dateStr}</td>
                      <td className="py-2.5 px-4 font-bold text-blue-600">{formatCurrency(r.payment)}</td>
                      <td className="py-2.5 px-4 text-emerald-600 font-semibold">{formatCurrency(r.principal)}</td>
                      <td className="py-2.5 px-4 text-rose-500">{formatCurrency(r.interest)}</td>
                      <td className="py-2.5 px-4 text-slate-500">{formatCurrency(r.cumulativeInterest)}</td>
                      <td className="py-2.5 px-4 font-bold text-slate-800">{formatCurrency(r.remainingBalance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DebtPayoffPlanner;
