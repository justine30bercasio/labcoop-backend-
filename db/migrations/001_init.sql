-- LabCoop Database Schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS accounts (
    account_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    child_name VARCHAR(255) NOT NULL,
    actual_balance DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    unallocated_balance DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    current_xp INTEGER NOT NULL DEFAULT 0,
    parent_phone VARCHAR(20),
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS goal_jars (
    goal_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    target_amount DECIMAL(12, 2) NOT NULL,
    current_allocated DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    category_icon VARCHAR(100) NOT NULL DEFAULT 'savings',
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS badges (
    badge_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    icon_url VARCHAR(500),
    required_xp INTEGER NOT NULL,
    is_unlocked BOOLEAN NOT NULL DEFAULT FALSE,
    unlocked_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
    transaction_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
    goal_id UUID REFERENCES goal_jars(goal_id) ON DELETE SET NULL,
    type VARCHAR(50) NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_goal_jars_account ON goal_jars(account_id);
CREATE INDEX idx_badges_account ON badges(account_id);
CREATE INDEX idx_transactions_account ON transactions(account_id);
CREATE INDEX idx_transactions_created ON transactions(created_at DESC);
