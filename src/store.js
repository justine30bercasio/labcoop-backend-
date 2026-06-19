const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, '..', 'data.json');

const defaultData = {
  accounts: [
    {
      account_id: '00000000-0000-0000-0000-000000000001',
      child_name: 'Juan',
      actual_balance: 1500.0,
      unallocated_balance: 200.0,
      current_xp: 45,
      parent_phone: '09171234567',
      created_at: '2025-01-15T08:00:00.000Z',
      updated_at: '2025-06-10T10:30:00.000Z',
    },
    {
      account_id: '00000000-0000-0000-0000-000000000002',
      child_name: 'Maria',
      actual_balance: 2500.0,
      unallocated_balance: 500.0,
      current_xp: 120,
      parent_phone: '09179876543',
      created_at: '2025-02-01T09:00:00.000Z',
      updated_at: '2025-06-10T11:00:00.000Z',
    },
  ],
  goals: [
    {
      goal_id: '10000000-0000-0000-0000-000000000001',
      account_id: '00000000-0000-0000-0000-000000000001',
      title: 'New School Shoes',
      target_amount: 1000.0,
      current_allocated: 650.0,
      category_icon: 'shoes',
      is_completed: false,
      created_at: '2025-01-20T08:00:00.000Z',
      updated_at: '2025-06-01T10:00:00.000Z',
    },
    {
      goal_id: '10000000-0000-0000-0000-000000000002',
      account_id: '00000000-0000-0000-0000-000000000001',
      title: 'Bicycle',
      target_amount: 3000.0,
      current_allocated: 450.0,
      category_icon: 'bike',
      is_completed: false,
      created_at: '2025-02-10T08:00:00.000Z',
      updated_at: '2025-06-05T14:00:00.000Z',
    },
    {
      goal_id: '10000000-0000-0000-0000-000000000003',
      account_id: '00000000-0000-0000-0000-000000000001',
      title: 'Video Game',
      target_amount: 500.0,
      current_allocated: 200.0,
      category_icon: 'game',
      is_completed: false,
      created_at: '2025-03-01T08:00:00.000Z',
      updated_at: '2025-06-08T16:00:00.000Z',
    },
    {
      goal_id: '10000000-0000-0000-0000-000000000004',
      account_id: '00000000-0000-0000-0000-000000000002',
      title: 'Art Set',
      target_amount: 800.0,
      current_allocated: 600.0,
      category_icon: 'toy',
      is_completed: false,
      created_at: '2025-02-15T09:00:00.000Z',
      updated_at: '2025-06-07T12:00:00.000Z',
    },
    {
      goal_id: '10000000-0000-0000-0000-000000000005',
      account_id: '00000000-0000-0000-0000-000000000002',
      title: 'Birthday Gift for Mama',
      target_amount: 2000.0,
      current_allocated: 1400.0,
      category_icon: 'savings',
      is_completed: false,
      created_at: '2025-03-10T09:00:00.000Z',
      updated_at: '2025-06-09T15:00:00.000Z',
    },
  ],
  badges: [
    {
      badge_id: '20000000-0000-0000-0000-000000000001',
      account_id: '00000000-0000-0000-0000-000000000001',
      name: 'First Saver',
      description: 'Made your first deposit',
      icon_url: '/badges/first_saver.png',
      required_xp: 10,
      is_unlocked: true,
      unlocked_at: '2025-01-15T08:05:00.000Z',
      created_at: '2025-01-15T08:00:00.000Z',
    },
    {
      badge_id: '20000000-0000-0000-0000-000000000002',
      account_id: '00000000-0000-0000-0000-000000000001',
      name: 'Steady Saver',
      description: 'Saved consistently for a month',
      icon_url: '/badges/steady_saver.png',
      required_xp: 50,
      is_unlocked: false,
      unlocked_at: null,
      created_at: '2025-01-15T08:00:00.000Z',
    },
    {
      badge_id: '20000000-0000-0000-0000-000000000003',
      account_id: '00000000-0000-0000-0000-000000000001',
      name: 'Goal Getter',
      description: 'Completed your first savings goal',
      icon_url: '/badges/goal_getter.png',
      required_xp: 100,
      is_unlocked: false,
      unlocked_at: null,
      created_at: '2025-01-15T08:00:00.000Z',
    },
    {
      badge_id: '20000000-0000-0000-0000-000000000004',
      account_id: '00000000-0000-0000-0000-000000000002',
      name: 'First Saver',
      description: 'Made your first deposit',
      icon_url: '/badges/first_saver.png',
      required_xp: 10,
      is_unlocked: true,
      unlocked_at: '2025-02-01T09:05:00.000Z',
      created_at: '2025-02-01T09:00:00.000Z',
    },
    {
      badge_id: '20000000-0000-0000-0000-000000000005',
      account_id: '00000000-0000-0000-0000-000000000002',
      name: 'Steady Saver',
      description: 'Saved consistently for a month',
      icon_url: '/badges/steady_saver.png',
      required_xp: 50,
      is_unlocked: true,
      unlocked_at: '2025-03-01T09:00:00.000Z',
      created_at: '2025-02-01T09:00:00.000Z',
    },
    {
      badge_id: '20000000-0000-0000-0000-000000000006',
      account_id: '00000000-0000-0000-0000-000000000002',
      name: 'Goal Getter',
      description: 'Completed your first savings goal',
      icon_url: '/badges/goal_getter.png',
      required_xp: 100,
      is_unlocked: false,
      unlocked_at: null,
      created_at: '2025-02-01T09:00:00.000Z',
    },
  ],
  transactions: [],
};

function load() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(defaultData, null, 2));
    return JSON.parse(JSON.stringify(defaultData));
  }
  const raw = fs.readFileSync(DB_PATH, 'utf8');
  return JSON.parse(raw);
}

function save(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function getAccount(accountId) {
  const data = load();
  return data.accounts.find((a) => a.account_id === accountId) || null;
}

function updateAccount(accountId, fields) {
  const data = load();
  const idx = data.accounts.findIndex((a) => a.account_id === accountId);
  if (idx === -1) return null;
  data.accounts[idx] = { ...data.accounts[idx], ...fields, updated_at: new Date().toISOString() };
  save(data);
  return data.accounts[idx];
}

function getGoals(accountId) {
  const data = load();
  return data.goals.filter((g) => g.account_id === accountId);
}

function getGoal(goalId) {
  const data = load();
  return data.goals.find((g) => g.goal_id === goalId) || null;
}

function createGoal(goal) {
  const data = load();
  const newGoal = {
    goal_id: uuidv4(),
    ...goal,
    current_allocated: 0,
    is_completed: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  data.goals.push(newGoal);
  save(data);
  return newGoal;
}

function updateGoal(goalId, fields) {
  const data = load();
  const idx = data.goals.findIndex((g) => g.goal_id === goalId);
  if (idx === -1) return null;
  const updated = {
    ...data.goals[idx],
    ...fields,
    target_amount: fields.target_amount ?? data.goals[idx].target_amount,
    updated_at: new Date().toISOString(),
  };
  updated.is_completed = updated.current_allocated >= updated.target_amount;
  data.goals[idx] = updated;
  save(data);
  return updated;
}

function deleteGoal(goalId) {
  const data = load();
  data.goals = data.goals.filter((g) => g.goal_id !== goalId);
  save(data);
}

function getBadges(accountId) {
  const data = load();
  return data.badges.filter((b) => b.account_id === accountId);
}

function unlockBadges(accountId, currentXp) {
  const data = load();
  const unlocked = [];
  for (let i = 0; i < data.badges.length; i++) {
    const b = data.badges[i];
    if (b.account_id === accountId && !b.is_unlocked && b.required_xp <= currentXp) {
      data.badges[i].is_unlocked = true;
      data.badges[i].unlocked_at = new Date().toISOString();
      unlocked.push(data.badges[i]);
    }
  }
  save(data);
  return unlocked;
}

function addTransaction(tx) {
  const data = load();
  const newTx = {
    transaction_id: uuidv4(),
    ...tx,
    created_at: new Date().toISOString(),
  };
  data.transactions.push(newTx);
  save(data);
  return newTx;
}

function getTransactions(accountId, limit = 50, offset = 0) {
  const data = load();
  return data.transactions
    .filter((t) => t.account_id === accountId)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(offset, offset + limit);
}

module.exports = {
  getAccount,
  updateAccount,
  getGoals,
  getGoal,
  createGoal,
  updateGoal,
  deleteGoal,
  getBadges,
  unlockBadges,
  addTransaction,
  getTransactions,
};
