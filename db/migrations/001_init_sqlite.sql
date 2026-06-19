CREATE TABLE IF NOT EXISTS accounts (
    account_id TEXT PRIMARY KEY,
    child_name TEXT NOT NULL,
    actual_balance REAL NOT NULL DEFAULT 0.00,
    unallocated_balance REAL NOT NULL DEFAULT 0.00,
    current_xp INTEGER NOT NULL DEFAULT 0,
    parent_phone TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS goal_jars (
    goal_id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    target_amount REAL NOT NULL,
    current_allocated REAL NOT NULL DEFAULT 0.00,
    category_icon TEXT NOT NULL DEFAULT 'savings',
    is_completed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS badges (
    badge_id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    icon_url TEXT,
    required_xp INTEGER NOT NULL,
    is_unlocked INTEGER NOT NULL DEFAULT 0,
    unlocked_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transactions (
    transaction_id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
    goal_id TEXT REFERENCES goal_jars(goal_id) ON DELETE SET NULL,
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    description TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_goal_jars_account ON goal_jars(account_id);
CREATE INDEX IF NOT EXISTS idx_badges_account ON badges(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at DESC);

CREATE TABLE IF NOT EXISTS shop_items (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('avatar', 'border')),
    cost INTEGER NOT NULL DEFAULT 0,
    emoji TEXT NOT NULL DEFAULT '',
    rarity TEXT NOT NULL DEFAULT 'Common',
    color1 TEXT NOT NULL DEFAULT '#2E7D32',
    color2 TEXT NOT NULL DEFAULT '#2E7D32',
    image_url TEXT NOT NULL DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS purchases (
    purchase_id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
    item_id TEXT NOT NULL REFERENCES shop_items(id) ON DELETE CASCADE,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_purchases_account ON purchases(account_id);
CREATE INDEX IF NOT EXISTS idx_shop_items_type ON shop_items(type);
