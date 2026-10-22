# rMoney: Ready-to-Execute Marketing Launch & Submission Kit

All website assets, SEO comparison pages, the free web calculator, and the in-app **Showcase Demo Profile** are now built and wired up. Use this checklist and copy-paste kit to execute each channel in minutes.

---

## Step 1: Deploy Your Updated Website (`website/`)

Your `website/` directory now includes:
- `website/rmoney.html` — Flagship landing page with the **Live 365-Day "What-If" Simulator**, **Debt Snowball vs. Avalanche Slider**, and **Free Forever ($0) vs. Pro ($29 Lifetime)** breakdown.
- `website/pricing.html` — Pricing cards + full **Free vs. Pro Capability Matrix**.
- `website/ynab-alternative.html` — High-intent SEO comparison page targeting YNAB switchers.
- `website/quicken-alternative.html` — High-intent SEO comparison page targeting Quicken & Microsoft Money users.
- `website/debt-payoff-calculator.html` — Standalone **Free Debt Snowball vs. Avalanche Web Calculator** with lead-magnet CTAs to download rMoney.
- `website/assets/rmoney-showcase-demo.json` — Downloadable Showcase Demo Profile.
- `website/sitemap.xml` & `website/robots.txt` — Search engine indexing files.

---

## Step 2: Copy-Paste GitHub "Awesome List" Pull Requests (30 Mins Total)

Open each repository below on GitHub, click the pencil icon (`Edit this file`) on `README.md`, paste the exact line under the specified section, and open a Pull Request:

### 1. `tauri-apps/awesome-tauri`
* **URL:** `https://github.com/tauri-apps/awesome-tauri`
* **Section:** `Applications -> Finance` (or `Productivity`)
* **Line to Paste:**
```markdown
- [rMoney](https://github.com/SkuwikuwamTech/rmoney) - Offline-first personal finance, 365-day "What-If" cash flow simulator, Debt Snowball/Avalanche planner, and receipt vault built with Tauri v2, React 19, and SQLite. ([Website](https://skuwikuwamtech.com/rmoney.html))
```

### 2. `awesome-selfhosted/awesome-selfhosted` or `iptoux/awesome-personal-finance`
* **Section:** `Personal Finance / Budgeting`
* **Line to Paste:**
```markdown
- [rMoney](https://skuwikuwamtech.com/rmoney.html) - Local-first desktop & mobile personal finance app with 365-day cash flow forecasting, single-instance bill overrides, Debt Snowball/Avalanche amortization, and AES-GCM-256 encrypted vaults. ([Source/Releases](https://github.com/SkuwikuwamTech/rmoney))
```

### 3. `pluja/awesome-privacy` / Local-First Lists
* **Section:** `Finance / Budgeting`
* **Line to Paste:**
```markdown
- [rMoney](https://skuwikuwamtech.com/rmoney.html) - 100% offline SQLite personal finance and cash flow forecaster with PBKDF2 + AES-GCM-256 `.rmvault` encryption and local Wi-Fi QR device sync. No cloud account or Plaid login required.
```

---

## Step 3: AlternativeTo Submission (15 Mins)

Submit at `https://alternativeto.net/software/add/`:

- **Application Name:** `rMoney`
- **Official Website:** `https://skuwikuwamtech.com/rmoney.html`
- **Download Page:** `https://skuwikuwamtech.com/pricing.html#downloads`
- **License Model:** `Freemium` (Free Forever Edition + $29 One-Time Lifetime Pro)
- **Platforms:** `Windows`, `Mac`, `Linux`, `Android`
- **Suggest as Alternative To:** `YNAB (You Need A Budget)`, `Quicken`, `Microsoft Money`, `Monarch Money`, `Actual Budget`, `GnuCash`, `HomeBank`
- **Short Description (Copy-Paste):**
  > rMoney is a 100% offline-first personal finance and 365-day cash flow forecasting app built with Tauri v2 and local SQLite. Features live monthly budget pacing, a Microsoft Money-inspired "What-If" life decision simulator, Debt Snowball vs. Avalanche payoff planner, receipt vault, and QIF/CSV import. Free Forever for up to 2 accounts, or $29 once for a lifetime Pro license.

---

## Step 4: Hacker News (`Show HN`) Launch Copy

Submit at `https://news.ycombinator.com/submit` (Best time: **Tuesday or Wednesday at 8:30 AM EST**):

- **Title:**
  `Show HN: rMoney – Offline-first personal finance and 365-day cash flow simulator (Tauri/SQLite)`
- **URL:**
  `https://skuwikuwamtech.com/rmoney.html`
- **First Comment (Post immediately after submitting):**
  > Hi HN, I built rMoney because I wanted a fast, local-first desktop app for personal finance that doesn't require handing over bank credentials to Plaid/cloud aggregators or paying a $109/yr subscription just to budget my own money.
  >
  > I also really missed Microsoft Money's old "Play What-If" cash flow forecaster, where you could project your daily checking account balance a year ahead and test how a hypothetical purchase or bill override would impact your lowest cash reserve.
  >
  > **What's under the hood:**
  > - **Stack:** Tauri v2, React 19, TypeScript, and local SQLite.
  > - **365-Day Cash Flow & "What-If" Simulator:** Projects daily balances 365 days out from your recurring schedule, supports single-instance overrides (rescheduling or adjusting one upcoming bill without breaking the recurring series), and lets you toggle hypothetical scenarios. You can try a live browser preview of the simulator right on the page: https://skuwikuwamtech.com/rmoney.html#interactive-demo
  > - **Full Accounting Ergonomics:** Statement reconciliation (`Uncleared`/`Cleared`/`Reconciled`), split transactions, zoomable receipt/invoice attachments, keyword auto-categorization rules, QIF/CSV migration, and a side-by-side Debt Snowball vs. Avalanche amortization planner (also available as a free standalone web calculator: https://skuwikuwamtech.com/debt-payoff-calculator.html).
  > - **Zero-Cloud Sync & Encryption:** Local Wi-Fi QR pairing between desktop and Android, cloud-folder `.rmsync` drops, and PBKDF2 + AES-GCM-256 `.rmvault` encrypted backups.
  > - **Free Forever vs. Pro:** The Free Edition ($0 forever, no account or credit card) includes up to 2 accounts, full reconciliation, split transactions, monthly budget pacing, recurring bills, and the 365-day baseline forecast. The Pro Edition ($29 one-time lifetime license) unlocks unlimited accounts, the interactive What-If sandbox, full CPA tax/P&L PDF exports, and encrypted multi-device sync. Every copy also includes a 1-click "Showcase Demo Profile" so you can explore with realistic sample data immediately.
  >
  > I'd love your feedback on the cash flow forecasting workflow, local sync approach, or anything you feel is missing!

---

## Step 5: Subreddit Launch Posts

### 1. `r/YNAB` / `r/Budget` / `r/personalfinance`
**Title:** I built an offline-first desktop finance app with a 365-Day "What-If" Cash Flow Simulator & Debt Snowball/Avalanche planner (Free Edition + $29 one-time lifetime Pro)

**Body:**
One thing that always frustrated me about monthly budgeting apps is that you can be "under budget" for the month and still dip below your checking account safety buffer on the 14th because of bill timing—and paying $109/year forever just to track your own money stings.

I built **rMoney** ([https://skuwikuwamtech.com/rmoney.html](https://skuwikuwamtech.com/rmoney.html)), a native offline desktop & Android finance app that combines monthly budget pacing with forward-looking cash flow simulation:

* **What You Get Free Forever ($0, No Cloud Account):**
  * Up to 2 accounts with full statement reconciliation (`Uncleared` / `Cleared` / `Reconciled`) & split transactions
  * Live Monthly Budget Planner with daily pacing gauges
  * Recurring Bills Scheduler with **Single-Instance Overrides** (move or change one upcoming bill without altering future months)
  * 365-Day Baseline Cash Flow Curve + Cash Flow Overview PDF report
  * 1-Click QIF & CSV statement import + a built-in **Showcase Demo Profile** so you can test everything with sample data first.
* **What Upgrading to Pro Unlocks ($29 One-Time Lifetime — No Subscriptions):**
  * Unlimited Checking, Savings, Credit Card, Loan, and Investment accounts
  * Interactive **"What-If" Life Decision Simulator** (test a car payment, vacation, or raise against your 365-day cash curve)
  * Side-by-side **Debt Snowball vs. Avalanche Planner** with CSV amortization export
  * Unlimited Receipt Vault + Executive P&L, Net Worth, Budget Variance & CPA Tax Deduction PDFs
  * AES-GCM-256 encrypted `.rmvault` backups & Local Wi-Fi QR device sync

You can also play with the free browser-based Debt Snowball vs. Avalanche calculator here with zero signups: [https://skuwikuwamtech.com/debt-payoff-calculator.html](https://skuwikuwamtech.com/debt-payoff-calculator.html)

Would love to hear your feedback!
