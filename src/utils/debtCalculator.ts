/**
 * Debt Payoff & Loan Amortization Engine for rMoney
 * Implements:
 * 1. Debt Snowball (lowest balance first)
 * 2. Debt Avalanche (highest interest rate first)
 * 3. Side-by-side comparative analytics (Interest saved, Debt-Free Date diff)
 * 4. Month-by-month loan amortization schedules with CSV export
 */

export interface DebtItem {
  id: string;
  name: string;
  balance: number; // positive dollar amount owed
  interestRate: number; // APR in percentage (e.g. 18.5 for 18.5%)
  minPayment: number; // monthly minimum payment
  isCustom?: boolean;
}

export interface AmortizationDebtDetail {
  id: string;
  name: string;
  startBalance: number;
  payment: number;
  principal: number;
  interest: number;
  endBalance: number;
}

export interface AmortizationMonth {
  monthIndex: number; // 1, 2, ...
  dateStr: string; // YYYY-MM
  startBalance: number;
  payment: number;
  principal: number;
  interest: number;
  endBalance: number;
  debtBreakdown: AmortizationDebtDetail[];
}

export interface PayoffPlanResult {
  method: 'snowball' | 'avalanche';
  totalInitialDebt: number;
  totalMonthlyMinPayments: number;
  extraMonthlyPayment: number;
  debtFreeMonths: number;
  debtFreeDateStr: string;
  totalInterestPaid: number;
  totalPaid: number;
  schedule: AmortizationMonth[];
  timeline: { month: string; balance: number; [debtName: string]: number | string }[];
}

export interface PayoffComparison {
  initialDebt: number;
  snowball: PayoffPlanResult;
  avalanche: PayoffPlanResult;
  baselineMinOnly: {
    debtFreeMonths: number;
    debtFreeDateStr: string;
    totalInterestPaid: number;
    totalPaid: number;
  };
  interestSavedVsBaseline: {
    snowball: number;
    avalanche: number;
  };
  monthsSavedVsBaseline: {
    snowball: number;
    avalanche: number;
  };
  bestMethod: 'avalanche' | 'snowball' | 'tie';
  savingsDiff: number;
}

/**
 * Format month date offset from current date
 */
function getOffsetMonthStr(monthsAhead: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + monthsAhead);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Run debt payoff simulation for either Snowball or Avalanche
 */
export function calculatePayoffPlan(
  debts: DebtItem[],
  extraMonthlyPayment: number = 0,
  method: 'snowball' | 'avalanche' = 'avalanche'
): PayoffPlanResult {
  // Filter active debts
  const activeDebts = debts
    .filter((d) => d.balance > 0.01)
    .map((d) => ({
      ...d,
      balance: Math.round(d.balance * 100) / 100,
      minPayment: Math.max(1, d.minPayment || Math.round(d.balance * 0.02 * 100) / 100),
    }));

  const totalInitialDebt = activeDebts.reduce((sum, d) => sum + d.balance, 0);
  const totalMonthlyMinPayments = activeDebts.reduce((sum, d) => sum + d.minPayment, 0);

  if (activeDebts.length === 0) {
    return {
      method,
      totalInitialDebt: 0,
      totalMonthlyMinPayments: 0,
      extraMonthlyPayment,
      debtFreeMonths: 0,
      debtFreeDateStr: getOffsetMonthStr(0),
      totalInterestPaid: 0,
      totalPaid: 0,
      schedule: [],
      timeline: [],
    };
  }

  // Deep clone tracking balances
  const balances = activeDebts.map((d) => ({ ...d }));
  const schedule: AmortizationMonth[] = [];
  const timeline: { month: string; balance: number; [debtName: string]: number | string }[] = [];

  // Add initial month 0 point
  const initTimelinePoint: { month: string; balance: number; [debtName: string]: number | string } = {
    month: getOffsetMonthStr(0),
    balance: Math.round(totalInitialDebt),
  };
  balances.forEach((b) => {
    initTimelinePoint[b.name] = Math.round(b.balance);
  });
  timeline.push(initTimelinePoint);

  let totalInterestPaid = 0;
  let totalPaid = 0;
  let month = 0;
  const maxMonths = 360; // 30 years safety cap

  while (balances.some((b) => b.balance > 0.01) && month < maxMonths) {
    month++;
    const dateStr = getOffsetMonthStr(month);
    const monthStartBalance = balances.reduce((sum, b) => sum + b.balance, 0);

    let monthInterest = 0;
    let monthPayment = 0;
    let monthPrincipal = 0;

    const debtBreakdowns: AmortizationDebtDetail[] = [];
    let freedUpFromPaidOff = 0;

    // Step 1: Accrue monthly interest on all active debts
    balances.forEach((d) => {
      if (d.balance > 0.01) {
        const monthlyRate = (d.interestRate / 100) / 12;
        const interest = Math.round(d.balance * monthlyRate * 100) / 100;
        d.balance += interest;
        monthInterest += interest;
      }
    });

    // Step 2: Pay minimums first
    balances.forEach((d) => {
      const debtStart = d.balance;
      if (debtStart <= 0.01) {
        freedUpFromPaidOff += d.minPayment;
        debtBreakdowns.push({
          id: d.id,
          name: d.name,
          startBalance: 0,
          payment: 0,
          principal: 0,
          interest: 0,
          endBalance: 0,
        });
        return;
      }

      // Minimum payment cannot exceed remaining balance
      const requiredPay = Math.min(d.minPayment, d.balance);
      d.balance -= requiredPay;
      monthPayment += requiredPay;

      debtBreakdowns.push({
        id: d.id,
        name: d.name,
        startBalance: debtStart,
        payment: requiredPay,
        principal: requiredPay,
        interest: 0, // already included in start
        endBalance: Math.max(0, d.balance),
      });

      // If debt just reached 0, the remaining portion of its min payment rolls over next
      if (d.balance <= 0.01) {
        d.balance = 0;
        freedUpFromPaidOff += Math.max(0, d.minPayment - requiredPay);
      }
    });

    // Step 3: Roll leftover extra payment + freed-up minimums into the prioritized debt
    let availableExtra = extraMonthlyPayment + freedUpFromPaidOff;

    while (availableExtra > 0.01 && balances.some((b) => b.balance > 0.01)) {
      // Sort remaining active debts based on strategy
      const eligible = balances
        .map((b, idx) => ({ ...b, originalIndex: idx }))
        .filter((b) => b.balance > 0.01);

      if (eligible.length === 0) break;

      if (method === 'snowball') {
        // Lowest balance first
        eligible.sort((a, b) => a.balance - b.balance);
      } else {
        // Highest APR first
        eligible.sort((a, b) => b.interestRate - a.interestRate);
      }

      const target = eligible[0];
      const targetOriginal = balances[target.originalIndex];

      const extraToApply = Math.min(availableExtra, targetOriginal.balance);
      targetOriginal.balance -= extraToApply;
      availableExtra -= extraToApply;
      monthPayment += extraToApply;

      // Update breakdown
      const brk = debtBreakdowns.find((item) => item.id === targetOriginal.id);
      if (brk) {
        brk.payment += extraToApply;
        brk.principal += extraToApply;
        brk.endBalance = Math.max(0, targetOriginal.balance);
      }

      if (targetOriginal.balance <= 0.01) {
        targetOriginal.balance = 0;
      }
    }

    monthPrincipal = monthPayment - monthInterest;
    totalInterestPaid += monthInterest;
    totalPaid += monthPayment;

    const monthEndBalance = Math.max(0, balances.reduce((sum, b) => sum + b.balance, 0));

    schedule.push({
      monthIndex: month,
      dateStr,
      startBalance: Math.round(monthStartBalance * 100) / 100,
      payment: Math.round(monthPayment * 100) / 100,
      principal: Math.round(monthPrincipal * 100) / 100,
      interest: Math.round(monthInterest * 100) / 100,
      endBalance: Math.round(monthEndBalance * 100) / 100,
      debtBreakdown: debtBreakdowns,
    });

    // Timeline data point (sample every month up to 60, then every 3 months for charting efficiency)
    if (month <= 60 || month % 3 === 0 || monthEndBalance <= 0.01) {
      const pt: { month: string; balance: number; [debtName: string]: number | string } = {
        month: dateStr,
        balance: Math.round(monthEndBalance),
      };
      balances.forEach((b) => {
        pt[b.name] = Math.round(b.balance);
      });
      timeline.push(pt);
    }

    if (monthEndBalance <= 0.01) {
      break;
    }
  }

  return {
    method,
    totalInitialDebt: Math.round(totalInitialDebt * 100) / 100,
    totalMonthlyMinPayments: Math.round(totalMonthlyMinPayments * 100) / 100,
    extraMonthlyPayment,
    debtFreeMonths: month,
    debtFreeDateStr: getOffsetMonthStr(month),
    totalInterestPaid: Math.round(totalInterestPaid * 100) / 100,
    totalPaid: Math.round(totalPaid * 100) / 100,
    schedule,
    timeline,
  };
}

/**
 * Compare Snowball, Avalanche, and baseline minimum payments
 */
export function compareDebtStrategies(
  debts: DebtItem[],
  extraMonthlyPayment: number = 0
): PayoffComparison {
  const snowball = calculatePayoffPlan(debts, extraMonthlyPayment, 'snowball');
  const avalanche = calculatePayoffPlan(debts, extraMonthlyPayment, 'avalanche');
  const baseline = calculatePayoffPlan(debts, 0, 'avalanche');

  const totalInitial = snowball.totalInitialDebt;

  const snowballSaved = Math.max(0, baseline.totalInterestPaid - snowball.totalInterestPaid);
  const avalancheSaved = Math.max(0, baseline.totalInterestPaid - avalanche.totalInterestPaid);

  const snowballMonthsSaved = Math.max(0, baseline.debtFreeMonths - snowball.debtFreeMonths);
  const avalancheMonthsSaved = Math.max(0, baseline.debtFreeMonths - avalanche.debtFreeMonths);

  let bestMethod: 'avalanche' | 'snowball' | 'tie' = 'tie';
  const savingsDiff = Math.abs(avalanche.totalInterestPaid - snowball.totalInterestPaid);

  if (avalanche.totalInterestPaid < snowball.totalInterestPaid - 0.5) {
    bestMethod = 'avalanche';
  } else if (snowball.totalInterestPaid < avalanche.totalInterestPaid - 0.5) {
    bestMethod = 'snowball';
  }

  return {
    initialDebt: totalInitial,
    snowball,
    avalanche,
    baselineMinOnly: {
      debtFreeMonths: baseline.debtFreeMonths,
      debtFreeDateStr: baseline.debtFreeDateStr,
      totalInterestPaid: baseline.totalInterestPaid,
      totalPaid: baseline.totalPaid,
    },
    interestSavedVsBaseline: {
      snowball: Math.round(snowballSaved * 100) / 100,
      avalanche: Math.round(avalancheSaved * 100) / 100,
    },
    monthsSavedVsBaseline: {
      snowball: snowballMonthsSaved,
      avalanche: avalancheMonthsSaved,
    },
    bestMethod,
    savingsDiff: Math.round(savingsDiff * 100) / 100,
  };
}

/**
 * Calculate standard fixed loan amortization schedule (e.g. Auto Loan, Mortgage)
 */
export interface LoanAmortizationRow {
  paymentNumber: number;
  dateStr: string;
  payment: number;
  principal: number;
  interest: number;
  remainingBalance: number;
  cumulativeInterest: number;
}

export function calculateSingleLoanAmortization(
  principal: number,
  annualRatePct: number,
  termMonths: number,
  extraMonthlyPayment: number = 0
): {
  monthlyPayment: number;
  totalPayment: number;
  totalInterest: number;
  payoffMonths: number;
  schedule: LoanAmortizationRow[];
} {
  if (principal <= 0 || termMonths <= 0) {
    return { monthlyPayment: 0, totalPayment: 0, totalInterest: 0, payoffMonths: 0, schedule: [] };
  }

  const monthlyRate = annualRatePct / 100 / 12;
  let baseMonthlyPayment = 0;

  if (monthlyRate === 0) {
    baseMonthlyPayment = principal / termMonths;
  } else {
    baseMonthlyPayment =
      (principal * (monthlyRate * Math.pow(1 + monthlyRate, termMonths))) /
      (Math.pow(1 + monthlyRate, termMonths) - 1);
  }

  const totalMonthlyPay = baseMonthlyPayment + extraMonthlyPayment;
  let balance = principal;
  let cumInterest = 0;
  let cumTotal = 0;
  const schedule: LoanAmortizationRow[] = [];
  let month = 0;

  while (balance > 0.01 && month < termMonths * 2) {
    month++;
    const dateStr = getOffsetMonthStr(month);
    const interest = monthlyRate * balance;
    let payment = Math.min(totalMonthlyPay, balance + interest);
    let principalPaid = payment - interest;

    if (principalPaid > balance) {
      principalPaid = balance;
      payment = principalPaid + interest;
    }

    balance = Math.max(0, balance - principalPaid);
    cumInterest += interest;
    cumTotal += payment;

    schedule.push({
      paymentNumber: month,
      dateStr,
      payment: Math.round(payment * 100) / 100,
      principal: Math.round(principalPaid * 100) / 100,
      interest: Math.round(interest * 100) / 100,
      remainingBalance: Math.round(balance * 100) / 100,
      cumulativeInterest: Math.round(cumInterest * 100) / 100,
    });

    if (balance <= 0.01) break;
  }

  return {
    monthlyPayment: Math.round(baseMonthlyPayment * 100) / 100,
    totalPayment: Math.round(cumTotal * 100) / 100,
    totalInterest: Math.round(cumInterest * 100) / 100,
    payoffMonths: month,
    schedule,
  };
}

/**
 * Generate CSV text for amortization schedule export
 */
export function exportAmortizationToCsv(schedule: AmortizationMonth[]): string {
  const headers = ['Month #', 'Date', 'Starting Balance', 'Payment', 'Principal Paid', 'Interest Incurred', 'Ending Balance'];
  const rows = schedule.map((m) => [
    m.monthIndex,
    m.dateStr,
    m.startBalance.toFixed(2),
    m.payment.toFixed(2),
    m.principal.toFixed(2),
    m.interest.toFixed(2),
    m.endBalance.toFixed(2),
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}
