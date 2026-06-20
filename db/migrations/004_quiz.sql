CREATE TABLE IF NOT EXISTS quiz_questions (
    id TEXT PRIMARY KEY,
    question TEXT NOT NULL,
    options TEXT NOT NULL,
    correct_index INTEGER NOT NULL,
    explanation TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'General',
    difficulty_level TEXT NOT NULL DEFAULT 'easy' CHECK(difficulty_level IN ('easy','medium','hard','expert')),
    xp_reward INTEGER NOT NULL DEFAULT 10,
    coin_reward INTEGER NOT NULL DEFAULT 5,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);
