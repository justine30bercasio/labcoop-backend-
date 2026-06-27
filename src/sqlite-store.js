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
    db.exec(`
      CREATE TABLE IF NOT EXISTS gl_accounts (code TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('asset','liability','equity','income','expense')), is_active INTEGER DEFAULT 1);
      CREATE TABLE IF NOT EXISTS gl_entries (entry_id TEXT PRIMARY KEY, transaction_id TEXT, account_code TEXT NOT NULL REFERENCES gl_accounts(code), debit DECIMAL(12,2) DEFAULT 0, credit DECIMAL(12,2) DEFAULT 0, description TEXT DEFAULT '', created_at TEXT);
      CREATE TABLE IF NOT EXISTS audit_log (log_id TEXT PRIMARY KEY, admin_id TEXT, admin_name TEXT, action TEXT NOT NULL, entity_type TEXT, entity_id TEXT, details TEXT DEFAULT '{}', ip_address TEXT DEFAULT '', created_at TEXT);
      CREATE TABLE IF NOT EXISTS admin_users (admin_id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT DEFAULT 'admin' CHECK(role IN ('super_admin','manager','teller','auditor')), display_name TEXT DEFAULT '', email TEXT DEFAULT '', is_active INTEGER DEFAULT 1, created_at TEXT);
    `);
    // Migrate existing admin_users table — add email column if missing
    try { db.exec("ALTER TABLE admin_users ADD COLUMN email TEXT DEFAULT ''"); } catch (_) {}
    try { db.exec("CREATE TABLE IF NOT EXISTS online_deposits (deposit_id TEXT PRIMARY KEY, account_id TEXT NOT NULL, amount DECIMAL(12,2) NOT NULL, reference_number VARCHAR(255) DEFAULT '', sender_name VARCHAR(255) DEFAULT '', payment_method VARCHAR(50) DEFAULT 'gcash', status VARCHAR(20) DEFAULT 'pending', admin_notes TEXT DEFAULT '', created_at TEXT, resolved_at TEXT)"); } catch (_) {}
    try { db.exec("CREATE TABLE IF NOT EXISTS fcm_tokens (token_id TEXT PRIMARY KEY, account_id TEXT NOT NULL, fcm_token TEXT NOT NULL, device_platform VARCHAR(20) DEFAULT '', created_at TEXT, updated_at TEXT)"); } catch (_) {}
    try { db.exec("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '')"); } catch (_) {}
    try { db.exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('gcash_number', '09171234567')"); } catch (_) {}
    try { db.exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('gcash_name', 'LabCoop Savings')"); } catch (_) {}
    try { db.exec("CREATE TABLE IF NOT EXISTS transactions (transaction_id TEXT PRIMARY KEY, trn_number INTEGER UNIQUE, account_id TEXT NOT NULL, goal_id TEXT, type VARCHAR(50) NOT NULL, amount DECIMAL(12,2) NOT NULL, balance_before DECIMAL(12,2), balance_after DECIMAL(12,2), description TEXT DEFAULT '', reference_type VARCHAR(50), reference_id TEXT, created_at TEXT)"); } catch (_) {}
    try { db.exec("CREATE TABLE IF NOT EXISTS sequences (name TEXT NOT NULL, year INTEGER NOT NULL, value INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (name, year))"); } catch (_) {}
    try { db.exec("ALTER TABLE transactions ADD COLUMN trn_number INTEGER"); } catch (_) {}
    const count = db.prepare("SELECT COUNT(*) as c FROM gl_accounts").get();
    if (count.c === 0) {
      const insert = db.prepare('INSERT INTO gl_accounts (code, name, type) VALUES (?,?,?)');
      const accounts = [
        ['1000','Cash on Hand','asset'], ['1100','Loans Receivable','asset'], ['1200','Accrued Interest','asset'],
        ['2000','Savings Deposits','liability'], ['2100','Time Deposits','liability'], ['2200','Interest Payable','liability'],
        ['3000','Share Capital','equity'], ['3100','Retained Earnings','equity'],
        ['4000','Interest Income','income'], ['4100','Fee Income','income'],
        ['5000','Interest Expense','expense'],
      ];
      for (const a of accounts) insert.run(...a);
    }
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
    last_name: fields.last_name || '',
    first_name: fields.first_name || '',
    middle_name: fields.middle_name || '',
    birthday: fields.birthday || '',
    age: fields.birthday ? _computeAge(fields.birthday) : (fields.age || 0),
    gender: fields.gender || '',
    savings_schedule: fields.savings_schedule || '',
    photo_2x2_url: fields.photo_2x2_url || '',
    birth_cert_url: fields.birth_cert_url || '',
    id_photo_url: fields.id_photo_url || '',
    is_active: fields.is_active ?? 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  getDb().prepare(`
    INSERT INTO accounts (account_id, child_name, member_id, password, password_changed, actual_balance, unallocated_balance, current_xp, parent_phone, last_name, first_name, middle_name, birthday, age, gender, savings_schedule, photo_2x2_url, birth_cert_url, id_photo_url, is_active, created_at, updated_at)
    VALUES (@account_id, @child_name, @member_id, @password, @password_changed, @actual_balance, @unallocated_balance, @current_xp, @parent_phone, @last_name, @first_name, @middle_name, @birthday, @age, @gender, @savings_schedule, @photo_2x2_url, @birth_cert_url, @id_photo_url, @is_active, @created_at, @updated_at)
  `).run(account);
  return account;
}

function _computeAge(birthday) {
  if (!birthday) return 0;
  const parts = birthday.split('-');
  if (parts.length !== 3) return 0;
  const birth = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function updateAccount(accountId, fields) {
  const allowed = ['actual_balance', 'unallocated_balance', 'current_xp', 'child_name', 'parent_phone', 'last_name', 'first_name', 'middle_name', 'birthday', 'age', 'gender', 'savings_schedule', 'photo_2x2_url', 'birth_cert_url', 'id_photo_url', 'is_active'];
  const setClauses = [];
  const values = [];

  if (fields.birthday !== undefined && fields.birthday) {
    fields.age = _computeAge(fields.birthday);
  }

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
  const account = getAccount(tx.account_id);
  const currentBalance = account ? account.actual_balance : 0;

  let balanceAfter = currentBalance;
  // Compute running balance based on transaction type
  if (['deposit', 'interest_credit', 'loan_disbursement'].includes(tx.type)) {
    balanceAfter = Math.round((currentBalance + Number(tx.amount)) * 100) / 100;
  } else if (['withdrawal', 'loan_payment', 'fee'].includes(tx.type)) {
    balanceAfter = Math.round((currentBalance - Number(tx.amount)) * 100) / 100;
  }

  const year = new Date().getFullYear();
  const seq = getDb().transaction(() => {
    const existing = getDb().prepare('SELECT value FROM sequences WHERE name = ? AND year = ?').get('trn', year);
    if (!existing) {
      getDb().prepare('INSERT INTO sequences (name, year, value) VALUES (?, ?, 1)').run('trn', year);
      return 1;
    }
    getDb().prepare('UPDATE sequences SET value = value + 1 WHERE name = ? AND year = ?').run('trn', year);
    return existing.value + 1;
  })();
  const trnNumber = seq;

  const newTx = {
    transaction_id: uuidv4(),
    trn_number: trnNumber,
    account_id: tx.account_id,
    goal_id: tx.goal_id || null,
    type: tx.type,
    amount: tx.amount,
    balance_before: tx.balance_before !== undefined ? tx.balance_before : currentBalance,
    balance_after: tx.balance_after !== undefined ? tx.balance_after : balanceAfter,
    description: tx.description || '',
    reference_type: tx.reference_type || null,
    reference_id: tx.reference_id || null,
    created_at: new Date().toISOString(),
  };
  getDb().prepare(`
    INSERT INTO transactions (transaction_id, trn_number, account_id, goal_id, type, amount, balance_before, balance_after, description, reference_type, reference_id, created_at)
    VALUES (@transaction_id, @trn_number, @account_id, @goal_id, @type, @amount, @balance_before, @balance_after, @description, @reference_type, @reference_id, @created_at)
  `).run(newTx);
  return newTx;
}

function getTransactions(accountId, limit = 50, offset = 0) {
  return getDb().prepare(
    'SELECT * FROM transactions WHERE account_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).all(accountId, Number(limit), Number(offset));
}

function getStatement(accountId, limit = 100, offset = 0) {
  return getDb().prepare(
    'SELECT * FROM transactions WHERE account_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).all(accountId, Number(limit), Number(offset));
}

// ── Loan Products ──

function getLoanProducts(includeInactive) {
  const sql = includeInactive
    ? 'SELECT * FROM loan_products ORDER BY min_amount ASC'
    : 'SELECT * FROM loan_products WHERE is_active = 1 ORDER BY min_amount ASC';
  return getDb().prepare(sql).all();
}

function getLoanProduct(productId) {
  return getDb().prepare('SELECT * FROM loan_products WHERE product_id = ?').get(productId) || null;
}

function createLoanProduct(fields) {
  const product = {
    product_id: `lp_${uuidv4().slice(0, 8)}`,
    name: fields.name,
    description: fields.description || '',
    interest_rate: Number(fields.interest_rate),
    interest_type: fields.interest_type || 'flat',
    min_amount: Number(fields.min_amount) || 100,
    max_amount: Number(fields.max_amount) || 10000,
    min_term: Number(fields.min_term) || 1,
    max_term: Number(fields.max_term) || 12,
    is_active: 1,
    created_at: new Date().toISOString(),
  };
  getDb().prepare(`
    INSERT INTO loan_products (product_id, name, description, interest_rate, interest_type, min_amount, max_amount, min_term, max_term, is_active, created_at)
    VALUES (@product_id, @name, @description, @interest_rate, @interest_type, @min_amount, @max_amount, @min_term, @max_term, @is_active, @created_at)
  `).run(product);
  return product;
}

function updateLoanProduct(productId, fields) {
  const existing = getLoanProduct(productId);
  if (!existing) return null;
  const allowed = ['name', 'description', 'interest_rate', 'interest_type', 'min_amount', 'max_amount', 'min_term', 'max_term', 'is_active'];
  const setClauses = [];
  const values = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      setClauses.push(`${key} = ?`);
      values.push(fields[key]);
    }
  }
  if (setClauses.length === 0) return existing;
  values.push(productId);
  getDb().prepare(`UPDATE loan_products SET ${setClauses.join(', ')} WHERE product_id = ?`).run(...values);
  return getLoanProduct(productId);
}

// ── Savings Products ──

function getSavingsProducts(includeInactive) {
  const sql = includeInactive
    ? 'SELECT * FROM savings_products ORDER BY name ASC'
    : 'SELECT * FROM savings_products WHERE is_active = 1 ORDER BY name ASC';
  return getDb().prepare(sql).all();
}

function getSavingsProduct(productId) {
  return getDb().prepare('SELECT * FROM savings_products WHERE product_id = ?').get(productId) || null;
}

function createSavingsProduct(fields) {
  const product = {
    product_id: `sp_${uuidv4().slice(0, 8)}`,
    name: fields.name,
    description: fields.description || '',
    interest_rate: Number(fields.interest_rate) || 0,
    interest_frequency: fields.interest_frequency || 'monthly',
    min_balance: Number(fields.min_balance) || 0,
    withdrawal_limit: fields.withdrawal_limit !== undefined && fields.withdrawal_limit !== '' ? Number(fields.withdrawal_limit) : null,
    is_active: 1,
    created_at: new Date().toISOString(),
  };
  getDb().prepare(`
    INSERT INTO savings_products (product_id, name, description, interest_rate, interest_frequency, min_balance, withdrawal_limit, is_active, created_at)
    VALUES (@product_id, @name, @description, @interest_rate, @interest_frequency, @min_balance, @withdrawal_limit, @is_active, @created_at)
  `).run(product);
  return product;
}

function updateSavingsProduct(productId, fields) {
  const existing = getSavingsProduct(productId);
  if (!existing) return null;
  const allowed = ['name', 'description', 'interest_rate', 'interest_frequency', 'min_balance', 'withdrawal_limit', 'is_active'];
  const setClauses = [];
  const values = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      setClauses.push(`${key} = ?`);
      values.push(fields[key]);
    }
  }
  if (setClauses.length === 0) return existing;
  values.push(productId);
  getDb().prepare(`UPDATE savings_products SET ${setClauses.join(', ')} WHERE product_id = ?`).run(...values);
  return getSavingsProduct(productId);
}

// ── Withdrawal Requests ──

function getWithdrawalRequests(accountId) {
  if (accountId) return getDb().prepare('SELECT * FROM withdrawal_requests WHERE account_id = ? ORDER BY created_at DESC').all(accountId);
  return getDb().prepare('SELECT w.*, a.child_name FROM withdrawal_requests w LEFT JOIN accounts a ON w.account_id = a.account_id ORDER BY w.created_at DESC').all();
}

function getWithdrawalRequest(requestId) {
  return getDb().prepare('SELECT * FROM withdrawal_requests WHERE request_id = ?').get(requestId) || null;
}

function createWithdrawalRequest(fields) {
  const req = {
    request_id: uuidv4(),
    account_id: fields.account_id,
    amount: Number(fields.amount),
    reason: fields.reason || '',
    status: 'pending',
    admin_notes: '',
    created_at: new Date().toISOString(),
  };
  getDb().prepare(`
    INSERT INTO withdrawal_requests (request_id, account_id, amount, reason, status, admin_notes, created_at)
    VALUES (@request_id, @account_id, @amount, @reason, @status, @admin_notes, @created_at)
  `).run(req);
  return req;
}

function updateWithdrawalRequest(requestId, fields) {
  const allowed = ['status', 'admin_notes', 'resolved_at'];
  const setClauses = [];
  const values = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      setClauses.push(`${key} = ?`);
      values.push(fields[key]);
    }
  }
  if (setClauses.length === 0) return getWithdrawalRequest(requestId);
  values.push(requestId);
  getDb().prepare(`UPDATE withdrawal_requests SET ${setClauses.join(', ')} WHERE request_id = ?`).run(...values);
  return getWithdrawalRequest(requestId);
}

// ── Standing Orders (Auto-Save) ──

function getStandingOrders(accountId) {
  return getDb().prepare('SELECT * FROM standing_orders WHERE account_id = ? ORDER BY created_at DESC').all(accountId);
}

function getStandingOrder(orderId) {
  return getDb().prepare('SELECT * FROM standing_orders WHERE order_id = ?').get(orderId) || null;
}

function createStandingOrder(fields) {
  const order = {
    order_id: uuidv4(),
    account_id: fields.account_id,
    type: fields.type || 'transfer',
    target_goal_id: fields.target_goal_id || null,
    amount: Number(fields.amount),
    frequency: fields.frequency,
    next_run: fields.next_run || new Date().toISOString(),
    is_active: 1,
    description: fields.description || '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  getDb().prepare(`
    INSERT INTO standing_orders (order_id, account_id, type, target_goal_id, amount, frequency, next_run, is_active, description, created_at, updated_at)
    VALUES (@order_id, @account_id, @type, @target_goal_id, @amount, @frequency, @next_run, @is_active, @description, @created_at, @updated_at)
  `).run(order);
  return order;
}

function updateStandingOrder(orderId, fields) {
  const allowed = ['amount', 'frequency', 'next_run', 'is_active', 'description', 'target_goal_id'];
  const setClauses = [];
  const values = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      setClauses.push(`${key} = ?`);
      values.push(fields[key]);
    }
  }
  if (setClauses.length === 0) return getStandingOrder(orderId);
  setClauses.push("updated_at = datetime('now')");
  values.push(orderId);
  getDb().prepare(`UPDATE standing_orders SET ${setClauses.join(', ')} WHERE order_id = ?`).run(...values);
  return getStandingOrder(orderId);
}

function deleteStandingOrder(orderId) {
  getDb().prepare('UPDATE standing_orders SET is_active = 0, updated_at = datetime(\'now\') WHERE order_id = ?').run(orderId);
}

// ── Savings Applications ──

function getSavingsApplications(accountId) {
  if (accountId) return getDb().prepare('SELECT * FROM savings_applications WHERE account_id = ? ORDER BY created_at DESC').all(accountId);
  return getDb().prepare('SELECT sa.*, a.child_name, sp.name as product_name FROM savings_applications sa LEFT JOIN accounts a ON sa.account_id = a.account_id LEFT JOIN savings_products sp ON sa.product_id = sp.product_id ORDER BY sa.created_at DESC').all();
}

function createSavingsApplication(fields) {
  const app = {
    application_id: uuidv4(),
    account_id: fields.account_id,
    product_id: fields.product_id,
    status: 'pending',
    admin_notes: '',
    created_at: new Date().toISOString(),
  };
  getDb().prepare(`
    INSERT INTO savings_applications (application_id, account_id, product_id, status, admin_notes, created_at)
    VALUES (@application_id, @account_id, @product_id, @status, @admin_notes, @created_at)
  `).run(app);
  return app;
}

function updateSavingsApplication(applicationId, fields) {
  const allowed = ['status', 'admin_notes', 'resolved_at'];
  const setClauses = [];
  const values = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      setClauses.push(`${key} = ?`);
      values.push(fields[key]);
    }
  }
  if (setClauses.length === 0) return getDb().prepare('SELECT * FROM savings_applications WHERE application_id = ?').get(applicationId);
  values.push(applicationId);
  getDb().prepare(`UPDATE savings_applications SET ${setClauses.join(', ')} WHERE application_id = ?`).run(...values);
  return getDb().prepare('SELECT * FROM savings_applications WHERE application_id = ?').get(applicationId);
}

// ── Online Deposits (GCash) ──

function getOnlineDeposits(accountId) {
  if (accountId) return getDb().prepare('SELECT * FROM online_deposits WHERE account_id = ? ORDER BY created_at DESC').all(accountId);
  return getDb().prepare('SELECT d.*, a.child_name FROM online_deposits d LEFT JOIN accounts a ON d.account_id = a.account_id ORDER BY d.created_at DESC').all();
}

function getOnlineDeposit(depositId) {
  return getDb().prepare('SELECT * FROM online_deposits WHERE deposit_id = ?').get(depositId) || null;
}

function createOnlineDeposit(fields) {
  const deposit = {
    deposit_id: uuidv4(),
    account_id: fields.account_id,
    amount: Number(fields.amount),
    reference_number: fields.reference_number || '',
    sender_name: fields.sender_name || '',
    payment_method: fields.payment_method || 'gcash',
    status: 'pending',
    admin_notes: '',
    created_at: new Date().toISOString(),
  };
  getDb().prepare(`
    INSERT INTO online_deposits (deposit_id, account_id, amount, reference_number, sender_name, payment_method, status, admin_notes, created_at)
    VALUES (@deposit_id, @account_id, @amount, @reference_number, @sender_name, @payment_method, @status, @admin_notes, @created_at)
  `).run(deposit);
  return deposit;
}

function updateOnlineDeposit(depositId, fields) {
  const allowed = ['status', 'admin_notes', 'resolved_at'];
  const setClauses = []; 
  const values = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      setClauses.push(`${key} = ?`);
      values.push(fields[key]);
    }
  }
  if (setClauses.length === 0) return getDb().prepare('SELECT * FROM online_deposits WHERE deposit_id = ?').get(depositId);
  values.push(depositId);
  getDb().prepare(`UPDATE online_deposits SET ${setClauses.join(', ')} WHERE deposit_id = ?`).run(...values);
  return getDb().prepare('SELECT * FROM online_deposits WHERE deposit_id = ?').get(depositId);
}

// ── Enhanced Account Summary / Interest ──

function getInterestSummary(accountId) {
  const account = getAccount(accountId);
  if (!account) return null;
  const interestEarned = Number(account.interest_earned) || 0;
  const product = account.savings_product_id ? getSavingsProduct(account.savings_product_id) : null;
  return {
    interest_earned: interestEarned,
    savings_product: product,
    current_balance: account.actual_balance,
    projected_yearly: product ? interestEarned + (Number(account.actual_balance) * Number(product.interest_rate)) : interestEarned,
  };
}

function creditInterest(accountId, amount) {
  const db = getDb();
  const account = getAccount(accountId);
  if (!account) return null;
  const newBalance = Math.round((Number(account.actual_balance) + amount) * 100) / 100;
  const newInterest = Math.round((Number(account.interest_earned) + amount) * 100) / 100;
  db.prepare('UPDATE accounts SET actual_balance = ?, unallocated_balance = unallocated_balance + ?, interest_earned = ?, updated_at = datetime(\'now\') WHERE account_id = ?').run(newBalance, amount, newInterest, accountId);
  addTransaction({
    account_id: accountId,
    type: 'interest',
    amount,
    description: 'Interest credited',
    balance_before: Number(account.actual_balance),
    balance_after: newBalance,
  });
  return { interest_earned: newInterest, new_balance: newBalance };
}

// ── Loans ──

function getLoans(accountId) {
  return getDb().prepare('SELECT * FROM loans WHERE account_id = ? ORDER BY created_at DESC').all(accountId);
}

function getLoan(loanId) {
  return getDb().prepare('SELECT * FROM loans WHERE loan_id = ?').get(loanId) || null;
}

function createLoan(fields) {
  const loan = {
    loan_id: uuidv4(),
    account_id: fields.account_id,
    product_id: fields.product_id || null,
    principal: fields.principal,
    interest_rate: fields.interest_rate,
    interest_type: fields.interest_type || 'flat',
    term_months: fields.term_months,
    monthly_amortization: fields.monthly_amortization,
    total_payable: fields.total_payable,
    amount_paid: 0,
    remaining_balance: fields.total_payable,
    status: 'pending',
    purpose: fields.purpose || '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  getDb().prepare(`
    INSERT INTO loans (loan_id, account_id, product_id, principal, interest_rate, interest_type, term_months, monthly_amortization, total_payable, amount_paid, remaining_balance, status, purpose, created_at, updated_at)
    VALUES (@loan_id, @account_id, @product_id, @principal, @interest_rate, @interest_type, @term_months, @monthly_amortization, @total_payable, @amount_paid, @remaining_balance, @status, @purpose, @created_at, @updated_at)
  `).run(loan);
  return loan;
}

function updateLoan(loanId, fields) {
  const allowed = ['amount_paid', 'remaining_balance', 'status', 'approved_by', 'approved_at', 'disbursed_at'];
  const setClauses = [];
  const values = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      setClauses.push(`${key} = ?`);
      values.push(fields[key]);
    }
  }
  if (setClauses.length === 0) return getLoan(loanId);
  setClauses.push("updated_at = datetime('now')");
  values.push(loanId);
  getDb().prepare(`UPDATE loans SET ${setClauses.join(', ')} WHERE loan_id = ?`).run(...values);
  return getLoan(loanId);
}

// ── Loan Payments ──

function addLoanPayment(fields) {
  const payment = {
    payment_id: uuidv4(),
    loan_id: fields.loan_id,
    amount: fields.amount,
    principal_paid: fields.principal_paid,
    interest_paid: fields.interest_paid,
    balance_before: fields.balance_before,
    balance_after: fields.balance_after,
    due_date: fields.due_date || null,
    paid_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };
  getDb().prepare(`
    INSERT INTO loan_payments (payment_id, loan_id, amount, principal_paid, interest_paid, balance_before, balance_after, due_date, paid_at, created_at)
    VALUES (@payment_id, @loan_id, @amount, @principal_paid, @interest_paid, @balance_before, @balance_after, @due_date, @paid_at, @created_at)
  `).run(payment);
  return payment;
}

function getLoanPayments(loanId) {
  return getDb().prepare('SELECT * FROM loan_payments WHERE loan_id = ? ORDER BY paid_at ASC').all(loanId);
}

// ── Summary / Dashboard ──

function getAccountSummary(accountId) {
  const account = getAccount(accountId);
  if (!account) return null;

  const totalSavings = account.actual_balance || 0;
  const activeLoans = getDb().prepare("SELECT COALESCE(SUM(remaining_balance), 0) as total FROM loans WHERE account_id = ? AND status IN ('approved','active')").get(accountId);
  const totalLoanBalance = activeLoans ? activeLoans.total : 0;

  const recentTxns = getTransactions(accountId, 5, 0);

  return {
    account,
    totalSavings,
    totalLoanBalance,
    netWorth: Math.round((totalSavings - totalLoanBalance) * 100) / 100,
    recentTransactions: recentTxns,
  };
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

function getSetting(key) {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSetting(key, value) {
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

function getFcmToken(accountId) {
  return getDb().prepare('SELECT * FROM fcm_tokens WHERE account_id = ? ORDER BY updated_at DESC').get(accountId) || null;
}

function getFcmTokens(accountId) {
  return getDb().prepare('SELECT * FROM fcm_tokens WHERE account_id = ?').all(accountId);
}

function registerFcmToken(accountId, fcmToken, devicePlatform) {
  const existing = getDb().prepare('SELECT * FROM fcm_tokens WHERE account_id = ? AND fcm_token = ?').get(accountId, fcmToken);
  if (existing) {
    getDb().prepare("UPDATE fcm_tokens SET updated_at = ? WHERE token_id = ?").run(new Date().toISOString(), existing.token_id);
    return existing;
  }
  const token = {
    token_id: uuidv4(),
    account_id: accountId,
    fcm_token: fcmToken,
    device_platform: devicePlatform || '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  getDb().prepare('INSERT INTO fcm_tokens (token_id, account_id, fcm_token, device_platform, created_at, updated_at) VALUES (?,?,?,?,?,?)').run(
    token.token_id, token.account_id, token.fcm_token, token.device_platform, token.created_at, token.updated_at
  );
  return token;
}

function unregisterFcmToken(accountId, fcmToken) {
  getDb().prepare('DELETE FROM fcm_tokens WHERE account_id = ? AND fcm_token = ?').run(accountId, fcmToken);
}

function query(sql, params) {
  const db = getDb();
  const adaptedSql = sql.replace(/\$(\d+)/g, '?');
  const stmt = db.prepare(adaptedSql);
  const rows = stmt.all(...(params || []));
  return { rows };
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
  getStatement,
  getLoanProducts,
  getLoanProduct,
  createLoanProduct,
  updateLoanProduct,
  getSavingsProducts,
  getSavingsProduct,
  createSavingsProduct,
  updateSavingsProduct,
  getLoans,
  getLoan,
  createLoan,
  updateLoan,
  addLoanPayment,
  getLoanPayments,
  getAccountSummary,
  getWithdrawalRequests,
  getWithdrawalRequest,
  createWithdrawalRequest,
  updateWithdrawalRequest,
  getStandingOrders,
  getStandingOrder,
  createStandingOrder,
  updateStandingOrder,
  deleteStandingOrder,
  getSavingsApplications,
  createSavingsApplication,
  updateSavingsApplication,
  getOnlineDeposits,
  getOnlineDeposit,
  createOnlineDeposit,
  updateOnlineDeposit,
  getInterestSummary,
  creditInterest,
  getSetting,
  setSetting,
  getFcmToken,
  getFcmTokens,
  registerFcmToken,
  unregisterFcmToken,
  query,
  getQuizQuestions,
  getQuizQuestion,
  createQuizQuestion,
  updateQuizQuestion,
  deleteQuizQuestion,
  close,
};
