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

  // 2. Seed Accounts with realistic starter balances
  // We'll calculate balances based on transactions below
  const accounts = [
    { id: 1, name: 'Premier Checking', type: 'Checking', balance: 4850.25, currency: 'USD', is_favorite: 1 },
    { id: 2, name: 'High-Yield Savings', type: 'Savings', balance: 24500.00, currency: 'USD', is_favorite: 1 },
    { id: 3, name: 'Sapphire Preferred Rewards', type: 'Credit Card', balance: -824.60, currency: 'USD', is_favorite: 1 },
    { id: 4, name: 'Vanguard Brokerage Index', type: 'Investment', balance: 58240.75, currency: 'USD', is_favorite: 0 },
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

  // 3. Seed Scheduled Transactions (Bills & Recurring Income)
  const scheduled = [
    {
      id: 1,
      account_id: 1,
      category_id: 1,
      amount: 3250.00,
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
      amount: 1650.00,
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
      account_id: 1,
      category_id: 11,
      amount: 19.99,
      frequency: 'monthly',
      next_date: formatOffset(2),
      payee: 'Netflix & Spotify Premium',
      type: 'expense',
      to_account_id: null,
    },
    {
      id: 6,
      account_id: 1,
      category_id: 13,
      amount: 500.00,
      frequency: 'monthly',
      next_date: formatOffset(15),
      payee: 'Monthly Emergency Fund Savings',
      type: 'transfer',
      to_account_id: 2,
    },
    {
      id: 7,
      account_id: 1,
      category_id: 10,
      amount: 65.00,
      frequency: 'monthly',
      next_date: formatOffset(18),
      payee: 'Equinox Fitness Club',
      type: 'expense',
      to_account_id: null,
    },
    {
      id: 8,
      account_id: 3,
      category_id: 9,
      amount: 120.00,
      frequency: 'monthly',
      next_date: formatOffset(9),
      payee: 'Metro Transit Pass',
      type: 'expense',
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

  // 4. Seed Historical Transactions across past 30 days
  const transactions = [
    // Income
    { account_id: 1, category_id: 1, date: formatOffset(-10), payee: 'Acme Technologies Payroll', amount: 3250.00, memo: 'Direct Deposit' },
    { account_id: 1, category_id: 1, date: formatOffset(-24), payee: 'Acme Technologies Payroll', amount: 3250.00, memo: 'Direct Deposit' },
    { account_id: 1, category_id: 2, date: formatOffset(-14), payee: 'FinTech Consulting LLC', amount: 1200.00, memo: 'Q3 Advisory Invoice #104' },
    { account_id: 2, category_id: 3, date: formatOffset(-5), payee: 'High-Yield Interest Payment', amount: 98.45, memo: 'Monthly APY Interest' },

    // Rent & Utilities
    { account_id: 1, category_id: 4, date: formatOffset(-19), payee: 'Metropolitan Luxury Apartments', amount: -1650.00, memo: 'October Monthly Rent' },
    { account_id: 1, category_id: 7, date: formatOffset(-21), payee: 'City Electric & Power', amount: -138.40, memo: 'Electric bill' },
    { account_id: 1, category_id: 8, date: formatOffset(-16), payee: 'Gigabit Fiber Internet', amount: -89.99, memo: '1Gbps Residential' },
    { account_id: 1, category_id: 10, date: formatOffset(-12), payee: 'Equinox Fitness Club', amount: -65.00, memo: 'Monthly membership' },

    // Groceries & Food
    { account_id: 1, category_id: 5, date: formatOffset(-1), payee: 'Trader Joe’s #542', amount: -78.32, memo: 'Weekly grocery run' },
    { account_id: 1, category_id: 5, date: formatOffset(-8), payee: 'Whole Foods Market', amount: -124.80, memo: 'Groceries and produce' },
    { account_id: 1, category_id: 5, date: formatOffset(-15), payee: 'Trader Joe’s #542', amount: -89.45, memo: 'Produce & essentials' },
    { account_id: 1, category_id: 5, date: formatOffset(-22), payee: 'Safeway Food Store', amount: -112.10, memo: 'Pantry items' },

    // Dining Out & Cafes
    { account_id: 3, category_id: 6, date: formatOffset(-2), payee: 'Blue Bottle Coffee', amount: -14.50, memo: 'Espresso & pastry' },
    { account_id: 3, category_id: 6, date: formatOffset(-4), payee: 'Osteria Del Corso', amount: -142.80, memo: 'Dinner with Sarah & Dave' },
    { account_id: 3, category_id: 6, date: formatOffset(-9), payee: 'Sweetgreen Salad Co.', amount: -21.40, memo: 'Lunch' },
    { account_id: 3, category_id: 6, date: formatOffset(-13), payee: 'Chipotle Mexican Grill', amount: -16.25, memo: 'Dinner' },
    { account_id: 3, category_id: 6, date: formatOffset(-18), payee: 'Sushi Tomo Omakase', amount: -95.00, memo: 'Celebration dinner' },

    // Transportation & Gas
    { account_id: 3, category_id: 9, date: formatOffset(-3), payee: 'Chevron Gas Station', amount: -54.30, memo: 'Fuel refill' },
    { account_id: 3, category_id: 9, date: formatOffset(-11), payee: 'Uber Technologies', amount: -28.90, memo: 'Ride home from airport' },
    { account_id: 3, category_id: 9, date: formatOffset(-17), payee: 'Chevron Gas Station', amount: -49.75, memo: 'Fuel' },

    // Shopping & Tech
    { account_id: 3, category_id: 12, date: formatOffset(-6), payee: 'Amazon.com Marketplace', amount: -64.99, memo: 'USB-C dock & cables' },
    { account_id: 3, category_id: 12, date: formatOffset(-20), payee: 'Apple Store Downtown', amount: -129.00, memo: 'MagSafe Battery Pack' },
    { account_id: 3, category_id: 11, date: formatOffset(-27), payee: 'Steam Games Store', amount: -49.99, memo: 'Weekend game sale' },

    // Transfers & Savings
    { account_id: 1, category_id: 13, date: formatOffset(-15), payee: 'Transfer to High-Yield Savings', amount: -500.00, memo: 'Emergency fund contribution', status: 'reconciled' },
    { account_id: 2, category_id: 13, date: formatOffset(-15), payee: 'Transfer from Premier Checking', amount: 500.00, memo: 'Emergency fund contribution', status: 'reconciled' },
  ];

  for (const tx of transactions) {
    const status = (tx as any).status || (Math.random() > 0.35 ? 'cleared' : 'uncleared');
    await db.execute(
      'INSERT INTO transactions (account_id, category_id, date, payee, amount, memo, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [tx.account_id, tx.category_id, tx.date, tx.payee, tx.amount, tx.memo, status]
    );
  }

  try {
    await db.execute('PRAGMA foreign_keys = ON');
  } catch (e) {
    console.warn('Could not re-enable foreign keys:', e);
  }

  return {
    success: true,
    message: `Demo dataset generated successfully (${accounts.length} accounts, ${transactions.length} transactions, ${scheduled.length} bills)!`,
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

