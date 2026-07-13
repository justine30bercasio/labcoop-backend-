CREATE TABLE IF NOT EXISTS accounts (
    account_id TEXT PRIMARY KEY,
    child_name VARCHAR(255) NOT NULL,
    member_id VARCHAR(20),
    password VARCHAR(255) DEFAULT '',
    password_changed INTEGER DEFAULT 0,
    actual_balance DECIMAL(12,2) DEFAULT 0,
    unallocated_balance DECIMAL(12,2) DEFAULT 0,
    current_xp INTEGER DEFAULT 0,
    parent_phone VARCHAR(20) DEFAULT '',
    interest_earned DECIMAL(12,2) DEFAULT 0,
    savings_product_id TEXT,
    last_name VARCHAR(100) DEFAULT '',
    first_name VARCHAR(100) DEFAULT '',
    middle_name VARCHAR(100) DEFAULT '',
    age INTEGER DEFAULT 0,
    birthday VARCHAR(10) DEFAULT '',
    gender VARCHAR(10) DEFAULT '',
    savings_schedule VARCHAR(50) DEFAULT '',
    photo_2x2_url TEXT DEFAULT '',
    birth_cert_url TEXT DEFAULT '',
    id_photo_url TEXT DEFAULT '',
    kyc_status TEXT DEFAULT '',
    selfie_url TEXT DEFAULT '',
    kyc_submitted_at TEXT DEFAULT '',
    kyc_verified_at TEXT DEFAULT '',
    kyc_rejected_reason TEXT DEFAULT '',
    is_active INTEGER DEFAULT 1,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    pin_hash VARCHAR(255) DEFAULT '',
    parent_email VARCHAR(255) DEFAULT '',
    consent_status VARCHAR(20) DEFAULT 'none',
    link_code VARCHAR(10) DEFAULT '',
    link_code_expires_at TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_accounts_member_id ON accounts(member_id);

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
    trn_number INTEGER UNIQUE,
    account_id TEXT NOT NULL,
    goal_id TEXT,
    type VARCHAR(50) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    balance_before DECIMAL(12,2),
    balance_after DECIMAL(12,2),
    description TEXT DEFAULT '',
    reference_type VARCHAR(50),
    reference_id TEXT,
    created_at TEXT
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

-- Additional tables needed by seed & runtime
CREATE TABLE IF NOT EXISTS quiz_questions (
    id TEXT PRIMARY KEY,
    question TEXT NOT NULL,
    options TEXT NOT NULL,
    correct_index INTEGER NOT NULL,
    explanation TEXT DEFAULT '',
    category VARCHAR(100) DEFAULT 'General',
    difficulty_level VARCHAR(20) DEFAULT 'easy',
    xp_reward INTEGER DEFAULT 10,
    coin_reward INTEGER DEFAULT 5,
    is_active INTEGER DEFAULT 1,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS savings_products (
    product_id TEXT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    interest_rate DECIMAL(5,2) DEFAULT 0,
    interest_frequency VARCHAR(20) DEFAULT 'monthly',
    min_balance DECIMAL(12,2) DEFAULT 0,
    withdrawal_limit DECIMAL(12,2),
    is_active INTEGER DEFAULT 1,
    created_at TEXT
);

CREATE TABLE IF NOT EXISTS loan_products (
    product_id TEXT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    interest_rate DECIMAL(5,2) NOT NULL,
    interest_type VARCHAR(20) DEFAULT 'flat',
    min_amount DECIMAL(12,2) DEFAULT 100,
    max_amount DECIMAL(12,2) DEFAULT 10000,
    min_term INTEGER DEFAULT 1,
    max_term INTEGER DEFAULT 12,
    is_active INTEGER DEFAULT 1,
    created_at TEXT
);

CREATE TABLE IF NOT EXISTS loans (
    loan_id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    product_id TEXT,
    principal DECIMAL(12,2) NOT NULL,
    interest_rate DECIMAL(5,2) NOT NULL,
    interest_type VARCHAR(20) DEFAULT 'flat',
    term_months INTEGER NOT NULL,
    monthly_amortization DECIMAL(12,2),
    total_payable DECIMAL(12,2),
    amount_paid DECIMAL(12,2) DEFAULT 0,
    remaining_balance DECIMAL(12,2),
    status VARCHAR(20) DEFAULT 'pending',
    purpose TEXT DEFAULT '',
    approved_by TEXT,
    approved_at TEXT,
    disbursed_at TEXT,
    created_at TEXT,
    updated_at TEXT,
    due_date TEXT
);

CREATE TABLE IF NOT EXISTS loan_payments (
    payment_id TEXT PRIMARY KEY,
    loan_id TEXT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    principal_paid DECIMAL(12,2),
    interest_paid DECIMAL(12,2),
    balance_before DECIMAL(12,2),
    balance_after DECIMAL(12,2),
    due_date TEXT,
    paid_at TEXT,
    created_at TEXT
);

CREATE TABLE IF NOT EXISTS withdrawal_requests (
    request_id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    reason TEXT DEFAULT '',
    status VARCHAR(20) DEFAULT 'pending',
    admin_notes TEXT DEFAULT '',
    created_at TEXT,
    resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS standing_orders (
    order_id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    type VARCHAR(50) DEFAULT 'transfer',
    target_goal_id TEXT,
    amount DECIMAL(12,2) NOT NULL,
    frequency VARCHAR(20) NOT NULL,
    next_run TEXT,
    is_active INTEGER DEFAULT 1,
    description TEXT DEFAULT '',
    created_at TEXT,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS coop_goals (
    goal_id TEXT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    target_amount DECIMAL(12,2) NOT NULL,
    current_allocated DECIMAL(12,2) DEFAULT 0,
    category_icon VARCHAR(50) DEFAULT '🎯',
    is_completed INTEGER DEFAULT 0,
    created_by TEXT DEFAULT '',
    created_at TEXT,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS coop_contributions (
    contribution_id TEXT PRIMARY KEY,
    goal_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    created_at TEXT
);

CREATE TABLE IF NOT EXISTS gl_accounts (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('asset','liability','equity','income','expense')),
    category TEXT DEFAULT '',
    is_contra INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS gl_entries (
    entry_id TEXT PRIMARY KEY,
    transaction_id TEXT,
    account_code TEXT NOT NULL REFERENCES gl_accounts(code),
    debit DECIMAL(12,2) DEFAULT 0,
    credit DECIMAL(12,2) DEFAULT 0,
    description TEXT DEFAULT '',
    posted_by TEXT,
    approved_by TEXT,
    reference_type TEXT,
    reference_number TEXT,
    period_id TEXT,
    created_at TEXT
);

CREATE TABLE IF NOT EXISTS accounting_periods (
    period_id TEXT PRIMARY KEY,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    is_closed INTEGER DEFAULT 0,
    closed_by TEXT,
    closed_at TEXT,
    UNIQUE(year, month)
);

CREATE TABLE IF NOT EXISTS or_series (
    series_id TEXT PRIMARY KEY,
    prefix TEXT NOT NULL,
    current_number INTEGER DEFAULT 1,
    end_number INTEGER,
    type TEXT NOT NULL CHECK(type IN ('deposit','withdrawal','collection'))
);

CREATE TABLE IF NOT EXISTS sequences (
    name TEXT NOT NULL,
    year INTEGER NOT NULL,
    value INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (name, year)
);

CREATE TABLE IF NOT EXISTS eod_logs (
    eod_id TEXT PRIMARY KEY,
    date TEXT NOT NULL UNIQUE,
    opening_cash DECIMAL(12,2) DEFAULT 0,
    total_collections DECIMAL(12,2) DEFAULT 0,
    total_disbursements DECIMAL(12,2) DEFAULT 0,
    closing_cash DECIMAL(12,2) DEFAULT 0,
    tx_count INTEGER DEFAULT 0,
    closed_by TEXT,
    notes TEXT DEFAULT '',
    created_at TEXT
);

CREATE TABLE IF NOT EXISTS eoy_logs (
    eoy_id TEXT PRIMARY KEY,
    year INTEGER NOT NULL UNIQUE,
    total_income DECIMAL(12,2) DEFAULT 0,
    total_expense DECIMAL(12,2) DEFAULT 0,
    net_profit DECIMAL(12,2) DEFAULT 0,
    tx_count INTEGER DEFAULT 0,
    archived INTEGER DEFAULT 0,
    closed_by TEXT,
    created_at TEXT
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS admin_users (
    admin_id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'admin' CHECK(role IN ('super_admin','manager','teller','auditor')),
    display_name TEXT DEFAULT '',
    email TEXT DEFAULT '',
    is_active INTEGER DEFAULT 1,
    created_at TEXT
);

CREATE TABLE IF NOT EXISTS online_deposits (
    deposit_id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    reference_number VARCHAR(255) DEFAULT '',
    sender_name VARCHAR(255) DEFAULT '',
    payment_method VARCHAR(50) DEFAULT 'gcash',
    status VARCHAR(20) DEFAULT 'pending',
    admin_notes TEXT DEFAULT '',
    created_at TEXT,
    resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
    log_id TEXT PRIMARY KEY,
    admin_id TEXT,
    admin_name TEXT,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    details TEXT DEFAULT '{}',
    ip_address TEXT DEFAULT '',
    created_at TEXT
);

CREATE TABLE IF NOT EXISTS teller_cash (
    cash_id TEXT PRIMARY KEY,
    teller_id TEXT NOT NULL,
    opening_balance DECIMAL(12,2) DEFAULT 0,
    current_balance DECIMAL(12,2) DEFAULT 0,
    date TEXT NOT NULL,
    status TEXT DEFAULT 'open' CHECK(status IN ('open','closed')),
    closed_at TEXT,
    notes TEXT DEFAULT '',
    created_at TEXT
);

CREATE TABLE IF NOT EXISTS fees (
    fee_id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    fee_type TEXT DEFAULT 'fixed' CHECK(fee_type IN ('fixed','percentage')),
    gl_account_code TEXT REFERENCES gl_accounts(code),
    description TEXT DEFAULT '',
    is_active INTEGER DEFAULT 1,
    created_at TEXT
);
