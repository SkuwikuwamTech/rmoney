# rMoney — Offline-First Personal Finance & Cash Flow Forecasting

**rMoney** is a privacy-focused, local-first personal finance application built with **Tauri v2**, **React 19**, **TypeScript**, **Tailwind CSS v4**, and **SQLite** (`@tauri-apps/plugin-sql`).

## Core Features

- **Multi-Account Ledger**: Track checking, savings, credit card, cash, loan, and investment accounts with running balance trajectories and statement reconciliation (`Uncleared` / `Cleared` / `Reconciled`).
- **Split Transactions & Receipt Attachments**: Split single transactions across multiple budget categories and attach receipts or PDF invoices.
- **Monthly Budget Planner**: Category-level monthly budget targets, pacing indicators, and drill-down transaction audits.
- **Recurring Bills & Single-Instance Overrides**: Schedule recurring income, bills, and transfers (daily, weekly, bi-weekly, monthly, yearly) with support for rescheduling or adjusting individual upcoming occurrences without altering the recurring series.
- **Cash Flow Forecasting & What-If Simulator**: Project daily account balances up to 365 days ahead and model hypothetical one-time or recurring scenarios.
- **Debt Payoff & Loan Amortization Planner**: Compare **Debt Snowball** vs. **Debt Avalanche** strategies side-by-side with month-by-month amortization schedules and CSV export.
- **Smart Auto-Categorization Rules**: Keyword matching (`contains`, `exact`, `starts_with`) on payee or memo fields with batch re-evaluation.
- **Executive Financial Statements**: Print-ready grayscale reports and PDF exports covering Cash Flow Overview, Budget Variance, Net Worth, Income Statement (P&L), and Tax Deductions.
- **Hybrid Device Sync & Encrypted Vaults**: Local Wi-Fi QR pairing, automated cloud-folder sync (`.rmsync`), rolling local backups, and PBKDF2 + AES-GCM-256 encrypted `.rmvault` exports/imports.

## Development

```bash
# Install frontend dependencies
npm install

# Run Vite frontend in development mode
npm run dev

# Run full Tauri desktop app in development mode
npm run tauri dev

# Build production frontend & Tauri bundles
npm run build
npm run tauri build
```
