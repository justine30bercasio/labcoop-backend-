const path = require('path');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, '..', 'labcoop.db');

let db = null;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function getAccount(accountId) {
  const row = getDb().prepare('SELECT * FROM accounts WHERE account_id = ?').get(accountId);
  return row || null;
}

function getAccountByName(childName) {
  const row = getDb().prepare('SELECT * FROM accounts WHERE child_name = ?').get(childName.trim());
  return row || null;
}

function createAccount(fields) {
  const account = {
    account_id: uuidv4(),
    child_name: fields.child_name,
    member_id: fields.member_id || null,
    password: fields.password || '',
    password_changed: fields.password_changed ?? 0,
    actual_balance: fields.actual_balance || 0,
    unallocated_balance: fields.unallocated_balance || 0,
    current_xp: fields.current_xp || 0,
    parent_phone: fields.parent_phone || '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  getDb().prepare(`
    INSERT INTO accounts (account_id, child_name, member_id, password, password_changed, actual_balance, unallocated_balance, current_xp, parent_phone, created_at, updated_at)
    VALUES (@account_id, @child_name, @member_id, @password, @password_changed, @actual_balance, @unallocated_balance, @current_xp, @parent_phone, @created_at, @updated_at)
  `).run(account);
  return account;
}

function updateAccount(accountId, fields) {
  const allowed = ['actual_balance', 'unallocated_balance', 'current_xp', 'child_name', 'parent_phone'];
  const setClauses = [];
  const values = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      setClauses.push(`${key} = ?`);
      values.push(fields[key]);
    }
  }
  if (setClauses.length === 0) return getAccount(accountId);
  setClauses.push("updated_at = datetime('now')");
  values.push(accountId);
  getDb().prepare(`UPDATE accounts SET ${setClauses.join(', ')} WHERE account_id = ?`).run(...values);
  return getAccount(accountId);
}

function getGoals(accountId) {
  return getDb().prepare('SELECT * FROM goal_jars WHERE account_id = ? ORDER BY created_at ASC').all(accountId);
}

function getGoal(goalId) {
  const row = getDb().prepare('SELECT * FROM goal_jars WHERE goal_id = ?').get(goalId);
  return row || null;
}

function createGoal(goal) {
  const newGoal = {
    goal_id: uuidv4(),
    account_id: goal.account_id,
    title: goal.title,
    target_amount: goal.target_amount,
    current_allocated: goal.current_allocated || 0,
    category_icon: goal.category_icon || 'savings',
    is_completed: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  getDb().prepare(`
    INSERT INTO goal_jars (goal_id, account_id, title, target_amount, current_allocated, category_icon, is_completed, created_at, updated_at)
    VALUES (@goal_id, @account_id, @title, @target_amount, @current_allocated, @category_icon, @is_completed, @created_at, @updated_at)
  `).run(newGoal);
  return newGoal;
}

function updateGoal(goalId, fields) {
  const allowed = ['current_allocated', 'title', 'target_amount', 'category_icon'];
  const setClauses = [];
  const values = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      setClauses.push(`${key} = ?`);
      values.push(fields[key]);
    }
  }
  if (setClauses.length === 0) return getGoal(goalId);

  setClauses.push("updated_at = datetime('now')");
  values.push(goalId);
  getDb().prepare(`UPDATE goal_jars SET ${setClauses.join(', ')} WHERE goal_id = ?`).run(...values);

  const updated = getGoal(goalId);
  if (updated) {
    const completed = updated.current_allocated >= updated.target_amount ? 1 : 0;
    getDb().prepare('UPDATE goal_jars SET is_completed = ? WHERE goal_id = ?').run(completed, goalId);
    updated.is_completed = completed;
  }
  return updated;
}

function deleteGoal(goalId) {
  getDb().prepare('DELETE FROM goal_jars WHERE goal_id = ?').run(goalId);
}

function getBadges(accountId) {
  return getDb().prepare('SELECT * FROM badges WHERE account_id = ? ORDER BY created_at ASC').all(accountId);
}

function unlockBadges(accountId, currentXp) {
  const toUnlock = getDb().prepare(
    'SELECT * FROM badges WHERE account_id = ? AND is_unlocked = 0 AND required_xp <= ?'
  ).all(accountId, currentXp);

  const now = new Date().toISOString();
  const unlockStmt = getDb().prepare(
    'UPDATE badges SET is_unlocked = 1, unlocked_at = ? WHERE badge_id = ?'
  );
  for (const badge of toUnlock) {
    unlockStmt.run(now, badge.badge_id);
    badge.is_unlocked = 1;
    badge.unlocked_at = now;
  }
  return toUnlock;
}

function addTransaction(tx) {
  const newTx = {
    transaction_id: uuidv4(),
    account_id: tx.account_id,
    goal_id: tx.goal_id || null,
    type: tx.type,
    amount: tx.amount,
    description: tx.description || '',
    created_at: new Date().toISOString(),
  };
  getDb().prepare(`
    INSERT INTO transactions (transaction_id, account_id, goal_id, type, amount, description, created_at)
    VALUES (@transaction_id, @account_id, @goal_id, @type, @amount, @description, @created_at)
  `).run(newTx);
  return newTx;
}

function getTransactions(accountId, limit = 50, offset = 0) {
  return getDb().prepare(
    'SELECT * FROM transactions WHERE account_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).all(accountId, Number(limit), Number(offset));
}

function createBadge(fields) {
  const newBadge = {
    badge_id: uuidv4(),
    account_id: fields.account_id,
    name: fields.name,
    description: fields.description || '',
    icon_url: fields.icon_url || '',
    required_xp: Number(fields.required_xp) || 0,
    is_unlocked: fields.is_unlocked ? 1 : 0,
    unlocked_at: fields.is_unlocked ? new Date().toISOString() : null,
    created_at: new Date().toISOString(),
  };
  getDb().prepare(`
    INSERT INTO badges (badge_id, account_id, name, description, icon_url, required_xp, is_unlocked, unlocked_at, created_at)
    VALUES (@badge_id, @account_id, @name, @description, @icon_url, @required_xp, @is_unlocked, @unlocked_at, @created_at)
  `).run(newBadge);
  return newBadge;
}

function updateBadge(badgeId, fields) {
  const allowed = ['name', 'description', 'icon_url', 'required_xp', 'is_unlocked'];
  const setClauses = [];
  const values = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      setClauses.push(`${key} = ?`);
      values.push(fields[key]);
    }
  }
  if (fields.is_unlocked !== undefined) {
    if (fields.is_unlocked) {
      setClauses.push("unlocked_at = COALESCE(unlocked_at, datetime('now'))");
    } else {
      setClauses.push("unlocked_at = NULL");
    }
  }
  if (setClauses.length === 0) return null;
  values.push(badgeId);
  getDb().prepare(`UPDATE badges SET ${setClauses.join(', ')} WHERE badge_id = ?`).run(...values);
  return getDb().prepare('SELECT * FROM badges WHERE badge_id = ?').get(badgeId);
}

function deleteBadge(badgeId) {
  getDb().prepare('DELETE FROM badges WHERE badge_id = ?').run(badgeId);
}

function close() {
  if (db) {
    db.close();
    db = null;
  }
}

// ── Quiz Questions ──

function getQuizQuestions(difficulty) {
  const db = getDb();
  if (difficulty) {
    return db.prepare('SELECT * FROM quiz_questions WHERE difficulty_level = ? AND is_active = 1 ORDER BY category').all(difficulty);
  }
  return db.prepare('SELECT * FROM quiz_questions WHERE is_active = 1 ORDER BY difficulty_level, category').all();
}

function getQuizQuestion(id) {
  return getDb().prepare('SELECT * FROM quiz_questions WHERE id = ?').get(id) || null;
}

function createQuizQuestion(fields) {
  const { v4: uuidv4 } = require('uuid');
  const q = {
    id: uuidv4(),
    question: fields.question,
    options: JSON.stringify(fields.options),
    correct_index: Number(fields.correct_index),
    explanation: fields.explanation || '',
    category: fields.category || 'General',
    difficulty_level: fields.difficulty_level || 'easy',
    xp_reward: Number(fields.xp_reward) || 10,
    coin_reward: Number(fields.coin_reward) || 5,
  };
  getDb().prepare(`
    INSERT INTO quiz_questions (id, question, options, correct_index, explanation, category, difficulty_level, xp_reward, coin_reward, is_active)
    VALUES (@id, @question, @options, @correct_index, @explanation, @category, @difficulty_level, @xp_reward, @coin_reward, 1)
  `).run(q);
  return getQuizQuestion(q.id);
}

function updateQuizQuestion(id, fields) {
  const allowed = ['question', 'options', 'correct_index', 'explanation', 'category', 'difficulty_level', 'xp_reward', 'coin_reward', 'is_active'];
  const setClauses = [];
  const values = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      let val = fields[key];
      if (key === 'options' && Array.isArray(val)) val = JSON.stringify(val);
      setClauses.push(`${key} = ?`);
      values.push(val);
    }
  }
  if (setClauses.length === 0) return getQuizQuestion(id);
  setClauses.push("updated_at = datetime('now')");
  values.push(id);
  getDb().prepare(`UPDATE quiz_questions SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);
  return getQuizQuestion(id);
}

function deleteQuizQuestion(id) {
  getDb().prepare('DELETE FROM quiz_questions WHERE id = ?').run(id);
}

module.exports = {
  getDb,
  getAccount,
  getAccountByName,
  createAccount,
  updateAccount,
  getGoals,
  getGoal,
  createGoal,
  updateGoal,
  deleteGoal,
  getBadges,
  createBadge,
  updateBadge,
  deleteBadge,
  unlockBadges,
  addTransaction,
  getTransactions,
  getQuizQuestions,
  getQuizQuestion,
  createQuizQuestion,
  updateQuizQuestion,
  deleteQuizQuestion,
  close,
};
