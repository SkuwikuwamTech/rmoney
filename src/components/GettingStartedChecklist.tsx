import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronUp,
  X,
  Sparkles,
  Wallet,
  Target,
  Calendar,
  BarChart3,
  Eye,
  PieChart,
  ArrowRight,
  RotateCcw,
} from 'lucide-react';
import { getDb } from '../utils/db';
import { Account } from '../types';

interface GettingStartedChecklistProps {
  accounts: Account[];
  onNavigate: (page: string) => void;
  onTogglePrivacyMode: () => void;
  privacyMode: boolean;
  onOpenAddAccount?: () => void;
  onLaunchOnboarding?: () => void;
}

export const GettingStartedChecklist: React.FC<GettingStartedChecklistProps> = ({
  accounts,
  onNavigate,
  onTogglePrivacyMode,
  privacyMode,
  onOpenAddAccount,
  onLaunchOnboarding,
}) => {
  const [isDismissed, setIsDismissed] = useState<boolean>(() => {
    return localStorage.getItem('rmoney_checklist_dismissed') === 'true';
  });
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    const saved = localStorage.getItem('rmoney_checklist_collapsed');
    if (saved !== null) return saved === 'true';
    return typeof window !== 'undefined' && window.innerWidth < 768;
  });

  const [hasBudgets, setHasBudgets] = useState<boolean>(false);
  const [hasBills, setHasBills] = useState<boolean>(false);
  const [visitedForecast, setVisitedForecast] = useState<boolean>(() => {
    return localStorage.getItem('rmoney_checklist_forecast') === 'true';
  });
  const [visitedReports, setVisitedReports] = useState<boolean>(() => {
    return localStorage.getItem('rmoney_checklist_reports') === 'true';
  });
  const [triedPrivacy, setTriedPrivacy] = useState<boolean>(() => {
    return (
      privacyMode || localStorage.getItem('rmoney_checklist_privacy') === 'true'
    );
  });

  useEffect(() => {
    if (privacyMode) {
      setTriedPrivacy(true);
      localStorage.setItem('rmoney_checklist_privacy', 'true');
    }
  }, [privacyMode]);

  useEffect(() => {
    async function checkData() {
      try {
        const db = await getDb();
        const budgetRes = (await db.select(
          'SELECT COUNT(*) as count FROM categories WHERE monthly_budget > 0'
        )) as { count: number }[];
        setHasBudgets((budgetRes[0]?.count || 0) > 0);

        const billsRes = (await db.select(
          'SELECT COUNT(*) as count FROM scheduled_transactions'
        )) as { count: number }[];
        setHasBills((billsRes[0]?.count || 0) > 0);
      } catch (e) {
        console.error('Checklist verification error:', e);
      }
    }
    checkData();
  }, [accounts]);

  if (isDismissed) return null;

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('rmoney_checklist_collapsed', String(next));
      return next;
    });
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    localStorage.setItem('rmoney_checklist_dismissed', 'true');
  };

  const handleForecastClick = () => {
    setVisitedForecast(true);
    localStorage.setItem('rmoney_checklist_forecast', 'true');
    onNavigate('forecast');
  };

  const handleReportsClick = () => {
    setVisitedReports(true);
    localStorage.setItem('rmoney_checklist_reports', 'true');
    onNavigate('reports');
  };

  const handlePrivacyClick = () => {
    setTriedPrivacy(true);
    localStorage.setItem('rmoney_checklist_privacy', 'true');
    onTogglePrivacyMode();
  };

  // Compact Checklist Tasks
  const tasks = [
    {
      id: 'accounts',
      title: 'Add your accounts',
      completed: accounts.length > 0,
      actionLabel: 'Manage',
      icon: <Wallet size={13} className="text-blue-500 shrink-0" />,
      onClick: () => (onOpenAddAccount ? onOpenAddAccount() : onNavigate('accounts')),
    },
    {
      id: 'budget',
      title: 'Monthly category budgets',
      completed: hasBudgets,
      actionLabel: 'Budget',
      icon: <Target size={13} className="text-emerald-500 shrink-0" />,
      onClick: () => onNavigate('budget'),
    },
    {
      id: 'bills',
      title: 'Recurring bills & income',
      completed: hasBills,
      actionLabel: 'Bills',
      icon: <Calendar size={13} className="text-amber-500 shrink-0" />,
      onClick: () => onNavigate('bills'),
    },
    {
      id: 'forecast',
      title: '30-day cash flow forecast',
      completed: visitedForecast,
      actionLabel: 'Forecast',
      icon: <BarChart3 size={13} className="text-indigo-500 shrink-0" />,
      onClick: handleForecastClick,
    },
    {
      id: 'privacy',
      title: 'Privacy Mode (Ctrl+H)',
      completed: triedPrivacy,
      actionLabel: privacyMode ? 'Active' : 'Toggle',
      icon: <Eye size={13} className="text-purple-500 shrink-0" />,
      onClick: handlePrivacyClick,
    },
    {
      id: 'reports',
      title: 'Financial reports & PDF',
      completed: visitedReports,
      actionLabel: 'Reports',
      icon: <PieChart size={13} className="text-rose-500 shrink-0" />,
      onClick: handleReportsClick,
    },
  ];

  const completedCount = tasks.filter((t) => t.completed).length;
  const totalCount = tasks.length;
  const progressPct = Math.round((completedCount / totalCount) * 100);
  const allCompleted = completedCount === totalCount;

  return (
    <div className="bg-white rounded-2xl p-3.5 sm:p-4 shadow-xs border border-slate-200/90 transition-all space-y-2.5">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-2xs shrink-0">
            <Sparkles size={13} />
          </div>

          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <h2 className="text-xs sm:text-sm font-bold text-slate-800 tracking-tight">
              Getting Started
            </h2>

            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                allCompleted
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-blue-50 text-blue-700 border border-blue-200'
              }`}
            >
              {allCompleted ? 'All Done! 🎉' : `${completedCount}/${totalCount} complete`}
            </span>

            {/* Inline Progress Bar */}
            <div className="w-20 sm:w-28 bg-slate-100 rounded-full h-1.5 overflow-hidden shrink-0">
              <div
                className={`h-full transition-all duration-500 ${
                  allCompleted ? 'bg-emerald-500' : 'bg-gradient-to-r from-blue-600 to-indigo-600'
                }`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {onLaunchOnboarding && (
            <button
              onClick={onLaunchOnboarding}
              className="text-[11px] font-semibold text-slate-500 hover:text-blue-600 px-2 py-1 rounded-md hover:bg-slate-100 transition-colors cursor-pointer hidden md:flex items-center gap-1"
              title="Open Welcome Tour"
            >
              <RotateCcw size={12} />
              <span>Tour</span>
            </button>
          )}

          <button
            onClick={toggleCollapse}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            title={isCollapsed ? 'Expand Checklist' : 'Collapse Checklist'}
          >
            {isCollapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
          </button>

          <button
            onClick={handleDismiss}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            title="Dismiss Checklist"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Task List (Compact single-line grid) */}
      {!isCollapsed && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-1 border-t border-slate-100">
          {tasks.map((task) => (
            <div
              key={task.id}
              onClick={task.onClick}
              className={`px-3 py-2 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                task.completed
                  ? 'bg-slate-50/70 border-slate-200/70 hover:bg-slate-100/60'
                  : 'bg-white border-blue-200/80 shadow-2xs hover:border-blue-400'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                {task.completed ? (
                  <CheckCircle2 size={15} className="text-emerald-500 fill-emerald-50 shrink-0" />
                ) : (
                  <Circle size={15} className="text-slate-300 shrink-0" />
                )}
                {task.icon}
                <span
                  className={`text-xs truncate ${
                    task.completed
                      ? 'text-slate-400 line-through font-medium'
                      : 'text-slate-800 font-semibold'
                  }`}
                >
                  {task.title}
                </span>
              </div>

              <span
                className={`text-[11px] font-bold shrink-0 flex items-center gap-0.5 ${
                  task.completed
                    ? 'text-slate-400 hover:text-slate-600'
                    : 'text-blue-600 hover:text-blue-700'
                }`}
              >
                {task.actionLabel}
                <ArrowRight size={10} />
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default GettingStartedChecklist;
