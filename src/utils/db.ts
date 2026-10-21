import Database from "@tauri-apps/plugin-sql";
import { DEFAULT_CATEGORIES } from './demoData';

export async function getDb() {
  return await Database.load("sqlite:rmoney.db");
}

export async function initDb() {
  const db = await getDb();

  await db.execute(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT CHECK(type IN ('income', 'expense')) NOT NULL,
      parent_id INTEGER,
      monthly_budget REAL DEFAULT 0,
      FOREIGN KEY (parent_id) REFERENCES categories(id)
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      balance REAL NOT NULL,
      currency TEXT NOT NULL,
      is_favorite BOOLEAN DEFAULT 0
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      payee TEXT NOT NULL,
      amount REAL NOT NULL,
      memo TEXT,
      FOREIGN KEY (account_id) REFERENCES accounts(id),
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS scheduled_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      frequency TEXT NOT NULL,
      next_date TEXT NOT NULL,
      payee TEXT,
      type TEXT,
      to_account_id INTEGER,
      FOREIGN KEY (account_id) REFERENCES accounts(id),
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS scheduled_transaction_overrides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scheduled_id INTEGER NOT NULL,
      original_date TEXT,
      new_date TEXT,
      amount REAL,
      payee TEXT,
      account_id INTEGER,
      date TEXT,
      FOREIGN KEY (scheduled_id) REFERENCES scheduled_transactions(id) ON DELETE CASCADE
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS transaction_splits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      memo TEXT,
      FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS local_backups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      label TEXT NOT NULL,
      account_count INTEGER NOT NULL,
      transaction_count INTEGER NOT NULL,
      data_json TEXT NOT NULL
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS transaction_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      file_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      data_base64 TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS transaction_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      match_field TEXT NOT NULL DEFAULT 'payee',
      match_type TEXT NOT NULL DEFAULT 'contains',
      match_value TEXT NOT NULL,
      category_id INTEGER NOT NULL,
      is_active BOOLEAN DEFAULT 1,
      created_at TEXT NOT NULL,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );
  `);

  // Migrations for existing DBs
  try { await db.execute("ALTER TABLE transactions ADD COLUMN status TEXT DEFAULT 'cleared'"); } catch (e) {}
  try { await db.execute('ALTER TABLE scheduled_transactions ADD COLUMN payee TEXT'); } catch (e) {}
  try { await db.execute('ALTER TABLE scheduled_transactions ADD COLUMN type TEXT'); } catch (e) {}
  try { await db.execute('ALTER TABLE scheduled_transactions ADD COLUMN to_account_id INTEGER'); } catch (e) {}
  try { await db.execute('ALTER TABLE scheduled_transaction_overrides ADD COLUMN original_date TEXT'); } catch (e) {}
  try { await db.execute('ALTER TABLE scheduled_transaction_overrides ADD COLUMN new_date TEXT'); } catch (e) {}
  try { await db.execute('UPDATE scheduled_transaction_overrides SET original_date = date WHERE original_date IS NULL'); } catch (e) {}
  try { await db.execute('ALTER TABLE categories ADD COLUMN monthly_budget REAL DEFAULT 0'); } catch (e) {}
  // Normalize scheduled transaction amounts to positive magnitudes (direction is determined by `type`)
  try { await db.execute('UPDATE scheduled_transactions SET amount = ABS(amount) WHERE amount < 0'); } catch (e) {}
  try { await db.execute('UPDATE scheduled_transaction_overrides SET amount = ABS(amount) WHERE amount < 0'); } catch (e) {}

  // Ensure default categories exist if categories table is empty
  try {
    const existingCats = (await db.select('SELECT id FROM categories LIMIT 1')) as any[];
    if (existingCats.length === 0) {
      for (const cat of DEFAULT_CATEGORIES) {
        await db.execute('INSERT INTO categories (id, name, type, monthly_budget) VALUES (?, ?, ?, ?)', [
          cat.id,
          cat.name,
          cat.type,
          cat.monthly_budget || 0,
        ]);
      }
    }
  } catch (e) {
    console.warn('Error checking/seeding default categories:', e);
  }

  return db;
}
