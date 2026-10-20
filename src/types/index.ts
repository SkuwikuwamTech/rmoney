export type Account = {
  id: number;
  name: string;
  type: string;
  balance: number;
  currency: string;
  is_favorite: boolean;
};

export type Category = {
  id: number;
  name: string;
  type: 'income' | 'expense';
  parent_id?: number;
  monthly_budget?: number;
};

export type CategoryBudgetProgress = {
  category_id: number;
  category_name: string;
  category_type: 'income' | 'expense';
  monthly_budget: number;
  spent: number;
  remaining: number;
  percentage: number;
  is_over_budget: boolean;
};

export type TransactionSplit = {
  id?: number;
  transaction_id?: number;
  category_id: number;
  category_name?: string;
  amount: number;
  memo?: string;
};

export type TransactionAttachment = {
  id?: number;
  transaction_id: number;
  file_name: string;
  file_type: string;
  file_size: number;
  data_base64: string;
  created_at: string;
};

export type TransactionRule = {
  id?: number;
  name: string;
  match_field: 'payee' | 'memo';
  match_type: 'contains' | 'exact' | 'starts_with';
  match_value: string;
  category_id: number;
  category_name?: string;
  is_active: boolean | number;
  created_at?: string;
};

export type Transaction = {
  id: number;
  account_id: number;
  category_id: number;
  date: string;
  payee: string;
  amount: number;
  memo?: string;
  status?: 'uncleared' | 'cleared' | 'reconciled';
  account_name?: string;
  category_name?: string;
  split_count?: number;
  splits?: TransactionSplit[];
  attachment_count?: number;
  attachments?: TransactionAttachment[];
};

export type ScheduledTransaction = {
  id: number;
  account_id: number;
  category_id: number;
  amount: number;
  frequency: 'once' | 'daily' | 'weekly' | 'bi-weekly' | 'monthly' | 'yearly';
  next_date: string;
  payee: string;
  type: 'income' | 'expense' | 'transfer';
  to_account_id?: number; // Used for transfers
  account_name?: string;
  category_name?: string;
  to_account_name?: string;
  is_instance_overridden?: boolean;
  effective_amount?: number;
  effective_payee?: string;
  effective_date?: string;
  original_date?: string;
};

export type ScheduledTransactionOverride = {
  id?: number;
  scheduled_id: number;
  original_date?: string;
  date?: string;
  new_date?: string;
  amount?: number;
  payee?: string;
  account_id?: number;
};


