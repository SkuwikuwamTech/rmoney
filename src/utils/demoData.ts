import { getDb } from './db';
import { Account } from '../types';
import { getLocalTodayStr } from './currency';

export const DEFAULT_CATEGORIES = [
  { id: 1, name: 'Salary', type: 'income' as const, monthly_budget: 0 },
  { id: 2, name: 'Freelance & Consulting', type: 'income' as const, monthly_budget: 0 },
  { id: 3, name: 'Dividends & Interest', type: 'income' as const, monthly_budget: 0 },
  { id: 4, name: 'Housing & Rent', type: 'expense' as const, monthly_budget: 1850 },
  { id: 5, name: 'Groceries & Markets', type: 'expense' as const, monthly_budget: 650 },
  { id: 6, name: 'Dining & Restaurants', type: 'expense' as const, monthly_budget: 300 },
  { id: 7, name: 'Utilities & Power', type: 'expense' as const, monthly_budget: 220 },
  { id: 8, name: 'Internet & Mobile', type: 'expense' as const, monthly_budget: 120 },
  { id: 9, name: 'Transportation & Fuel', type: 'expense' as const, monthly_budget: 250 },
  { id: 10, name: 'Healthcare & Wellness', type: 'expense' as const, monthly_budget: 150 },
  { id: 11, name: 'Entertainment & Streaming', type: 'expense' as const, monthly_budget: 100 },
  { id: 12, name: 'Shopping & Electronics', type: 'expense' as const, monthly_budget: 250 },
  { id: 13, name: 'Investments & Transfers', type: 'expense' as const, monthly_budget: 0 },
  { id: 14, name: 'General', type: 'expense' as const, monthly_budget: 150 },
];

export async function seedDemoData(force: boolean = false): Promise<{ success: boolean; message: string }> {
  const db = await getDb();

  // If not forcing, check if accounts already exist
  if (!force) {
    const existingAccounts = (await db.select('SELECT id FROM accounts LIMIT 1')) as Account[];
    if (existingAccounts.length > 0) {
      return { success: false, message: 'Database already has existing data.' };
    }
  }

  try {
    await db.execute('PRAGMA foreign_keys = OFF');
  } catch (e) {
    console.warn('Could not disable foreign keys:', e);
  }

  // Clear existing data
  await db.execute('DELETE FROM transaction_splits');
  await db.execute('DELETE FROM transaction_attachments');
  await db.execute('DELETE FROM transactions');
  await db.execute('DELETE FROM scheduled_transaction_overrides');
  await db.execute('DELETE FROM scheduled_transactions');
  await db.execute('DELETE FROM accounts');
  await db.execute('DELETE FROM categories');

  // Reset SQLite auto-increment counters
  try {
    await db.execute("DELETE FROM sqlite_sequence WHERE name IN ('transactions', 'scheduled_transaction_overrides', 'scheduled_transactions', 'accounts', 'categories')");
  } catch (e) {
    // sqlite_sequence table might not exist yet if fresh
  }

  // 1. Seed Categories
  const categories = DEFAULT_CATEGORIES;

  for (const cat of categories) {
    await db.execute('INSERT INTO categories (id, name, type, monthly_budget) VALUES (?, ?, ?, ?)', [
      cat.id,
      cat.name,
      cat.type,
      cat.monthly_budget || 0,
    ]);
  }

  // 2. Seed Accounts with realistic starter balances (including liability loans for Net Worth & Debt Planner)
  const accounts = [
    { id: 1, name: 'Premier Checking', type: 'Checking', balance: 6420.50, currency: 'USD', is_favorite: 1 },
    { id: 2, name: 'High-Yield Sanctuary Savings', type: 'Savings', balance: 28500.00, currency: 'USD', is_favorite: 1 },
    { id: 3, name: 'Sapphire Preferred Rewards', type: 'Credit Card', balance: -1480.60, currency: 'USD', is_favorite: 1 },
    { id: 4, name: 'Vanguard Total Market Index', type: 'Investment', balance: 64850.75, currency: 'USD', is_favorite: 1 },
    { id: 5, name: 'Honda Civic Touring Loan', type: 'Loan', balance: -11450.00, currency: 'USD', is_favorite: 0 },
    { id: 6, name: 'Federal Direct Student Loan', type: 'Loan', balance: -8200.00, currency: 'USD', is_favorite: 0 },
  ];

  for (const acc of accounts) {
    await db.execute(
      'INSERT INTO accounts (id, name, type, balance, currency, is_favorite) VALUES (?, ?, ?, ?, ?, ?)',
      [acc.id, acc.name, acc.type, acc.balance, acc.currency, acc.is_favorite]
    );
  }

  // Helper date generators relative to today so the demo is always fresh and realistic
  const formatOffset = (daysOffset: number): string => {
    return getLocalTodayStr(daysOffset);
  };

  // Helper SVG receipt generator (base64 data URI) for instant Receipt Vault previews
  const createDemoReceiptDataUri = (merchant: string, dateStr: string, total: string, items: { label: string; price: string }[], note: string): { uri: string; size: number } => {
    const itemRows = items
      .map(
        (it, idx) =>
          `<text x="36" y="${175 + idx * 28}" fill="#334155" font-family="monospace" font-size="13">${it.label}</text>` +
          `<text x="384" y="${175 + idx * 28}" fill="#0f172a" font-family="monospace" font-size="13" font-weight="bold" text-anchor="end">${it.price}</text>`
      )
      .join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="380" viewBox="0 0 420 380">
      <rect width="420" height="380" rx="16" fill="#f8fafc" stroke="#cbd5e1" stroke-width="2"/>
      <rect x="20" y="20" width="380" height="76" rx="10" fill="#0f172a"/>
      <text x="210" y="52" fill="#ffffff" font-family="sans-serif" font-size="18" font-weight="bold" text-anchor="middle">${merchant}</text>
      <text x="210" y="76" fill="#94a3b8" font-family="monospace" font-size="12" text-anchor="middle">VERIFIED RECEIPT • ${dateStr}</text>
      <line x1="36" y1="135" x2="384" y2="135" stroke="#cbd5e1" stroke-dasharray="4 4"/>
      ${itemRows}
      <line x1="36" y1="265" x2="384" y2="265" stroke="#94a3b8" stroke-width="1.5"/>
      <text x="36" y="295" fill="#0f172a" font-family="sans-serif" font-size="16" font-weight="bold">TOTAL PAID</text>
      <text x="384" y="295" fill="#059669" font-family="monospace" font-size="18" font-weight="bold" text-anchor="end">${total}</text>
      <rect x="36" y="318" width="348" height="34" rx="8" fill="#ecfdf5" stroke="#a7f3d0"/>
      <text x="210" y="340" fill="#047857" font-family="sans-serif" font-size="11" font-weight="bold" text-anchor="middle">${note}</text>
    </svg>`;
    const b64 = typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(svg))) : '';
    return {
      uri: `data:image/svg+xml;base64,${b64}`,
      size: svg.length,
    };
  };

  // 3. Seed Scheduled Transactions (Bills, Loan Payments & Recurring Income)
  const scheduled = [
    {
      id: 1,
      account_id: 1,
      category_id: 1,
      amount: 3450.00,
      frequency: 'bi-weekly',
      next_date: formatOffset(4),
      payee: 'Acme Technologies Payroll',
      type: 'income',
      to_account_id: null,
    },
    {
      id: 2,
      account_id: 1,
      category_id: 4,
      amount: 1850.00,
      frequency: 'monthly',
      next_date: formatOffset(11),
      payee: 'Metropolitan Luxury Apartments',
      type: 'expense',
      to_account_id: null,
    },
    {
      id: 3,
      account_id: 1,
      category_id: 7,
      amount: 145.20,
      frequency: 'monthly',
      next_date: formatOffset(7),
      payee: 'City Electric & Power',
      type: 'expense',
      to_account_id: null,
    },
    {
      id: 4,
      account_id: 1,
      category_id: 8,
      amount: 89.99,
      frequency: 'monthly',
      next_date: formatOffset(14),
      payee: 'Gigabit Fiber Internet',
      type: 'expense',
      to_account_id: null,
    },
    {
      id: 5,
      account_id: 3,
      category_id: 11,
      amount: 24.99,
      frequency: 'monthly',
      next_date: formatOffset(2),
      payee: 'Netflix & Spotify Family Plan',
      type: 'expense',
      to_account_id: null,
    },
    {
      id: 6,
      account_id: 1,
      category_id: 13,
      amount: 600.00,
      frequency: 'monthly',
      next_date: formatOffset(15),
      payee: 'Monthly Sanctuary Savings Transfer',
      type: 'transfer',
      to_account_id: 2,
    },
    {
      id: 7,
      account_id: 1,
      category_id: 10,
      amount: 75.00,
      frequency: 'monthly',
      next_date: formatOffset(18),
      payee: 'Equinox Fitness & Wellness',
      type: 'expense',
      to_account_id: null,
    },
    {
      id: 8,
      account_id: 1,
      category_id: 9,
      amount: 290.00,
      frequency: 'monthly',
      next_date: formatOffset(9),
      payee: 'Honda Financial Auto Payment',
      type: 'expense',
      to_account_id: null,
    },
    {
      id: 9,
      account_id: 1,
      category_id: 14,
      amount: 140.00,
      frequency: 'monthly',
      next_date: formatOffset(21),
      payee: 'Federal Student Aid Auto-Debit',
      type: 'expense',
      to_account_id: null,
    },
    {
      id: 10,
      account_id: 1,
      category_id: 2,
      amount: 950.00,
      frequency: 'monthly',
      next_date: formatOffset(25),
      payee: 'FinTech Advisory Retainer',
      type: 'income',
      to_account_id: null,
    },
  ];

  for (const st of scheduled) {
    await db.execute(
      'INSERT INTO scheduled_transactions (id, account_id, category_id, amount, frequency, next_date, payee, type, to_account_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        st.id,
        st.account_id,
        st.category_id,
        st.amount,
        st.frequency,
        st.next_date,
        st.payee,
        st.type,
        st.to_account_id,
      ]
    );
  }

  // 3b. Seed Single-Instance Scheduled Overrides so 365-Day Forecast highlights rescheduled/adjusted occurrences
  const overrides = [
    {
      id: 1,
      scheduled_id: 3,
      original_date: formatOffset(7),
      new_date: formatOffset(9),
      date: formatOffset(7),
      amount: 182.50,
      payee: 'City Electric & Power (Seasonal Peak Adjustment)',
      account_id: 1,
    },
    {
      id: 2,
      scheduled_id: 1,
      original_date: formatOffset(18),
      new_date: formatOffset(18),
      date: formatOffset(18),
      amount: 4250.00,
      payee: 'Acme Technologies Payroll (+ Quarterly Performance Bonus)',
      account_id: 1,
    },
  ];

  for (const ov of overrides) {
    await db.execute(
      'INSERT INTO scheduled_transaction_overrides (id, scheduled_id, original_date, new_date, date, amount, payee, account_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [ov.id, ov.scheduled_id, ov.original_date, ov.new_date, ov.date, ov.amount, ov.payee, ov.account_id]
    );
  }

  // 4. Seed Historical Transactions across past 60 days for rich multi-month charts, splits, and tax deductions
  const transactions = [
    // Current 30-day window — Income
    { id: 1, account_id: 1, category_id: 1, date: formatOffset(-10), payee: 'Acme Technologies Payroll', amount: 3450.00, memo: 'Direct Deposit #8841', status: 'reconciled' },
    { id: 2, account_id: 1, category_id: 1, date: formatOffset(-24), payee: 'Acme Technologies Payroll', amount: 3450.00, memo: 'Direct Deposit #8819', status: 'reconciled' },
    { id: 3, account_id: 1, category_id: 2, date: formatOffset(-14), payee: 'FinTech Consulting LLC', amount: 1450.00, memo: 'Q3 Architecture Audit Invoice #104 (1099-NEC)', status: 'cleared' },
    { id: 4, account_id: 2, category_id: 3, date: formatOffset(-5), payee: 'High-Yield APY Interest Dividend', amount: 112.45, memo: '4.75% APY Monthly Yield', status: 'reconciled' },

    // Current 30-day window — Fixed Housing, Auto & Utilities
    { id: 5, account_id: 1, category_id: 4, date: formatOffset(-19), payee: 'Metropolitan Luxury Apartments', amount: -1850.00, memo: 'Monthly Rent Payment', status: 'reconciled' },
    { id: 6, account_id: 1, category_id: 7, date: formatOffset(-21), payee: 'City Electric & Power', amount: -138.40, memo: 'Residential Electric Service', status: 'reconciled' },
    { id: 7, account_id: 1, category_id: 8, date: formatOffset(-16), payee: 'Gigabit Fiber Internet', amount: -89.99, memo: '1Gbps Business/Home Office Fiber [Tax Deductible]', status: 'cleared' },
    { id: 8, account_id: 1, category_id: 10, date: formatOffset(-12), payee: 'Equinox Fitness & Wellness', amount: -75.00, memo: 'Monthly Wellness Membership', status: 'cleared' },
    { id: 9, account_id: 1, category_id: 9, date: formatOffset(-20), payee: 'Honda Financial Auto Payment', amount: -290.00, memo: 'Auto Loan Principal & Interest', status: 'reconciled' },

    // Current 30-day window — Groceries & Split Superstore Trip
    { id: 10, account_id: 1, category_id: 5, date: formatOffset(-1), payee: 'Trader Joe’s #542', amount: -84.32, memo: 'Weekly organic grocery run', status: 'uncleared' },
    { id: 11, account_id: 3, category_id: 5, date: formatOffset(-6), payee: 'Costco Wholesale #118', amount: -245.50, memo: 'Split: Groceries, Home Office Supplies & Pharmacy', status: 'cleared' },
    { id: 12, account_id: 1, category_id: 5, date: formatOffset(-15), payee: 'Whole Foods Market', amount: -132.45, memo: 'Produce, meat & essentials', status: 'cleared' },
    { id: 13, account_id: 1, category_id: 5, date: formatOffset(-22), payee: 'Safeway Marketplace', amount: -112.10, memo: 'Weekly pantry restock', status: 'reconciled' },

    // Current 30-day window — Dining Out & Cafes
    { id: 14, account_id: 3, category_id: 6, date: formatOffset(-2), payee: 'Blue Bottle Coffee', amount: -16.50, memo: 'Pour-over coffee & almond croissant', status: 'uncleared' },
    { id: 15, account_id: 3, category_id: 6, date: formatOffset(-4), payee: 'Osteria Del Corso', amount: -148.80, memo: 'Client Advisory Dinner with Sarah & Dave [Tax Deductible]', status: 'cleared' },
    { id: 16, account_id: 3, category_id: 6, date: formatOffset(-9), payee: 'Sweetgreen Salad Co.', amount: -21.40, memo: 'Harvest bowl lunch', status: 'cleared' },
    { id: 17, account_id: 3, category_id: 6, date: formatOffset(-18), payee: 'Sushi Tomo Omakase', amount: -95.00, memo: 'Anniversary celebration dinner', status: 'reconciled' },

    // Current 30-day window — Transportation, Tech & Transfers
    { id: 18, account_id: 3, category_id: 9, date: formatOffset(-3), payee: 'Chevron Station #409', amount: -52.30, memo: 'Unleaded fuel refill', status: 'uncleared' },
    { id: 19, account_id: 3, category_id: 9, date: formatOffset(-11), payee: 'Uber Technologies', amount: -34.90, memo: 'Airport transfer for client summit [Tax Deductible]', status: 'cleared' },
    { id: 20, account_id: 3, category_id: 12, date: formatOffset(-7), payee: 'Apple Store Downtown', amount: -219.00, memo: 'Thunderbolt 4 Pro Dock & MagSafe Charger [Tax Deductible]', status: 'cleared' },
    { id: 21, account_id: 3, category_id: 11, date: formatOffset(-25), payee: 'Steam Games Store', amount: -49.99, memo: 'Weekend strategy bundle', status: 'reconciled' },
    { id: 22, account_id: 1, category_id: 13, date: formatOffset(-15), payee: 'Transfer to High-Yield Sanctuary Savings', amount: -600.00, memo: 'Automated emergency fund contribution', status: 'reconciled' },
    { id: 23, account_id: 2, category_id: 13, date: formatOffset(-15), payee: 'Transfer from Premier Checking', amount: 600.00, memo: 'Automated emergency fund contribution', status: 'reconciled' },

    // Previous Month (31–60 days ago) — For multi-month Income vs Expense & Net Worth charts
    { id: 24, account_id: 1, category_id: 1, date: formatOffset(-38), payee: 'Acme Technologies Payroll', amount: 3450.00, memo: 'Direct Deposit #8790', status: 'reconciled' },
    { id: 25, account_id: 1, category_id: 1, date: formatOffset(-52), payee: 'Acme Technologies Payroll', amount: 3450.00, memo: 'Direct Deposit #8762', status: 'reconciled' },
    { id: 26, account_id: 1, category_id: 2, date: formatOffset(-42), payee: 'FinTech Consulting LLC', amount: 950.00, memo: 'Monthly Advisory Retainer Invoice #103', status: 'reconciled' },
    { id: 27, account_id: 1, category_id: 4, date: formatOffset(-49), payee: 'Metropolitan Luxury Apartments', amount: -1850.00, memo: 'Prior Month Rent Payment', status: 'reconciled' },
    { id: 28, account_id: 1, category_id: 5, date: formatOffset(-35), payee: 'Whole Foods Market', amount: -395.20, memo: 'Monthly grocery & household stock-up', status: 'reconciled' },
    { id: 29, account_id: 3, category_id: 6, date: formatOffset(-41), payee: 'Bistro L’Hermitage', amount: -185.00, memo: 'Dining & hospitality', status: 'reconciled' },
    { id: 30, account_id: 1, category_id: 7, date: formatOffset(-50), payee: 'City Electric & Power', amount: -142.10, memo: 'Prior Month Electric Service', status: 'reconciled' },
  ];

  for (const tx of transactions) {
    await db.execute(
      'INSERT INTO transactions (id, account_id, category_id, date, payee, amount, memo, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [tx.id, tx.account_id, tx.category_id, tx.date, tx.payee, tx.amount, tx.memo, tx.status]
    );
  }

  // 5. Seed Split Transactions (Costco multi-category split + Apple Store business/personal split)
  const splits = [
    { id: 1, transaction_id: 11, category_id: 5, amount: -145.50, memo: 'Organic groceries & bulk pantry' },
    { id: 2, transaction_id: 11, category_id: 12, amount: -65.00, memo: 'Ergonomic desk mat & paper supplies' },
    { id: 3, transaction_id: 11, category_id: 10, amount: -35.00, memo: 'Vitamins & pharmacy items' },
    { id: 4, transaction_id: 20, category_id: 12, amount: -169.00, memo: 'Thunderbolt 4 Pro Dock (100% Home Office Deduction)' },
    { id: 5, transaction_id: 20, category_id: 14, amount: -50.00, memo: 'Personal MagSafe travel cable' },
  ];

  for (const sp of splits) {
    await db.execute(
      'INSERT INTO transaction_splits (id, transaction_id, category_id, amount, memo) VALUES (?, ?, ?, ?, ?)',
      [sp.id, sp.transaction_id, sp.category_id, sp.amount, sp.memo]
    );
  }

  // 6. Seed 3 Visual SVG Receipt Attachments so Receipt Vault & Tax Reports work out-of-the-box
  const receipt1 = createDemoReceiptDataUri(
    'APPLE STORE DOWNTOWN',
    formatOffset(-7),
    '$219.00',
    [
      { label: '1x Thunderbolt 4 Pro Dock', price: '$169.00' },
      { label: '1x MagSafe Braided Cable', price: '$50.00' },
      { label: 'Sales Tax (Included)', price: '$0.00' },
    ],
    'TAX DEDUCTIBLE WORKSPACE EQUIPMENT • PAID VISA *4829'
  );
  const receipt2 = createDemoReceiptDataUri(
    'OSTERIA DEL CORSO',
    formatOffset(-4),
    '$148.80',
    [
      { label: '3x Prix Fixe Business Dinner', price: '$124.00' },
      { label: 'Sparkling Mineral Water & Espresso', price: '$24.80' },
    ],
    'CLIENT ADVISORY DINNER (SARAH & DAVE) • RETAIN FOR CPA'
  );
  const receipt3 = createDemoReceiptDataUri(
    'FINTECH CONSULTING LLC',
    formatOffset(-14),
    '$1,450.00',
    [
      { label: 'Q3 Security & Cash Flow Audit', price: '$1,200.00' },
      { label: 'Executive Board Readout Session', price: '$250.00' },
    ],
    'PAID IN FULL • WIRE / ACH DEPOSIT TO PREMIER CHECKING'
  );

  const demoAttachments = [
    {
      id: 1,
      transaction_id: 20,
      file_name: 'Apple_Store_Thunderbolt_Dock_Receipt.svg',
      file_type: 'image/svg+xml',
      file_size: receipt1.size,
      data_base64: receipt1.uri,
      created_at: new Date().toISOString(),
    },
    {
      id: 2,
      transaction_id: 15,
      file_name: 'Osteria_Client_Dinner_Receipt.svg',
      file_type: 'image/svg+xml',
      file_size: receipt2.size,
      data_base64: receipt2.uri,
      created_at: new Date().toISOString(),
    },
    {
      id: 3,
      transaction_id: 3,
      file_name: 'FinTech_Consulting_Invoice_104.svg',
      file_type: 'image/svg+xml',
      file_size: receipt3.size,
      data_base64: receipt3.uri,
      created_at: new Date().toISOString(),
    },
  ];

  for (const att of demoAttachments) {
    await db.execute(
      'INSERT INTO transaction_attachments (id, transaction_id, file_name, file_type, file_size, data_base64, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [att.id, att.transaction_id, att.file_name, att.file_type, att.file_size, att.data_base64, att.created_at]
    );
  }

  // 7. Seed Smart Auto-Categorization Rules & Debt Payoff / What-If Demo Presets
  try {
    await db.execute('DELETE FROM transaction_rules');
    const demoRules = [
      { id: 1, name: 'Trader Joe’s & Whole Foods → Groceries', match_field: 'payee', match_type: 'contains', match_value: 'Trader Joe', category_id: 5 },
      { id: 2, name: 'Coffee & Cafes → Dining', match_field: 'payee', match_type: 'contains', match_value: 'Blue Bottle', category_id: 6 },
      { id: 3, name: 'Chevron & Uber → Transportation', match_field: 'payee', match_type: 'contains', match_value: 'Chevron', category_id: 9 },
      { id: 4, name: 'Payroll Direct Deposit → Salary', match_field: 'payee', match_type: 'contains', match_value: 'Payroll', category_id: 1 },
      { id: 5, name: 'Gigabit Fiber → Internet & Mobile', match_field: 'payee', match_type: 'contains', match_value: 'Gigabit Fiber', category_id: 8 },
    ];
    for (const r of demoRules) {
      await db.execute(
        'INSERT INTO transaction_rules (id, name, match_field, match_type, match_value, category_id, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)',
        [r.id, r.name, r.match_field, r.match_type, r.match_value, r.category_id, new Date().toISOString()]
      );
    }
  } catch (e) {
    console.warn('Could not seed transaction_rules:', e);
  }

  try {
    const demoDebts = [
      { id: 'acc-3', name: 'Sapphire Preferred Rewards', balance: 4200, interestRate: 22.49, minPayment: 115, isCustom: false },
      { id: 'acc-5', name: 'Honda Civic Touring Loan', balance: 11450, interestRate: 5.9, minPayment: 290, isCustom: false },
      { id: 'acc-6', name: 'Federal Direct Student Loan', balance: 8200, interestRate: 4.8, minPayment: 140, isCustom: false },
    ];
    localStorage.setItem('rmoney_debt_planner_debts', JSON.stringify(demoDebts));
    localStorage.setItem('rmoney_debt_extra_payment', '250');

    const demoScenarios = [
      {
        id: 'demo-sc-1',
        statementType: 'spend_date',
        payee: 'Summer European Family Trip',
        amount: 2400,
        date: formatOffset(45),
        frequency: 'once',
        accountId: 1,
      },
      {
        id: 'demo-sc-2',
        statementType: 'receive_date',
        payee: 'Salary Raise / Side-Project Retainer',
        amount: 450,
        date: formatOffset(15),
        frequency: 'monthly',
        accountId: 1,
      },
    ];
    localStorage.setItem('rmoney_demo_scenarios', JSON.stringify(demoScenarios));
  } catch (e) {
    console.warn('Could not seed localStorage demo presets:', e);
  }

  try {
    await db.execute('PRAGMA foreign_keys = ON');
  } catch (e) {
    console.warn('Could not re-enable foreign keys:', e);
  }

  return {
    success: true,
    message: `Showcase Demo Profile loaded (${accounts.length} accounts, ${transactions.length} transactions, splits, 3 receipts, ${scheduled.length} recurring bills & forecast overrides)!`,
  };
}

export async function resetToCleanSlate(initialAccount?: {
  name: string;
  type: string;
  balance: number;
  currency?: string;
}): Promise<{ success: boolean; message: string }> {
  const db = await getDb();

  try {
    await db.execute('PRAGMA foreign_keys = OFF');
  } catch (e) {
    console.warn('Could not disable foreign keys:', e);
  }

  // Clear existing data
  await db.execute('DELETE FROM transaction_splits');
  await db.execute('DELETE FROM transaction_attachments');
  await db.execute('DELETE FROM transactions');
  await db.execute('DELETE FROM scheduled_transaction_overrides');
  await db.execute('DELETE FROM scheduled_transactions');
  await db.execute('DELETE FROM accounts');
  await db.execute('DELETE FROM categories');

  // Reset SQLite auto-increment counters
  try {
    await db.execute(
      "DELETE FROM sqlite_sequence WHERE name IN ('transactions', 'scheduled_transaction_overrides', 'scheduled_transactions', 'accounts', 'categories')"
    );
  } catch (e) {
    // sqlite_sequence might not exist
  }

  // Seed default categories
  for (const cat of DEFAULT_CATEGORIES) {
    await db.execute('INSERT INTO categories (id, name, type, monthly_budget) VALUES (?, ?, ?, ?)', [
      cat.id,
      cat.name,
      cat.type,
      cat.monthly_budget || 0,
    ]);
  }

  // If initial account provided, create it
  if (initialAccount && initialAccount.name.trim()) {
    const balance = Number(initialAccount.balance) || 0;
    const currency = initialAccount.currency || 'USD';
    const type = initialAccount.type || 'Checking';

    const accRes = await db.execute(
      'INSERT INTO accounts (name, type, balance, currency, is_favorite) VALUES (?, ?, ?, ?, 1)',
      [initialAccount.name.trim(), type, balance, currency]
    );

    // If starting balance is not 0, insert opening balance transaction
    if (balance !== 0) {
      const today = getLocalTodayStr(0);
      const isIncome = balance > 0;
      const catId = isIncome ? 1 : 14; // 1 = Salary, 14 = General
      await db.execute(
        'INSERT INTO transactions (account_id, category_id, date, payee, amount, memo, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          accRes.lastInsertId,
          catId,
          today,
          'Opening Balance',
          balance,
          'Initial starting balance',
          'cleared',
        ]
      );
    }
  }

  try {
    await db.execute('PRAGMA foreign_keys = ON');
  } catch (e) {
    console.warn('Could not re-enable foreign keys:', e);
  }

  return {
    success: true,
    message: initialAccount?.name
      ? `Clean slate ready with initial account "${initialAccount.name}"!`
      : 'Clean slate ready! All data cleared with default categories intact.',
  };
}

