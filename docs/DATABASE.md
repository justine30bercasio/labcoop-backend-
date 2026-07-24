# LabCoop — Database Schema

> **Database**: PostgreSQL 15 (production on Aiven) / SQLite 3.x (development)
> **Schema auto-created** on startup via `PgStore._ensureSchema()` or `SqliteStore`.

---

## Table of Contents

1. [Entity-Relationship Overview](#entity-relationship-overview)
2. [Core Tables](#1-core-tables)
3. [Savings & Banking Tables](#2-savings--banking-tables)
4. [Lending Tables](#3-lending-tables)
5. [Accounting Tables](#4-accounting-tables)
6. [Admin & Security Tables](#5-admin--security-tables)
7. [Gamification Tables](#6-gamification-tables)
8. [Parent Portal Tables](#7-parent-portal-tables)
9. [Indexes](#8-indexes)
10. [Chart of Accounts](#9-chart-of-accounts)
11. [Migration History](#10-migration-history)

---

## Entity-Relationship Overview

```
accounts ──┬── goal_jars
           ├── badges
           ├── transactions
           ├── loans ──┬── loan_payments
           │           ├── loan_collateral
           │           └── loan_guarantors
           ├── standing_orders
           ├── withdrawal_requests
           ├── online_deposits
           ├── fcm_tokens
           ├── refresh_tokens
           ├── coin_transactions
           ├── daily_spins
           ├── term_deposits
           ├── share_capital
           ├── credit_scores
           ├── checkbooks
           └── support_messages

parents ──┬── parent_child_links ──── accounts
          ├── parent_limits
          ├── parent_notifications
          ├── parent_fcm_tokens
          └── support_messages

gl_accounts ──── gl_entries ──── transactions

admin_users ──── audit_log

shop_items (standalone)
quiz_questions (standalone)
coop_goals ──── coop_contributions
board_members (standalone)
```

---

## 1. Core Tables

### `accounts`

The primary user/child account table. Stores all member information and balances.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `account_id` | TEXT PK | UUID | Primary identifier |
| `child_name` | VARCHAR(255) | required | Display name |
| `member_id` | VARCHAR(20) | — | Cooperative member number |
| `password` | VARCHAR(255) | '' | bcrypt password hash |
| `pin_hash` | VARCHAR(255) | '' | bcrypt PIN hash (6 digits) |
| `password_changed` | INTEGER | 0 | Whether temp password was changed |
| `actual_balance` | DECIMAL(12,2) | 0 | Total account balance |
| `unallocated_balance` | DECIMAL(12,2) | 0 | Balance not assigned to any goal |
| `current_xp` | INTEGER | 0 | Experience points |
| `coins` | INTEGER | 0 | Gamification coins |
| `parent_phone` | VARCHAR(20) | '' | Parent contact number |
| `parent_email` | VARCHAR(255) | '' | Parent email (for consent, OTP) |
| `consent_status` | VARCHAR(20) | 'none' | `none`, `pending`, `approved`, `rejected` |
| `interest_earned` | DECIMAL(12,2) | 0 | Lifetime interest earned |
| `savings_product_id` | TEXT | — | Linked savings product |
| `kyc_status` | TEXT | '' | KYC verification status |
| `profile_pic_url` | TEXT | '' | Profile photo URL (R2) |
| `is_active` | INTEGER | 1 | Soft delete flag |
| `failed_login_attempts` | INTEGER | 0 | Brute force counter |
| `locked_until` | TEXT | — | Lockout timestamp |
| `link_code` | VARCHAR(10) | — | Parent linking code |
| `link_code_expires_at` | TEXT | — | Linking code expiry |
| `maintaining_balance` | DECIMAL(12,2) | 0 | Minimum balance requirement |
| `total_shares` | INTEGER | 0 | Share capital shares |
| `share_capital_balance` | DECIMAL(12,2) | 0 | Share capital amount |
| `overdraft_limit` | DECIMAL(12,2) | 0 | Overdraft limit |
| `currency` | TEXT | 'PHP' | Account currency |
| `branch_id` | TEXT | — | Branch assignment |
| `last_name` | VARCHAR(100) | '' | Legal last name |
| `first_name` | VARCHAR(100) | '' | Legal first name |
| `birthday` | VARCHAR(10) | '' | Date of birth |
| `age` | INTEGER | 0 | Age |
| `gender` | VARCHAR(10) | '' | Gender |
| `address` | TEXT | '' | Address |
| `city` | TEXT | '' | City |
| `province` | TEXT | '' | Province |
| `postal_code` | TEXT | '' | ZIP code |
| `civil_status` | TEXT | '' | Civil status |
| `occupation` | TEXT | '' | Occupation |
| `employer` | TEXT | '' | Employer |
| `monthly_income` | DECIMAL(12,2) | 0 | Monthly income |
| `created_at` | TEXT | — | Creation timestamp |
| `updated_at` | TEXT | — | Last update timestamp |

### `goal_jars`

Personal savings goals for children.

| Column | Type | Description |
|--------|------|-------------|
| `goal_id` | TEXT PK | UUID |
| `account_id` | TEXT FK | References `accounts(account_id)` ON DELETE CASCADE |
| `title` | VARCHAR(255) | Goal title |
| `target_amount` | DECIMAL(12,2) | Target savings amount |
| `current_allocated` | DECIMAL(12,2) | Amount allocated so far |
| `category_icon` | VARCHAR(100) | Icon identifier (shoes, bike, toy, etc.) |
| `is_completed` | INTEGER | 0 = in progress, 1 = completed |
| `created_at` | TEXT | Creation timestamp |
| `updated_at` | TEXT | Last update timestamp |

### `transactions`

All financial transactions (deposits, withdrawals, interest, loan payments, etc.).

| Column | Type | Description |
|--------|------|-------------|
| `transaction_id` | TEXT PK | UUID |
| `trn_number` | INTEGER UNIQUE | Sequential transaction number |
| `account_id` | TEXT FK | References `accounts(account_id)` ON DELETE CASCADE |
| `goal_id` | TEXT FK | Optional linked goal |
| `type` | VARCHAR(50) | `deposit`, `withdrawal`, `interest`, `interest_credit`, `loan_disbursement`, `loan_payment`, `fee`, `allocation`, `deallocation`, `auto_save`, `void` |
| `amount` | DECIMAL(12,2) | Transaction amount |
| `balance_before` | DECIMAL(12,2) | Account balance before |
| `balance_after` | DECIMAL(12,2) | Account balance after |
| `description` | TEXT | Human-readable description |
| `reference_type` | VARCHAR(50) | Source reference (paymongo, interest, etc.) |
| `reference_id` | TEXT | External reference ID |
| `or_number` | TEXT | Official Receipt number |
| `voided_by` | TEXT | Admin who voided |
| `void_reason` | TEXT | Void reason |
| `voided_at` | TEXT | Void timestamp |
| `created_at` | TEXT | Transaction timestamp |

---

## 2. Savings & Banking Tables

### `savings_products`

| Column | Type | Description |
|--------|------|-------------|
| `product_id` | TEXT PK | e.g., `sp_regular` |
| `name` | VARCHAR(255) | Product name |
| `description` | TEXT | Product description |
| `interest_rate` | DECIMAL(5,2) | Annual interest rate (e.g., 2.00 = 2%) |
| `interest_frequency` | VARCHAR(20) | `daily`, `monthly`, `yearly` |
| `min_balance` | DECIMAL(12,2) | Minimum balance requirement |
| `withdrawal_limit` | DECIMAL(12,2) | Per-transaction withdrawal limit |
| `is_active` | INTEGER | 1 = active, 0 = disabled |
| `created_at` | TEXT | |

### `standing_orders`

Auto-save rules (recurring transfers to goals).

| Column | Type | Description |
|--------|------|-------------|
| `order_id` | TEXT PK | UUID |
| `account_id` | TEXT FK | Child account |
| `type` | VARCHAR(50) | Always `transfer` |
| `target_goal_id` | TEXT | Goal to transfer to |
| `amount` | DECIMAL(12,2) | Transfer amount |
| `frequency` | VARCHAR(20) | `daily`, `weekly`, `monthly` |
| `next_run` | TEXT | Next execution time |
| `is_active` | INTEGER | 1 = active |
| `description` | TEXT | Optional description |
| `created_at` | TEXT | |
| `updated_at` | TEXT | |

### `withdrawal_requests`

| Column | Type | Description |
|--------|------|-------------|
| `request_id` | TEXT PK | UUID |
| `account_id` | TEXT FK | Child account |
| `amount` | DECIMAL(12,2) | Withdrawal amount |
| `reason` | TEXT | Purpose of withdrawal |
| `status` | VARCHAR(20) | `pending`, `approved`, `rejected`, `paid` |
| `admin_notes` | TEXT | Admin notes |
| `created_at` | TEXT | |
| `resolved_at` | TEXT | |

### `online_deposits`

External payment deposits (GCash via PayMongo).

| Column | Type | Description |
|--------|------|-------------|
| `deposit_id` | TEXT PK | UUID |
| `account_id` | TEXT FK | Child account |
| `amount` | DECIMAL(12,2) | Deposit amount |
| `reference_number` | VARCHAR(255) | External reference |
| `sender_name` | VARCHAR(255) | Sender display name |
| `payment_method` | VARCHAR(50) | `gcash`, `paymongo_gcash` |
| `status` | VARCHAR(20) | `pending`, `paymongo_pending`, `approved`, `rejected` |
| `admin_notes` | TEXT | JSON with PayMongo session details |
| `created_at` | TEXT | |
| `resolved_at` | TEXT | |

### `term_deposits`

| Column | Type | Description |
|--------|------|-------------|
| `td_id` | TEXT PK | UUID |
| `account_id` | TEXT FK | Owner |
| `td_number` | TEXT UNIQUE | Term deposit certificate number |
| `amount` | DECIMAL(12,2) | Principal |
| `term_days` | INTEGER | Duration in days |
| `interest_rate` | DECIMAL(5,2) | Annual rate |
| `maturity_date` | TEXT | Maturity date |
| `status` | VARCHAR(20) | `active`, `matured`, `closed`, `renewed` |
| `renew_instruction` | TEXT | `mature` or `renew` |
| `auto_renew` | INTEGER | Auto-renew on maturity |
| `interest_earned` | DECIMAL(12,2) | Accumulated interest |
| `created_at` | TEXT | |
| `closed_at` | TEXT | |

### `share_capital`

| Column | Type | Description |
|--------|------|-------------|
| `share_id` | TEXT PK | UUID |
| `account_id` | TEXT FK | Member |
| `shares` | INTEGER | Number of shares |
| `share_value` | DECIMAL(12,2) | Per-share value |
| `total_amount` | DECIMAL(12,2) | Total amount |
| `transaction_type` | VARCHAR(20) | `subscription`, `dividend`, `refund` |
| `notes` | TEXT | Notes |
| `created_at` | TEXT | |

### `dividends`

| Column | Type | Description |
|--------|------|-------------|
| `dividend_id` | TEXT PK | UUID |
| `year` | INTEGER | Dividend year |
| `total_amount` | DECIMAL(12,2) | Total dividend pool |
| `rate` | DECIMAL(5,2) | Dividend rate (%) |
| `per_share` | DECIMAL(10,4) | Amount per share |
| `declared_date` | TEXT | Declaration date |
| `paid_date` | TEXT | Payment date |
| `status` | VARCHAR(20) | `declared`, `paid` |

---

## 3. Lending Tables

### `loan_products`

| Column | Type | Description |
|--------|------|-------------|
| `product_id` | TEXT PK | UUID |
| `name` | VARCHAR(255) | Product name |
| `description` | TEXT | Description |
| `interest_rate` | DECIMAL(5,2) | Annual interest rate |
| `interest_type` | VARCHAR(20) | `flat` or `diminishing` |
| `min_amount` | DECIMAL(12,2) | Minimum loan amount |
| `max_amount` | DECIMAL(12,2) | Maximum loan amount |
| `min_term` | INTEGER | Minimum term (months) |
| `max_term` | INTEGER | Maximum term (months) |
| `is_active` | INTEGER | Active flag |
| `created_at` | TEXT | |

### `loans`

| Column | Type | Description |
|--------|------|-------------|
| `loan_id` | TEXT PK | UUID |
| `account_id` | TEXT FK | Borrower |
| `product_id` | TEXT FK | Loan product |
| `principal` | DECIMAL(12,2) | Loan principal |
| `interest_rate` | DECIMAL(5,2) | Interest rate |
| `interest_type` | VARCHAR(20) | `flat` or `diminishing` |
| `term_months` | INTEGER | Loan term in months |
| `monthly_amortization` | DECIMAL(12,2) | Monthly payment |
| `total_payable` | DECIMAL(12,2) | Total amount to repay |
| `amount_paid` | DECIMAL(12,2) | Amount already paid |
| `remaining_balance` | DECIMAL(12,2) | Balance remaining |
| `status` | VARCHAR(20) | `pending`, `active`, `paid`, `restructured`, `defaulted` |
| `purpose` | TEXT | Loan purpose |
| `approved_by` | TEXT | Admin who approved |
| `approved_at` | TEXT | Approval date |
| `disbursed_at` | TEXT | Disbursement date |
| `due_date` | TEXT | Next due date |
| `asset_classification` | TEXT | `current`, `non_current` |
| `late_fee_accrued` | DECIMAL(12,2) | Accrued late fees |
| `last_late_fee_date` | TEXT | Last late fee assessment |
| `created_at` | TEXT | |
| `updated_at` | TEXT | |

### `loan_payments`

| Column | Type | Description |
|--------|------|-------------|
| `payment_id` | TEXT PK | UUID |
| `loan_id` | TEXT FK | Loan reference |
| `amount` | DECIMAL(12,2) | Payment amount |
| `principal_paid` | DECIMAL(12,2) | Principal portion |
| `interest_paid` | DECIMAL(12,2) | Interest portion |
| `balance_before` | DECIMAL(12,2) | Loan balance before |
| `balance_after` | DECIMAL(12,2) | Loan balance after |
| `due_date` | TEXT | Scheduled due date |
| `paid_at` | TEXT | Payment date |
| `created_at` | TEXT | |

### `loan_collateral`

| Column | Type | Description |
|--------|------|-------------|
| `collateral_id` | TEXT PK | UUID |
| `loan_id` | TEXT FK | Loan reference |
| `type` | TEXT | Collateral type |
| `description` | TEXT | Description |
| `estimated_value` | DECIMAL(12,2) | Estimated value |
| `appraised_value` | DECIMAL(12,2) | Appraised value |
| `document_url` | TEXT | Document URL |
| `is_released` | INTEGER | Release status |
| `created_at` | TEXT | |

### `loan_guarantors`

| Column | Type | Description |
|--------|------|-------------|
| `guarantor_id` | TEXT PK | UUID |
| `loan_id` | TEXT FK | Loan reference |
| `name` | TEXT | Guarantor name |
| `relationship` | TEXT | Relationship to borrower |
| `contact_number` | TEXT | Phone |
| `address` | TEXT | Address |
| `income` | DECIMAL(12,2) | Monthly income |
| `created_at` | TEXT | |

### `loan_restructuring`

| Column | Type | Description |
|--------|------|-------------|
| `restructure_id` | TEXT PK | UUID |
| `loan_id` | TEXT FK | Loan reference |
| `old_principal` | DECIMAL(12,2) | Previous principal |
| `new_principal` | DECIMAL(12,2) | New principal |
| `old_interest_rate` | DECIMAL(5,2) | Previous rate |
| `new_interest_rate` | DECIMAL(5,2) | New rate |
| `old_term_months` | INTEGER | Previous term |
| `new_term_months` | INTEGER | New term |
| `reason` | TEXT | Restructuring reason |
| `approved_by` | TEXT | Approving admin |
| `created_at` | TEXT | |

---

## 4. Accounting Tables

### `gl_accounts` (Chart of Accounts)

See [Section 9 — Chart of Accounts](#9-chart-of-accounts) for the full list.

| Column | Type | Description |
|--------|------|-------------|
| `code` | TEXT PK | Account code (e.g., `1000`, `2000`) |
| `name` | TEXT | Account name |
| `type` | TEXT | `asset`, `liability`, `equity`, `income`, `expense` |
| `category` | TEXT | `current_asset`, `non_current_asset`, `current_liability`, `non_current_liability`, `equity`, `operating_income`, `other_income`, `operating_expense`, `other_expense` |
| `is_contra` | INTEGER | 1 = contra account (e.g., Accumulated Depreciation) |
| `is_active` | INTEGER | 1 = active |

### `gl_entries`

Double-entry journal entries.

| Column | Type | Description |
|--------|------|-------------|
| `entry_id` | TEXT PK | UUID |
| `transaction_id` | TEXT | Optional link to transaction table |
| `account_code` | TEXT FK | GL account code |
| `debit` | DECIMAL(12,2) | Debit amount (>= 0) |
| `credit` | DECIMAL(12,2) | Credit amount (>= 0) |
| `description` | TEXT | Entry description |
| `posted_by` | TEXT | Who posted this entry |
| `approved_by` | TEXT | Who approved |
| `reference_type` | TEXT | `interest`, `dividend`, `loan_disbursement`, `loan_payment`, `deposit`, `withdrawal`, `fee`, `accrual`, `auto_save` |
| `reference_number` | TEXT | External reference number |
| `period_id` | TEXT | Accounting period (YYYY-MM) |
| `is_voided` | INTEGER | Void flag |
| `voided_by` | TEXT | Who voided |
| `void_reason` | TEXT | Void reason |
| `voided_at` | TEXT | Void timestamp |
| `created_at` | TEXT | Entry timestamp |

### `accounting_periods`

| Column | Type | Description |
|--------|------|-------------|
| `period_id` | TEXT PK | YYYY-MM format |
| `year` | INTEGER | Year |
| `month` | INTEGER | Month (1-12) |
| `is_closed` | INTEGER | 0 = open, 1 = closed |
| `closed_by` | TEXT | Admin who closed |
| `closed_at` | TEXT | Closure timestamp |

### `or_series`

Official Receipt number series.

| Column | Type | Description |
|--------|------|-------------|
| `series_id` | TEXT PK | UUID |
| `prefix` | TEXT | Prefix (e.g., `OR-`, `WT-`, `JV-`) |
| `current_number` | INTEGER | Next available number |
| `end_number` | INTEGER | Series end (null = unlimited) |
| `type` | TEXT | `deposit`, `withdrawal`, `collection` |

### `tax_config`

| Column | Type | Description |
|--------|------|-------------|
| `tax_id` | TEXT PK | UUID |
| `name` | TEXT | Tax name |
| `rate` | DECIMAL(5,2) | Tax rate % |
| `applies_to` | VARCHAR(20) | `interest`, `fee`, `dividend`, `all` |
| `is_active` | INTEGER | Active flag |
| `created_at` | TEXT | |

Seeded defaults:
- `tax_interest` — Interest Income Tax, 20%, applies to `interest`
- `tax_dividend` — Dividend Tax, 10%, applies to `dividend`

---

## 5. Admin & Security Tables

### `admin_users`

| Column | Type | Description |
|--------|------|-------------|
| `admin_id` | TEXT PK | UUID |
| `username` | TEXT UNIQUE | Login username |
| `password_hash` | TEXT | bcrypt password hash |
| `role` | TEXT | `super_admin`, `manager`, `teller`, `auditor` |
| `display_name` | TEXT | Display name |
| `email` | TEXT | Email (for notifications) |
| `branch_id` | TEXT | Branch assignment |
| `is_active` | INTEGER | Active flag |
| `created_at` | TEXT | |

### `audit_log`

| Column | Type | Description |
|--------|------|-------------|
| `log_id` | TEXT PK | UUID |
| `admin_id` | TEXT | Admin who performed action |
| `admin_name` | TEXT | Admin display name |
| `action` | TEXT | Action description |
| `entity_type` | TEXT | Affected entity type |
| `entity_id` | TEXT | Affected entity ID |
| `details` | TEXT | JSON details |
| `ip_address` | TEXT | Client IP |
| `created_at` | TEXT | Timestamp |

### `fcm_tokens`

| Column | Type | Description |
|--------|------|-------------|
| `token_id` | TEXT PK | UUID |
| `account_id` | TEXT FK | Child account |
| `fcm_token` | TEXT | Firebase Cloud Messaging token |
| `device_platform` | VARCHAR(20) | `android`, `ios` |
| `created_at` | TEXT | |
| `updated_at` | TEXT | |

### `refresh_tokens`

| Column | Type | Description |
|--------|------|-------------|
| `token_id` | TEXT PK | UUID |
| `account_id` | TEXT FK | Account reference |
| `token_hash` | TEXT | SHA-256 of refresh token |
| `expires_at` | TEXT | Expiry timestamp |
| `revoked` | INTEGER | Revocation flag |
| `created_at` | TEXT | |

### `settings`

Key-value store for system settings.

| Column | Type | Description |
|--------|------|-------------|
| `key` | TEXT PK | Setting key |
| `value` | TEXT | Setting value (JSON or plain) |

Common settings: `gcash_number`, `gcash_name`, `savings_interest_rate`, `default_maintaining_balance`, `scheduler_lock`, `last_accrual_run`, `budget_data`

---

## 6. Gamification Tables

### `badges`

| Column | Type | Description |
|--------|------|-------------|
| `badge_id` | TEXT PK | UUID |
| `account_id` | TEXT FK | Owner |
| `name` | VARCHAR(255) | Badge name |
| `description` | TEXT | Badge description |
| `icon_url` | VARCHAR(500) | Icon URL |
| `required_xp` | INTEGER | XP threshold |
| `is_unlocked` | INTEGER | Unlocked flag |
| `unlocked_at` | TEXT | Unlock date |
| `created_at` | TEXT | |

### `shop_items`

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | Item ID (e.g., `av_cat`, `b_gold`) |
| `name` | VARCHAR(255) | Item name |
| `type` | VARCHAR(50) | `avatar` or `border` |
| `cost` | DECIMAL(10,2) | Coin cost |
| `emoji` | VARCHAR(50) | Display emoji |
| `rarity` | VARCHAR(50) | `Common`, `Uncommon`, `Rare`, `Epic`, `Legendary`, `Mythic`, `Special` |
| `color1` | VARCHAR(20) | Primary color |
| `color2` | VARCHAR(20) | Secondary color |
| `image_url` | TEXT | Uploaded image URL |
| `is_active` | INTEGER | Active flag |
| `updated_at` | TEXT | |

### `quiz_questions`

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | Question ID (e.g., `q_e01`) |
| `question` | TEXT | Question text |
| `options` | TEXT | JSON array of options |
| `correct_index` | INTEGER | Index of correct answer (0-based) |
| `explanation` | TEXT | Explanation text |
| `category` | VARCHAR(100) | `Savings`, `Banking`, `Budgeting`, `Math`, `Investing` |
| `difficulty_level` | VARCHAR(20) | `easy`, `medium`, `hard`, `expert` |
| `xp_reward` | INTEGER | XP awarded for correct answer |
| `coin_reward` | INTEGER | Coins awarded |
| `is_active` | INTEGER | Active flag |
| `updated_at` | TEXT | |

80 questions seeded across 4 difficulty levels × 5 categories.

### `coop_goals`

| Column | Type | Description |
|--------|------|-------------|
| `goal_id` | TEXT PK | UUID |
| `title` | VARCHAR(255) | Goal title |
| `target_amount` | DECIMAL(12,2) | Target |
| `current_allocated` | DECIMAL(12,2) | Progress |
| `category_icon` | VARCHAR(50) | Icon emoji |
| `is_completed` | INTEGER | Completion flag |
| `created_by` | TEXT | Creator |
| `created_at` | TEXT | |
| `updated_at` | TEXT | |

### `coop_contributions`

| Column | Type | Description |
|--------|------|-------------|
| `contribution_id` | TEXT PK | UUID |
| `goal_id` | TEXT FK | Goal reference |
| `account_id` | TEXT FK | Contributor |
| `amount` | DECIMAL(12,2) | Contribution amount |
| `created_at` | TEXT | |

### `coin_transactions`

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | UUID |
| `account_id` | TEXT FK | Owner |
| `amount` | INTEGER | Coin amount (can be negative for spends) |
| `balance_before` | INTEGER | Balance before |
| `balance_after` | INTEGER | Balance after |
| `reason` | TEXT | Reason (e.g., `quiz_reward`, `spin_win`, `shop_purchase`) |
| `created_at` | TEXT | |

### `daily_spins`

| Column | Type | Description |
|--------|------|-------------|
| `account_id` | TEXT PK | Owner |
| `last_spin_date` | TEXT | Last spin date |
| `spin_count` | INTEGER | Total spins |

---

## 7. Parent Portal Tables

### `parents`

| Column | Type | Description |
|--------|------|-------------|
| `parent_id` | TEXT PK | UUID |
| `email` | TEXT UNIQUE | Login email |
| `password_hash` | TEXT | bcrypt password |
| `pin_hash` | TEXT | bcrypt PIN |
| `display_name` | TEXT | Display name |
| `phone` | TEXT | Phone number |
| `photo_url` | TEXT | Profile photo |
| `id_type` | TEXT | ID type for verification |
| `id_number` | TEXT | ID number |
| `id_photo_url` | TEXT | ID photo URL |
| `status` | TEXT | `pending`, `approved`, `rejected` |
| `address` | TEXT | Address |
| `city` | TEXT | City |
| `province` | TEXT | Province |
| `postal_code` | TEXT | ZIP |
| `created_at` | TEXT | |

### `parent_child_links`

| Column | Type | Description |
|--------|------|-------------|
| `link_id` | TEXT PK | UUID |
| `parent_id` | TEXT FK | Parent reference |
| `child_account_id` | TEXT FK | Child account reference |
| `linking_code` | TEXT | Code used to link |
| `status` | TEXT | `active`, `inactive` |
| `created_at` | TEXT | |

### `parent_limits`

| Column | Type | Description |
|--------|------|-------------|
| `limit_id` | TEXT PK | UUID |
| `parent_id` | TEXT FK | Parent reference |
| `child_account_id` | TEXT FK | Child account |
| `max_daily_withdrawal` | DECIMAL(12,2) | Daily withdrawal limit |
| `max_loan_amount` | DECIMAL(12,2) | Maximum loan amount |
| `require_approval_for` | TEXT | `all`, `withdrawal`, `loan`, `none` |

### `parental_consent`

| Column | Type | Description |
|--------|------|-------------|
| `consent_id` | TEXT PK | UUID |
| `account_id` | TEXT FK | Child account |
| `parent_phone` | TEXT | Parent phone |
| `parent_email` | TEXT | Parent email |
| `consent_token` | TEXT | Unique token for approval link |
| `status` | TEXT | `pending`, `approved`, `rejected` |
| `rejected_reason` | TEXT | Rejection reason |
| `ip_address` | TEXT | Request IP |
| `created_at` | TEXT | |
| `responded_at` | TEXT | |

### `account_deletion_requests`

| Column | Type | Description |
|--------|------|-------------|
| `request_id` | TEXT PK | UUID |
| `account_id` | TEXT FK | Child account |
| `requested_by` | TEXT | `parent` or `admin` |
| `reason` | TEXT | Deletion reason |
| `status` | TEXT | `pending`, `approved`, `rejected` |
| `admin_notes` | TEXT | Admin notes |
| `created_at` | TEXT | |
| `resolved_at` | TEXT | |

### `parent_notifications`

| Column | Type | Description |
|--------|------|-------------|
| `notif_id` | TEXT PK | UUID |
| `parent_id` | TEXT FK | Parent |
| `title` | TEXT | Notification title |
| `body` | TEXT | Notification body |
| `type` | TEXT | `info`, `alert`, `approval_required` |
| `is_read` | INTEGER | Read flag |
| `created_at` | TEXT | |

### `support_messages`

| Column | Type | Description |
|--------|------|-------------|
| `message_id` | TEXT PK | UUID |
| `account_id` | TEXT FK | Child account (nullable) |
| `parent_id` | TEXT FK | Parent (nullable) |
| `child_name` | TEXT | Child display name |
| `sender_type` | TEXT | `child`, `parent`, `admin` |
| `sender_name` | TEXT | Sender display name |
| `content` | TEXT | Message content |
| `admin_read` | INTEGER | Admin read flag |
| `child_read` | INTEGER | Child read flag |
| `parent_read` | INTEGER | Parent read flag |
| `created_at` | TEXT | |

---

## 8. Indexes

```sql
-- Transaction lookups
CREATE INDEX IF NOT EXISTS idx_transactions_account_created ON transactions(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);

-- GL reporting
CREATE INDEX IF NOT EXISTS idx_gl_entries_account_code ON gl_entries(account_code);
CREATE INDEX IF NOT EXISTS idx_gl_entries_created ON gl_entries(created_at);
CREATE INDEX IF NOT EXISTS idx_gl_entries_period ON gl_entries(period_id);

-- Loan management
CREATE INDEX IF NOT EXISTS idx_loans_account_id ON loans(account_id);
CREATE INDEX IF NOT EXISTS idx_loans_status ON loans(status);

-- Goals
CREATE INDEX IF NOT EXISTS idx_goal_jars_account_id ON goal_jars(account_id);

-- Badges
CREATE INDEX IF NOT EXISTS idx_badges_account_id ON badges(account_id);

-- Standing orders
CREATE INDEX IF NOT EXISTS idx_standing_orders_next_run ON standing_orders(next_run);

-- Token management
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_account ON refresh_tokens(account_id);

-- Coin transactions
CREATE INDEX IF NOT EXISTS idx_coin_tx_account ON coin_transactions(account_id);
```

---

## 9. Chart of Accounts

25 accounts in the BIR-compliant chart:

| Code | Name | Type | Category | Contra |
|------|------|------|----------|--------|
| **1000** | Cash on Hand | asset | current_asset | 0 |
| **1010** | Cash in Bank | asset | current_asset | 0 |
| **1020** | Petty Cash | asset | current_asset | 0 |
| **1100** | Loans Receivable | asset | current_asset | 0 |
| **1200** | Accrued Interest Receivable | asset | current_asset | 0 |
| **1300** | Prepaid Expenses | asset | current_asset | 0 |
| **1400** | Property & Equipment | asset | non_current_asset | 0 |
| **1401** | Accumulated Depreciation | asset | non_current_asset | **1** |
| **1500** | Accounts Receivable - Loans | asset | current_asset | 0 |
| **2000** | Savings Deposits | liability | current_liability | 0 |
| **2100** | Time Deposits | liability | current_liability | 0 |
| **2200** | Interest Payable | liability | current_liability | 0 |
| **2300** | Accounts Payable | liability | current_liability | 0 |
| **2400** | Income Tax Payable | liability | current_liability | 0 |
| **2500** | Accrued Expenses | liability | current_liability | 0 |
| **3000** | Share Capital | equity | equity | 0 |
| **3100** | Retained Earnings | equity | equity | 0 |
| **4000** | Interest Income | income | operating_income | 0 |
| **4100** | Fee Income | income | operating_income | 0 |
| **4200** | Insurance Income | income | operating_income | 0 |
| **4300** | Miscellaneous Income | income | other_income | 0 |
| **5000** | Interest Expense | expense | operating_expense | 0 |
| **5100** | Other Operating Expenses | expense | operating_expense | 0 |
| **5200** | Depreciation Expense | expense | operating_expense | 0 |
| **5300** | Tax Expense | expense | operating_expense | 0 |

### GL Entry Rules

- Every transaction must have debits = credits (balanced entry)
- Asset and expense accounts have normal debit balances
- Liability, equity, and income accounts have normal credit balances
- Contra accounts (is_contra=1) reverse the normal balance
- Period must be open before posting (period lock enforced in `gl.js`)

---

## 10. Migration History

The schema is maintained as a living document in `pg-store.js:_ensureSchema()`. All schema changes are additive via `ALTER TABLE ADD COLUMN IF NOT EXISTS`. Key migrations:

| Date | Change |
|------|--------|
| Initial | Core tables: accounts, transactions, goals, badges |
| — | Added KYC columns (photo_2x2, birth_cert, etc.) |
| — | Added pin_hash, parent_email, consent_status |
| — | Added profile_pic_url |
| — | Added gl_accounts, gl_entries, accounting_periods |
| — | Added or_series, tax_config |
| — | Added void columns to transactions and gl_entries |
| — | Added posted_by, approved_by, reference_type, reference_number, period_id to gl_entries |
| — | Added category, is_contra to gl_accounts |
| — | Added transactions.or_number |
| — | Added accounts.coins, refresh_tokens |
| — | Added audit columns to support_messages |
| — | Added daily_spins table |
| — | Added typing_status table |