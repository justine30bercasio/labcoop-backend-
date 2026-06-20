ALTER TABLE transactions ADD COLUMN balance_before REAL DEFAULT 0;
ALTER TABLE transactions ADD COLUMN balance_after REAL DEFAULT 0;
ALTER TABLE transactions ADD COLUMN reference_type TEXT;
ALTER TABLE transactions ADD COLUMN reference_id TEXT;

CREATE TABLE IF NOT EXISTS loan_products (
    product_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    interest_rate REAL NOT NULL,
    interest_type TEXT NOT NULL DEFAULT 'flat' CHECK(interest_type IN ('flat','diminishing')),
    min_amount REAL NOT NULL DEFAULT 100,
    max_amount REAL NOT NULL DEFAULT 10000,
    min_term INTEGER NOT NULL DEFAULT 1,
    max_term INTEGER NOT NULL DEFAULT 12,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS savings_products (
    product_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    interest_rate REAL NOT NULL DEFAULT 0,
    interest_frequency TEXT NOT NULL DEFAULT 'monthly' CHECK(interest_frequency IN ('daily','monthly','yearly')),
    min_balance REAL NOT NULL DEFAULT 0,
    withdrawal_limit REAL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS loans (
    loan_id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
    product_id TEXT REFERENCES loan_products(product_id),
    principal REAL NOT NULL,
    interest_rate REAL NOT NULL,
    interest_type TEXT NOT NULL DEFAULT 'flat',
    term_months INTEGER NOT NULL,
    monthly_amortization REAL NOT NULL,
    total_payable REAL NOT NULL,
    amount_paid REAL NOT NULL DEFAULT 0,
    remaining_balance REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','active','paid','defaulted','rejected')),
    approved_by TEXT,
    approved_at TEXT,
    disbursed_at TEXT,
    purpose TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS loan_payments (
    payment_id TEXT PRIMARY KEY,
    loan_id TEXT NOT NULL REFERENCES loans(loan_id) ON DELETE CASCADE,
    amount REAL NOT NULL,
    principal_paid REAL NOT NULL,
    interest_paid REAL NOT NULL,
    balance_before REAL NOT NULL,
    balance_after REAL NOT NULL,
    due_date TEXT,
    paid_at TEXT DEFAULT (datetime('now')),
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_loans_account ON loans(account_id);
CREATE INDEX IF NOT EXISTS idx_loans_status ON loans(status);
CREATE INDEX IF NOT EXISTS idx_loan_payments_loan ON loan_payments(loan_id);
CREATE INDEX IF NOT EXISTS idx_transactions_ref ON transactions(reference_type, reference_id);

INSERT OR IGNORE INTO loan_products (product_id, name, description, interest_rate, interest_type, min_amount, max_amount, min_term, max_term)
VALUES
  ('lp_edu', 'EduLoan', 'Education loan for school supplies and projects', 0.05, 'flat', 100, 5000, 1, 6),
  ('lp_emergency', 'Emergency Loan', 'Quick loan for unexpected needs', 0.03, 'diminishing', 50, 2000, 1, 3),
  ('lp_growth', 'Growth Loan', 'Loan for starting a small business like lemonade stand', 0.04, 'flat', 200, 10000, 3, 12);

INSERT OR IGNORE INTO savings_products (product_id, name, description, interest_rate, interest_frequency, min_balance, withdrawal_limit)
VALUES
  ('sp_regular', 'Regular Savings', 'Everyday savings with monthly interest', 0.02, 'monthly', 0, NULL),
  ('sp_time', 'Time Deposit', 'Higher interest for locked savings', 0.06, 'yearly', 500, 0),
  ('sp_goal', 'Goal Saver', 'Savings with bonus interest on goal completion', 0.03, 'monthly', 100, NULL);
