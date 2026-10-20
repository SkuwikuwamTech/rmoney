import { getDb } from './db';
import { TransactionRule } from '../types';

let isDeduplicating = false;
let isSeeding = false;

/**
 * Cleans up duplicate rules and corrects preset categories that were mistakenly set to 'General'.
 */
export async function deduplicateAndFixRules(): Promise<void> {
  if (isDeduplicating) return;
  isDeduplicating = true;
  try {
    const db = await getDb();

    // 1. Delete duplicate rules keeping only the lowest ID for each (match_field, match_value)
    await db.execute(`
      DELETE FROM transaction_rules
      WHERE id NOT IN (
        SELECT MIN(id)
        FROM transaction_rules
        GROUP BY match_field, LOWER(TRIM(match_value))
      )
    `);

    // 2. Fix categories for standard preset rules if they were defaulted to 'General'
    const cats = (await db.select('SELECT id, name FROM categories')) as { id: number; name: string }[];
    const findCatId = (...terms: string[]): number | null => {
      for (const term of terms) {
        const found = cats.find((c) => c.name.toLowerCase().includes(term.toLowerCase()));
        if (found) return found.id;
      }
      return null;
    };

    const targetCategories: { [keyword: string]: number | null } = {
      amazon: findCatId('Shopping & Electronics', 'Shopping'),
      starbucks: findCatId('Dining & Restaurants', 'Dining', 'Food'),
      walmart: findCatId('Groceries & Markets', 'Groceries'),
      target: findCatId('Shopping & Electronics', 'Shopping'),
      shell: findCatId('Transportation & Fuel', 'Transportation', 'Auto'),
      exxon: findCatId('Transportation & Fuel', 'Transportation', 'Auto'),
      netflix: findCatId('Entertainment & Streaming', 'Entertainment'),
      spotify: findCatId('Entertainment & Streaming', 'Entertainment'),
      uber: findCatId('Transportation & Fuel', 'Transportation', 'Auto'),
    };

    for (const [kw, catId] of Object.entries(targetCategories)) {
      if (catId) {
        await db.execute(
          `UPDATE transaction_rules 
           SET category_id = ? 
           WHERE LOWER(TRIM(match_value)) = ?`,
          [catId, kw]
        );
      }
    }
  } catch (e) {
    console.warn('Error deduplicating rules:', e);
  } finally {
    isDeduplicating = false;
  }
}

/**
 * Loads all transaction rules ordered by id ASC.
 */
export async function getTransactionRules(): Promise<TransactionRule[]> {
  try {
    await deduplicateAndFixRules();
    const db = await getDb();
    const rows = (await db.select(`
      SELECT 
        tr.id,
        tr.name,
        tr.match_field,
        tr.match_type,
        tr.match_value,
        tr.category_id,
        c.name as category_name,
        tr.is_active,
        tr.created_at
      FROM transaction_rules tr
      LEFT JOIN categories c ON tr.category_id = c.id
      ORDER BY tr.id ASC
    `)) as any[];

    return rows.map((r) => ({
      ...r,
      is_active: Boolean(r.is_active),
    }));
  } catch (e) {
    console.error('Error fetching transaction rules:', e);
    return [];
  }
}

/**
 * Creates a new transaction rule.
 */
export async function createTransactionRule(rule: Omit<TransactionRule, 'id' | 'created_at'>): Promise<number | null> {
  try {
    const db = await getDb();
    const res = await db.execute(
      `INSERT INTO transaction_rules (name, match_field, match_type, match_value, category_id, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        rule.name.trim(),
        rule.match_field,
        rule.match_type,
        rule.match_value.trim(),
        rule.category_id,
        rule.is_active ? 1 : 0,
        new Date().toISOString(),
      ]
    );
    return res.lastInsertId || null;
  } catch (e) {
    console.error('Error creating transaction rule:', e);
    return null;
  }
}

/**
 * Deletes a transaction rule.
 */
export async function deleteTransactionRule(id: number): Promise<boolean> {
  try {
    const db = await getDb();
    await db.execute('DELETE FROM transaction_rules WHERE id = ?', [id]);
    return true;
  } catch (e) {
    console.error('Error deleting transaction rule:', e);
    return false;
  }
}

/**
 * Toggles a rule's active status.
 */
export async function toggleRuleActive(id: number, isActive: boolean): Promise<boolean> {
  try {
    const db = await getDb();
    await db.execute('UPDATE transaction_rules SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, id]);
    return true;
  } catch (e) {
    console.error('Error toggling rule active:', e);
    return false;
  }
}

/**
 * Tests a single transaction against active rules.
 * Returns the matching category ID, or null if no rule matched.
 */
export function matchRuleForTransaction(
  payee: string = '',
  memo: string = '',
  rules: TransactionRule[]
): number | null {
  const normPayee = payee.toLowerCase().trim();
  const normMemo = memo.toLowerCase().trim();

  for (const rule of rules) {
    if (!rule.is_active) continue;

    const targetText = rule.match_field === 'memo' ? normMemo : normPayee;
    const ruleVal = rule.match_value.toLowerCase().trim();

    if (!ruleVal || !targetText) continue;

    let matched = false;
    switch (rule.match_type) {
      case 'contains':
        matched = targetText.includes(ruleVal);
        break;
      case 'exact':
        matched = targetText === ruleVal;
        break;
      case 'starts_with':
        matched = targetText.startsWith(ruleVal);
        break;
      default:
        matched = targetText.includes(ruleVal);
    }

    if (matched) {
      return rule.category_id;
    }
  }

  return null;
}

/**
 * Batch re-evaluates rules against existing transactions.
 * Optionally restrict to only transactions currently in the 'General' or default category.
 */
export async function runRulesOnExistingTransactions(
  onlyUncategorized: boolean = false
): Promise<{ processed: number; updated: number }> {
  const db = await getDb();
  const rules = await getTransactionRules();
  const activeRules = rules.filter((r) => r.is_active);

  if (activeRules.length === 0) {
    return { processed: 0, updated: 0 };
  }

  const query = onlyUncategorized
    ? `SELECT t.id, t.payee, t.memo, t.category_id, c.name as category_name
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       WHERE c.name = 'General' OR c.name IS NULL`
    : `SELECT id, payee, memo, category_id FROM transactions`;

  const txs = (await db.select(query)) as { id: number; payee: string; memo: string; category_id: number }[];
  let updatedCount = 0;

  for (const tx of txs) {
    const matchedCatId = matchRuleForTransaction(tx.payee, tx.memo, activeRules);
    if (matchedCatId !== null && matchedCatId !== tx.category_id) {
      await db.execute('UPDATE transactions SET category_id = ? WHERE id = ?', [matchedCatId, tx.id]);
      updatedCount++;
    }
  }

  return { processed: txs.length, updated: updatedCount };
}

/**
 * Seeds default practical rules if table is empty.
 */
export async function seedDefaultRulesIfEmpty(): Promise<void> {
  if (isSeeding) return;
  isSeeding = true;
  try {
    const db = await getDb();

    // Check if table already has rules
    const countResult = (await db.select('SELECT COUNT(*) as count FROM transaction_rules')) as { count: number }[];
    if ((countResult[0]?.count || 0) > 0) {
      await deduplicateAndFixRules();
      return;
    }

    const cats = (await db.select('SELECT id, name FROM categories')) as { id: number; name: string }[];
    const findCatId = (...terms: string[]): number => {
      for (const term of terms) {
        const found = cats.find((c) => c.name.toLowerCase().includes(term.toLowerCase()));
        if (found) return found.id;
      }
      return cats[0]?.id || 1;
    };

    const defaultPresets = [
      { name: 'Amazon Shopping', field: 'payee', type: 'contains', val: 'amazon', catId: findCatId('Shopping & Electronics', 'Shopping') },
      { name: 'Starbucks Coffee', field: 'payee', type: 'contains', val: 'starbucks', catId: findCatId('Dining & Restaurants', 'Dining', 'Food') },
      { name: 'Grocery Store / Walmart', field: 'payee', type: 'contains', val: 'walmart', catId: findCatId('Groceries & Markets', 'Groceries') },
      { name: 'Target Household', field: 'payee', type: 'contains', val: 'target', catId: findCatId('Shopping & Electronics', 'Shopping') },
      { name: 'Gas & Fuel (Shell)', field: 'payee', type: 'contains', val: 'shell', catId: findCatId('Transportation & Fuel', 'Transportation') },
      { name: 'Gas & Fuel (Exxon)', field: 'payee', type: 'contains', val: 'exxon', catId: findCatId('Transportation & Fuel', 'Transportation') },
      { name: 'Netflix Subscription', field: 'payee', type: 'contains', val: 'netflix', catId: findCatId('Entertainment & Streaming', 'Entertainment') },
      { name: 'Spotify Music', field: 'payee', type: 'contains', val: 'spotify', catId: findCatId('Entertainment & Streaming', 'Entertainment') },
      { name: 'Uber / Rideshare', field: 'payee', type: 'contains', val: 'uber', catId: findCatId('Transportation & Fuel', 'Transportation') },
    ];

    for (const preset of defaultPresets) {
      const existing = (await db.select(
        'SELECT COUNT(*) as count FROM transaction_rules WHERE LOWER(TRIM(match_value)) = ?',
        [preset.val.toLowerCase().trim()]
      )) as { count: number }[];

      if ((existing[0]?.count || 0) === 0) {
        await createTransactionRule({
          name: preset.name,
          match_field: preset.field as any,
          match_type: preset.type as any,
          match_value: preset.val,
          category_id: preset.catId,
          is_active: true,
        });
      }
    }

    await deduplicateAndFixRules();
  } catch (e) {
    console.warn('Could not seed default transaction rules:', e);
  } finally {
    isSeeding = false;
  }
}
