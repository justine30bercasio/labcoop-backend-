ALTER TABLE accounts ADD COLUMN savings_product_id TEXT REFERENCES savings_products(product_id);
ALTER TABLE accounts ADD COLUMN interest_earned REAL NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS withdrawal_requests (
    request_id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
    amount REAL NOT NULL,
    reason TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','paid')),
    admin_notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS standing_orders (
    order_id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'transfer' CHECK(type IN ('transfer','deposit')),
    target_goal_id TEXT,
    amount REAL NOT NULL,
    frequency TEXT NOT NULL CHECK(frequency IN ('daily','weekly','monthly')),
    next_run TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    description TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS savings_applications (
    application_id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES savings_products(product_id),
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
    admin_notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_account ON withdrawal_requests(account_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_status ON withdrawal_requests(status);
CREATE INDEX IF NOT EXISTS idx_standing_orders_account ON standing_orders(account_id);
CREATE INDEX IF NOT EXISTS idx_standing_orders_next_run ON standing_orders(next_run);
CREATE INDEX IF NOT EXISTS idx_savings_applications_account ON savings_applications(account_id);
