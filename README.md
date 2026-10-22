# rMoney — Offline-First Personal Finance & 365-Day Cash Flow Forecaster

[![Website](https://img.shields.io/badge/Website-skuwikuwamtech.com-4f46e5?style=flat-square)](https://skuwikuwamtech.com/rmoney.html)
[![Live Simulator](https://img.shields.io/badge/Try_Browser_Demo-365--Day_What--If_Simulator-10b981?style=flat-square)](https://skuwikuwamtech.com/rmoney.html#interactive-demo)
[![Free Debt Calculator](https://img.shields.io/badge/Free_Web_Tool-Snowball_vs_Avalanche-f59e0b?style=flat-square)](https://skuwikuwamtech.com/debt-payoff-calculator.html)
[![Download](https://img.shields.io/badge/Download-Windows_%7C_macOS_%7C_Linux_%7C_Android-6366f1?style=flat-square)](https://skuwikuwamtech.com/pricing.html#downloads)

**rMoney** is a fast, privacy-focused, local-first personal finance application built with **Tauri v2**, **React 19**, **TypeScript**, **Tailwind CSS v4**, and **SQLite** (`@tauri-apps/plugin-sql`).

Your financial ledger lives 100% on your device—no mandatory cloud accounts, no Plaid bank credential sharing, and no $109/year recurring subscription fees.

---

## Quick Links

- **Product Tour & Live 365-Day "What-If" Simulator:** [skuwikuwamtech.com/rmoney.html](https://skuwikuwamtech.com/rmoney.html#interactive-demo)
- **Download Installers (Windows, macOS, Linux, Android):** [skuwikuwamtech.com/pricing.html#downloads](https://skuwikuwamtech.com/pricing.html#downloads)
- **Free Browser Debt Snowball vs. Avalanche Calculator:** [skuwikuwamtech.com/debt-payoff-calculator.html](https://skuwikuwamtech.com/debt-payoff-calculator.html)
- **Comparisons:** [rMoney vs. YNAB](https://skuwikuwamtech.com/ynab-alternative.html) • [rMoney vs. Quicken & Microsoft Money](https://skuwikuwamtech.com/quicken-alternative.html)

---

## Core Features

- **Multi-Account Ledger & Checkbook Reconciliation**: Track checking, savings, credit card, cash, loan, and investment accounts with running balance trajectories and statement reconciliation (`Uncleared` / `Cleared` / `Reconciled`).
- **Split Transactions & Receipt Attachments**: Split single transactions across multiple budget categories and attach receipt images or PDF invoices directly to your local vault.
- **Monthly Budget Planner**: Category-level monthly budget targets, real-time daily pacing indicators, and 1-click drill-down transaction audits.
- **Recurring Bills & Single-Instance Overrides**: Schedule recurring income, bills, and transfers (`daily`, `weekly`, `bi-weekly`, `monthly`, `yearly`) with support for rescheduling or adjusting individual upcoming occurrences without altering the recurring series.
- **365-Day Cash Flow Forecasting & "What-If" Simulator**: Project daily account balances up to 365 days ahead and model hypothetical one-time or recurring life decisions (e.g., buying a vehicle, taking a trip, or a salary raise).
- **Debt Payoff & Loan Amortization Planner**: Compare **Debt Snowball** vs. **Debt Avalanche** strategies side-by-side with month-by-month amortization schedules and CSV export.
- **Smart Auto-Categorization Rules & QIF/CSV Migration**: Keyword matching (`contains`, `exact`, `starts_with`) on payee or memo fields, plus 1-click `.qif` and `.csv` import from Microsoft Money, Quicken, or bank statements.
- **Executive Financial Statements**: Print-ready grayscale reports and PDF exports covering Cash Flow Overview, Budget Variance, Net Worth, Income Statement (P&L), and CPA Tax Deductions.
- **Hybrid Device Sync & Encrypted Vaults**: Local Wi-Fi QR pairing, automated cloud-folder sync (`.rmsync`), rolling local backups, and PBKDF2 + AES-GCM-256 encrypted `.rmvault` exports/imports.

---

## Free Forever ($0) vs. Pro Lifetime ($29 Once)

| Capability | **rMoney Free Edition ($0 Forever)** | **rMoney Pro Edition ($29 One-Time Lifetime)** |
| :--- | :--- | :--- |
| **Connected Accounts** | Up to 2 Accounts | **Unlimited** (Checking, Savings, Cards, Loans, Investments) |
| **Reconciliation & Split Transactions** | ✓ Full Support | ✓ Full Support |
| **Live Monthly Budget Pacing** | ✓ Full Support | ✓ Full Support |
| **Recurring Bills & Single Overrides** | ✓ Full Support | ✓ Full Support |
| **365-Day Cash Flow Forecast** | Baseline 365-Day Curve | **Baseline + Interactive "What-If" Decision Simulator** |
| **Debt Snowball vs. Avalanche Planner** | Interactive Preview | **Full Portfolio Planner + CSV Amortization Export** |
| **Receipt & Invoice Vault** | Up to 3 Receipt Attachments | **Unlimited High-Res Receipt & PDF Vault** |
| **Executive PDF Reports** | Cash Flow Overview PDF | **Full Suite: Budget Variance, Net Worth, P&L & Tax PDFs** |
| **Security & Multi-Device Sync** | Local SQLite + PIN Lock + QIF/CSV Import | **AES-GCM-256 `.rmvault` Encryption + Wi-Fi QR & Cloud Sync** |

---

## Test-Drive with the Built-In Showcase Demo Profile

Every installation of rMoney includes a 1-click **Showcase Demo Profile** (available in the Welcome Wizard or under **Settings → Load Showcase Demo Profile**) that preloads:
- **6 Realistic Accounts** (Premier Checking, High-Yield Savings, Sapphire Rewards Card, Vanguard Index, Auto Loan, and Federal Student Loan)
- **30 Multi-Month Transactions** with split superstore/office expenses and `[Tax Deductible]` memos
- **3 Zoomable Vector Receipts** attached to transactions
- **10 Recurring Bills & 2 Single-Instance Forecast Overrides**
- **1-Click "What-If" Presets** inside the Cash Flow Simulator

---

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
