const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

class PgStore {
  constructor(connectionString) {
    const clean = connectionString.replace(/\?sslmode=require$/, '');
    const isLocal = connectionString.includes('@localhost') || connectionString.includes('@127.0.0.1') || connectionString.includes('@0.0.0.0');
    const ssl = isLocal ? false : { rejectUnauthorized: false };
    this.pool = new Pool({ connectionString: clean, max: 10, ssl });
    this._initialized = false;
  }

  async _ensureSchema() {
    if (this._initialized) return;
    this._initialized = true;
    const schema = `
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
        is_active INTEGER DEFAULT 1,
        created_at TEXT,
        updated_at TEXT
      );
      ALTER TABLE accounts ADD COLUMN IF NOT EXISTS is_active INTEGER DEFAULT 1;
      ALTER TABLE accounts ADD COLUMN IF NOT EXISTS last_name VARCHAR(100) DEFAULT '';
      ALTER TABLE accounts ADD COLUMN IF NOT EXISTS first_name VARCHAR(100) DEFAULT '';
      ALTER TABLE accounts ADD COLUMN IF NOT EXISTS middle_name VARCHAR(100) DEFAULT '';
      ALTER TABLE accounts ADD COLUMN IF NOT EXISTS age INTEGER DEFAULT 0;
      ALTER TABLE accounts ADD COLUMN IF NOT EXISTS birthday VARCHAR(10) DEFAULT '';
      ALTER TABLE accounts ADD COLUMN IF NOT EXISTS gender VARCHAR(10) DEFAULT '';
      ALTER TABLE accounts ADD COLUMN IF NOT EXISTS savings_schedule VARCHAR(50) DEFAULT '';
      ALTER TABLE accounts ADD COLUMN IF NOT EXISTS photo_2x2_url TEXT DEFAULT '';
      ALTER TABLE accounts ADD COLUMN IF NOT EXISTS birth_cert_url TEXT DEFAULT '';
      ALTER TABLE accounts ADD COLUMN IF NOT EXISTS id_photo_url TEXT DEFAULT '';
      ALTER TABLE accounts ADD COLUMN IF NOT EXISTS profile_pic_url TEXT DEFAULT '';
      CREATE TABLE IF NOT EXISTS goal_jars (
        goal_id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        target_amount DECIMAL(12,2) NOT NULL,
        current_allocated DECIMAL(12,2) DEFAULT 0,
        category_icon VARCHAR(100) DEFAULT 'savings',
        is_completed INTEGER DEFAULT 0,
        created_at TEXT,
        updated_at TEXT
      );
      CREATE TABLE IF NOT EXISTS badges (
        badge_id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        icon_url VARCHAR(500),
        required_xp INTEGER NOT NULL,
        is_unlocked INTEGER DEFAULT 0,
        unlocked_at TEXT,
        created_at TEXT
      );
      CREATE TABLE IF NOT EXISTS transactions (
        transaction_id TEXT PRIMARY KEY,
        trn_number INTEGER UNIQUE,
        account_id TEXT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
        goal_id TEXT REFERENCES goal_jars(goal_id) ON DELETE SET NULL,
        type VARCHAR(50) NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        balance_before DECIMAL(12,2),
        balance_after DECIMAL(12,2),
        description TEXT DEFAULT '',
        reference_type VARCHAR(50),
        reference_id TEXT,
        created_at TEXT
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
      CREATE TABLE IF NOT EXISTS archived_transactions (
        archive_id TEXT PRIMARY KEY,
        transaction_id TEXT,
        trn_number INTEGER,
        account_id TEXT,
        type VARCHAR(50),
        amount DECIMAL(12,2),
        description TEXT,
        reference_type VARCHAR(50),
        reference_id TEXT,
        original_created_at TEXT,
        archived_at TEXT,
        year INTEGER
      );
      CREATE TABLE IF NOT EXISTS backup_logs (
        backup_id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        file_size INTEGER DEFAULT 0,
        checksum TEXT,
        table_count INTEGER DEFAULT 0,
        row_count INTEGER DEFAULT 0,
        status TEXT DEFAULT 'completed',
        notes TEXT DEFAULT '',
        created_by TEXT,
        created_at TEXT
      );
      CREATE TABLE IF NOT EXISTS shop_items (
        id TEXT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL,
        cost DECIMAL(10,2) DEFAULT 0,
        emoji VARCHAR(50) DEFAULT '',
        rarity VARCHAR(50) DEFAULT 'Common',
        color1 VARCHAR(20) DEFAULT '#2E7D32',
        color2 VARCHAR(20) DEFAULT '#2E7D32',
        image_url TEXT DEFAULT '',
        is_active INTEGER DEFAULT 1,
        updated_at TEXT
      );
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
        updated_at TEXT
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
      CREATE TABLE IF NOT EXISTS savings_applications (
        application_id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        admin_notes TEXT DEFAULT '',
        created_at TEXT,
        resolved_at TEXT
      );
      CREATE TABLE IF NOT EXISTS gl_accounts (
        code TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('asset','liability','equity','income','expense')),
        is_active INTEGER DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS gl_entries (
        entry_id TEXT PRIMARY KEY,
        transaction_id TEXT,
        account_code TEXT NOT NULL REFERENCES gl_accounts(code),
        debit DECIMAL(12,2) DEFAULT 0,
        credit DECIMAL(12,2) DEFAULT 0,
        description TEXT DEFAULT '',
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
      CREATE TABLE IF NOT EXISTS fcm_tokens (
        token_id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
        fcm_token TEXT NOT NULL,
        device_platform VARCHAR(20) DEFAULT '',
        created_at TEXT,
        updated_at TEXT
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL DEFAULT ''
      );
      INSERT INTO settings (key, value) VALUES ('gcash_number', '09171234567') ON CONFLICT (key) DO NOTHING;
      INSERT INTO settings (key, value) VALUES ('gcash_name', 'LabCoop Savings') ON CONFLICT (key) DO NOTHING;
    `;
    await this.pool.query(schema);
    // Migrations for existing tables
    await this.pool.query("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS trn_number INTEGER").catch(() => {});
    await this.pool.query("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS voided_by TEXT").catch(() => {});
    await this.pool.query("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS void_reason TEXT").catch(() => {});
    await this.pool.query("ALTER TABLE transactions ADD COLUMN IF NOT EXISTS voided_at TEXT").catch(() => {});
    await this.pool.query("ALTER TABLE gl_entries ADD COLUMN IF NOT EXISTS is_voided INTEGER DEFAULT 0").catch(() => {});
    await this.pool.query("ALTER TABLE gl_entries ADD COLUMN IF NOT EXISTS voided_by TEXT").catch(() => {});
    await this.pool.query("ALTER TABLE gl_entries ADD COLUMN IF NOT EXISTS void_reason TEXT").catch(() => {});
    await this.pool.query("ALTER TABLE gl_entries ADD COLUMN IF NOT EXISTS voided_at TEXT").catch(() => {});
    await this.pool.query("ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS email TEXT DEFAULT ''").catch(() => {});
    await this._seedGlAccounts();
  }

  async _seedGlAccounts() {
    const existing = await this.pool.query("SELECT COUNT(*) as c FROM gl_accounts");
    if (Number(existing.rows[0].c) > 0) return;
    const accounts = [
      ['1000', 'Cash on Hand', 'asset'],
      ['1100', 'Loans Receivable', 'asset'],
      ['1200', 'Accrued Interest', 'asset'],
      ['2000', 'Savings Deposits', 'liability'],
      ['2100', 'Time Deposits', 'liability'],
      ['2200', 'Interest Payable', 'liability'],
      ['3000', 'Share Capital', 'equity'],
      ['3100', 'Retained Earnings', 'equity'],
      ['4000', 'Interest Income', 'income'],
      ['4100', 'Fee Income', 'income'],
      ['5000', 'Interest Expense', 'expense'],
    ];
    for (const [code, name, type] of accounts) {
      await this.pool.query(
        'INSERT INTO gl_accounts (code, name, type) VALUES ($1,$2,$3) ON CONFLICT (code) DO NOTHING',
        [code, name, type]
      );
    }
  }

  async query(sql, params = []) {
    const client = await this.pool.connect();
    try {
      if (params && params.length > 0 && sql.includes('?')) {
        let idx = 1;
        sql = sql.replace(/\?/g, () => `$${idx++}`);
      }
      const result = await client.query(sql, params);
      return result;
    } finally {
      client.release();
    }
  }

  _rowToCamel(row) {
    if (!row) return null;
    const out = {};
    for (const [k, v] of Object.entries(row)) {
      out[k] = v;
    }
    return out;
  }

  _rowsToList(rows) {
    return rows.map(r => this._rowToCamel(r));
  }

  async getDb() {
    await this._ensureSchema();
    return this;
  }

  async getAccount(accountId) {
    const res = await this.query('SELECT * FROM accounts WHERE account_id = $1', [accountId]);
    return res.rows[0] || null;
  }

  async getAccountByName(childName) {
    const res = await this.query('SELECT * FROM accounts WHERE child_name = $1', [childName.trim()]);
    return res.rows[0] || null;
  }

  async createAccount(fields) {
    const birthday = fields.birthday || '';
    const computedAge = birthday ? this._computeAge(birthday) : (fields.age || 0);
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
      birthday: birthday,
      age: computedAge,
      gender: fields.gender || '',
      savings_schedule: fields.savings_schedule || '',
      photo_2x2_url: fields.photo_2x2_url || '',
      birth_cert_url: fields.birth_cert_url || '',
      id_photo_url: fields.id_photo_url || '',
      profile_pic_url: fields.profile_pic_url || '',
      is_active: fields.is_active ?? 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await this.query(`
      INSERT INTO accounts (account_id, child_name, member_id, password, password_changed, actual_balance, unallocated_balance, current_xp, parent_phone, last_name, first_name, middle_name, birthday, age, gender, savings_schedule, photo_2x2_url, birth_cert_url, id_photo_url, profile_pic_url, is_active, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
    `, [
      account.account_id, account.child_name, account.member_id,
      account.password, account.password_changed, account.actual_balance,
      account.unallocated_balance, account.current_xp, account.parent_phone,
      account.last_name, account.first_name, account.middle_name,
      account.birthday, account.age, account.gender, account.savings_schedule,
      account.photo_2x2_url, account.birth_cert_url, account.id_photo_url,
      account.profile_pic_url,
      account.is_active, account.created_at, account.updated_at,
    ]);
    return account;
  }

  _computeAge(birthday) {
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

  async updateAccount(accountId, fields) {
    const allowed = ['actual_balance', 'unallocated_balance', 'current_xp', 'child_name', 'parent_phone', 'last_name', 'first_name', 'middle_name', 'birthday', 'age', 'gender', 'savings_schedule', 'photo_2x2_url', 'birth_cert_url', 'id_photo_url', 'profile_pic_url', 'is_active'];
    const setClauses = [];
    const values = [];
    let idx = 1;

    if (fields.birthday !== undefined && fields.birthday) {
      fields.age = this._computeAge(fields.birthday);
    }

    for (const key of allowed) {
      if (fields[key] !== undefined) {
        setClauses.push(`${key} = $${idx++}`);
        values.push(fields[key]);
      }
    }
    if (setClauses.length === 0) return this.getAccount(accountId);
    setClauses.push(`updated_at = $${idx++}`);
    values.push(new Date().toISOString());
    values.push(accountId);
    await this.query(`UPDATE accounts SET ${setClauses.join(', ')} WHERE account_id = $${idx}`, values);
    return this.getAccount(accountId);
  }

  async getGoals(accountId) {
    const res = await this.query('SELECT * FROM goal_jars WHERE account_id = $1 ORDER BY created_at ASC', [accountId]);
    return res.rows;
  }

  async getGoal(goalId) {
    const res = await this.query('SELECT * FROM goal_jars WHERE goal_id = $1', [goalId]);
    return res.rows[0] || null;
  }

  async createGoal(goal) {
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
    await this.query(`
      INSERT INTO goal_jars (goal_id, account_id, title, target_amount, current_allocated, category_icon, is_completed, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    `, [
      newGoal.goal_id, newGoal.account_id, newGoal.title,
      newGoal.target_amount, newGoal.current_allocated, newGoal.category_icon,
      newGoal.is_completed, newGoal.created_at, newGoal.updated_at,
    ]);
    return newGoal;
  }

  async updateGoal(goalId, fields) {
    const allowed = ['current_allocated', 'title', 'target_amount', 'category_icon'];
    const setClauses = [];
    const values = [];
    let idx = 1;
    for (const key of allowed) {
      if (fields[key] !== undefined) {
        setClauses.push(`${key} = $${idx++}`);
        values.push(fields[key]);
      }
    }
    if (setClauses.length === 0) return this.getGoal(goalId);
    setClauses.push(`updated_at = $${idx++}`);
    values.push(new Date().toISOString());
    values.push(goalId);
    await this.query(`UPDATE goal_jars SET ${setClauses.join(', ')} WHERE goal_id = $${idx}`, values);
    const updated = await this.getGoal(goalId);
    if (updated) {
      const completed = Number(updated.current_allocated) >= Number(updated.target_amount) ? 1 : 0;
      await this.query('UPDATE goal_jars SET is_completed = $1 WHERE goal_id = $2', [completed, goalId]);
      updated.is_completed = completed;
    }
    return updated;
  }

  async deleteGoal(goalId) {
    await this.query('DELETE FROM goal_jars WHERE goal_id = $1', [goalId]);
  }

  async getBadges(accountId) {
    const res = await this.query('SELECT * FROM badges WHERE account_id = $1 ORDER BY created_at ASC', [accountId]);
    return res.rows;
  }

  async createBadge(fields) {
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
    await this.query(`
      INSERT INTO badges (badge_id, account_id, name, description, icon_url, required_xp, is_unlocked, unlocked_at, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    `, [
      newBadge.badge_id, newBadge.account_id, newBadge.name,
      newBadge.description, newBadge.icon_url, newBadge.required_xp,
      newBadge.is_unlocked, newBadge.unlocked_at, newBadge.created_at,
    ]);
    return newBadge;
  }

  async updateBadge(badgeId, fields) {
    const allowed = ['name', 'description', 'icon_url', 'required_xp', 'is_unlocked'];
    const setClauses = [];
    const values = [];
    let idx = 1;
    for (const key of allowed) {
      if (fields[key] !== undefined) {
        setClauses.push(`${key} = $${idx++}`);
        values.push(fields[key]);
      }
    }
    if (fields.is_unlocked !== undefined) {
      if (fields.is_unlocked) {
        setClauses.push(`unlocked_at = COALESCE(unlocked_at, $${idx++})`);
        values.push(new Date().toISOString());
      } else {
        setClauses.push(`unlocked_at = NULL`);
      }
    }
    if (setClauses.length === 0) return null;
    values.push(badgeId);
    await this.query(`UPDATE badges SET ${setClauses.join(', ')} WHERE badge_id = $${idx}`, values);
    const res = await this.query('SELECT * FROM badges WHERE badge_id = $1', [badgeId]);
    return res.rows[0] || null;
  }

  async unlockBadges(accountId, currentXp) {
    const res = await this.query(
      'SELECT * FROM badges WHERE account_id = $1 AND is_unlocked = 0 AND required_xp <= $2',
      [accountId, currentXp]
    );
    const now = new Date().toISOString();
    for (const badge of res.rows) {
      await this.query('UPDATE badges SET is_unlocked = 1, unlocked_at = $1 WHERE badge_id = $2', [now, badge.badge_id]);
      badge.is_unlocked = 1;
      badge.unlocked_at = now;
    }
    return res.rows;
  }

  async deleteBadge(badgeId) {
    await this.query('DELETE FROM badges WHERE badge_id = $1', [badgeId]);
  }

  async addTransaction(tx) {
    const account = await this.getAccount(tx.account_id);
    const currentBalance = account ? Number(account.actual_balance) : 0;
    let balanceAfter = currentBalance;
    if (['deposit', 'interest_credit', 'loan_disbursement'].includes(tx.type)) {
      balanceAfter = Math.round((currentBalance + Number(tx.amount)) * 100) / 100;
    } else if (['withdrawal', 'loan_payment', 'fee'].includes(tx.type)) {
      balanceAfter = Math.round((currentBalance - Number(tx.amount)) * 100) / 100;
    }
    const year = new Date().getFullYear();
    const seq = await this.query(
      `INSERT INTO sequences (name, year, value) VALUES ('trn', $1, 1)
       ON CONFLICT (name, year) DO UPDATE SET value = sequences.value + 1
       RETURNING value`,
      [year]
    );
    const trnNumber = Number(seq.rows[0].value);
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
    await this.query(`
      INSERT INTO transactions (transaction_id, trn_number, account_id, goal_id, type, amount, balance_before, balance_after, description, reference_type, reference_id, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    `, [
      newTx.transaction_id, newTx.trn_number, newTx.account_id, newTx.goal_id,
      newTx.type, newTx.amount, newTx.balance_before, newTx.balance_after,
      newTx.description, newTx.reference_type, newTx.reference_id, newTx.created_at,
    ]);
    return newTx;
  }

  async getTransactions(accountId, limit = 50, offset = 0) {
    const res = await this.query(
      'SELECT * FROM transactions WHERE account_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [accountId, Number(limit), Number(offset)]
    );
    return res.rows;
  }

  async getStatement(accountId, limit = 100, offset = 0) {
    const res = await this.query(
      'SELECT * FROM transactions WHERE account_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [accountId, Number(limit), Number(offset)]
    );
    return res.rows;
  }

  async getLoanProducts(includeInactive) {
    const sql = includeInactive
      ? 'SELECT * FROM loan_products ORDER BY min_amount ASC'
      : 'SELECT * FROM loan_products WHERE is_active = 1 ORDER BY min_amount ASC';
    const res = await this.query(sql);
    return res.rows;
  }

  async getLoanProduct(productId) {
    const res = await this.query('SELECT * FROM loan_products WHERE product_id = $1', [productId]);
    return res.rows[0] || null;
  }

  async createLoanProduct(fields) {
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
    await this.query(`
      INSERT INTO loan_products (product_id, name, description, interest_rate, interest_type, min_amount, max_amount, min_term, max_term, is_active, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    `, [
      product.product_id, product.name, product.description,
      product.interest_rate, product.interest_type, product.min_amount,
      product.max_amount, product.min_term, product.max_term,
      product.is_active, product.created_at,
    ]);
    return product;
  }

  async updateLoanProduct(productId, fields) {
    const existing = await this.getLoanProduct(productId);
    if (!existing) return null;
    const allowed = ['name', 'description', 'interest_rate', 'interest_type', 'min_amount', 'max_amount', 'min_term', 'max_term', 'is_active'];
    const setClauses = [];
    const values = [];
    let idx = 1;
    for (const key of allowed) {
      if (fields[key] !== undefined) {
        setClauses.push(`${key} = $${idx++}`);
        values.push(fields[key]);
      }
    }
    if (setClauses.length === 0) return existing;
    values.push(productId);
    await this.query(`UPDATE loan_products SET ${setClauses.join(', ')} WHERE product_id = $${idx}`, values);
    return this.getLoanProduct(productId);
  }

  async getSavingsProducts(includeInactive) {
    const sql = includeInactive
      ? 'SELECT * FROM savings_products ORDER BY name ASC'
      : 'SELECT * FROM savings_products WHERE is_active = 1 ORDER BY name ASC';
    const res = await this.query(sql);
    return res.rows;
  }

  async getSavingsProduct(productId) {
    const res = await this.query('SELECT * FROM savings_products WHERE product_id = $1', [productId]);
    return res.rows[0] || null;
  }

  async createSavingsProduct(fields) {
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
    await this.query(`
      INSERT INTO savings_products (product_id, name, description, interest_rate, interest_frequency, min_balance, withdrawal_limit, is_active, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    `, [
      product.product_id, product.name, product.description,
      product.interest_rate, product.interest_frequency, product.min_balance,
      product.withdrawal_limit, product.is_active, product.created_at,
    ]);
    return product;
  }

  async updateSavingsProduct(productId, fields) {
    const existing = await this.getSavingsProduct(productId);
    if (!existing) return null;
    const allowed = ['name', 'description', 'interest_rate', 'interest_frequency', 'min_balance', 'withdrawal_limit', 'is_active'];
    const setClauses = [];
    const values = [];
    let idx = 1;
    for (const key of allowed) {
      if (fields[key] !== undefined) {
        setClauses.push(`${key} = $${idx++}`);
        values.push(fields[key]);
      }
    }
    if (setClauses.length === 0) return existing;
    values.push(productId);
    await this.query(`UPDATE savings_products SET ${setClauses.join(', ')} WHERE product_id = $${idx}`, values);
    return this.getSavingsProduct(productId);
  }

  async getLoans(accountId) {
    const res = await this.query('SELECT * FROM loans WHERE account_id = $1 ORDER BY created_at DESC', [accountId]);
    return res.rows;
  }

  async getLoan(loanId) {
    const res = await this.query('SELECT * FROM loans WHERE loan_id = $1', [loanId]);
    return res.rows[0] || null;
  }

  async createLoan(fields) {
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
    await this.query(`
      INSERT INTO loans (loan_id, account_id, product_id, principal, interest_rate, interest_type, term_months, monthly_amortization, total_payable, amount_paid, remaining_balance, status, purpose, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
    `, [
      loan.loan_id, loan.account_id, loan.product_id,
      loan.principal, loan.interest_rate, loan.interest_type,
      loan.term_months, loan.monthly_amortization, loan.total_payable,
      loan.amount_paid, loan.remaining_balance, loan.status,
      loan.purpose, loan.created_at, loan.updated_at,
    ]);
    return loan;
  }

  async updateLoan(loanId, fields) {
    const allowed = ['amount_paid', 'remaining_balance', 'status', 'approved_by', 'approved_at', 'disbursed_at'];
    const setClauses = [];
    const values = [];
    let idx = 1;
    for (const key of allowed) {
      if (fields[key] !== undefined) {
        setClauses.push(`${key} = $${idx++}`);
        values.push(fields[key]);
      }
    }
    if (setClauses.length === 0) return this.getLoan(loanId);
    setClauses.push(`updated_at = $${idx++}`);
    values.push(new Date().toISOString());
    values.push(loanId);
    await this.query(`UPDATE loans SET ${setClauses.join(', ')} WHERE loan_id = $${idx}`, values);
    return this.getLoan(loanId);
  }

  async addLoanPayment(fields) {
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
    await this.query(`
      INSERT INTO loan_payments (payment_id, loan_id, amount, principal_paid, interest_paid, balance_before, balance_after, due_date, paid_at, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    `, [
      payment.payment_id, payment.loan_id, payment.amount,
      payment.principal_paid, payment.interest_paid, payment.balance_before,
      payment.balance_after, payment.due_date, payment.paid_at, payment.created_at,
    ]);
    return payment;
  }

  async getLoanPayments(loanId) {
    const res = await this.query('SELECT * FROM loan_payments WHERE loan_id = $1 ORDER BY paid_at ASC', [loanId]);
    return res.rows;
  }

  async getAccountSummary(accountId) {
    const account = await this.getAccount(accountId);
    if (!account) return null;
    const totalSavings = Number(account.actual_balance) || 0;
    const activeLoans = await this.query(
      "SELECT COALESCE(SUM(remaining_balance), 0) as total FROM loans WHERE account_id = $1 AND status IN ('approved','active')",
      [accountId]
    );
    const totalLoanBalance = activeLoans.rows[0] ? Number(activeLoans.rows[0].total) : 0;
    const recentTxns = await this.getTransactions(accountId, 5, 0);
    return {
      account,
      totalSavings,
      totalLoanBalance,
      netWorth: Math.round((totalSavings - totalLoanBalance) * 100) / 100,
      recentTransactions: recentTxns,
    };
  }

  async getWithdrawalRequests(accountId) {
    if (accountId) {
      const res = await this.query('SELECT * FROM withdrawal_requests WHERE account_id = $1 ORDER BY created_at DESC', [accountId]);
      return res.rows;
    }
    const res = await this.query('SELECT w.*, a.child_name FROM withdrawal_requests w LEFT JOIN accounts a ON w.account_id = a.account_id ORDER BY w.created_at DESC');
    return res.rows;
  }

  async getWithdrawalRequest(requestId) {
    const res = await this.query('SELECT * FROM withdrawal_requests WHERE request_id = $1', [requestId]);
    return res.rows[0] || null;
  }

  async createWithdrawalRequest(fields) {
    const req = {
      request_id: uuidv4(),
      account_id: fields.account_id,
      amount: Number(fields.amount),
      reason: fields.reason || '',
      status: 'pending',
      admin_notes: '',
      created_at: new Date().toISOString(),
    };
    await this.query(`
      INSERT INTO withdrawal_requests (request_id, account_id, amount, reason, status, admin_notes, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
    `, [
      req.request_id, req.account_id, req.amount,
      req.reason, req.status, req.admin_notes, req.created_at,
    ]);
    return req;
  }

  async updateWithdrawalRequest(requestId, fields) {
    const allowed = ['status', 'admin_notes', 'resolved_at'];
    const setClauses = [];
    const values = [];
    let idx = 1;
    for (const key of allowed) {
      if (fields[key] !== undefined) {
        setClauses.push(`${key} = $${idx++}`);
        values.push(fields[key]);
      }
    }
    if (setClauses.length === 0) {
      const r = await this.query('SELECT * FROM withdrawal_requests WHERE request_id = $1', [requestId]);
      return r.rows[0] || null;
    }
    values.push(requestId);
    await this.query(`UPDATE withdrawal_requests SET ${setClauses.join(', ')} WHERE request_id = $${idx}`, values);
    const r = await this.query('SELECT * FROM withdrawal_requests WHERE request_id = $1', [requestId]);
    return r.rows[0] || null;
  }

  async getStandingOrders(accountId) {
    const res = await this.query('SELECT * FROM standing_orders WHERE account_id = $1 ORDER BY created_at DESC', [accountId]);
    return res.rows;
  }

  async getStandingOrder(orderId) {
    const res = await this.query('SELECT * FROM standing_orders WHERE order_id = $1', [orderId]);
    return res.rows[0] || null;
  }

  async createStandingOrder(fields) {
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
    await this.query(`
      INSERT INTO standing_orders (order_id, account_id, type, target_goal_id, amount, frequency, next_run, is_active, description, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    `, [
      order.order_id, order.account_id, order.type,
      order.target_goal_id, order.amount, order.frequency,
      order.next_run, order.is_active, order.description,
      order.created_at, order.updated_at,
    ]);
    return order;
  }

  async updateStandingOrder(orderId, fields) {
    const allowed = ['amount', 'frequency', 'next_run', 'is_active', 'description', 'target_goal_id'];
    const setClauses = [];
    const values = [];
    let idx = 1;
    for (const key of allowed) {
      if (fields[key] !== undefined) {
        setClauses.push(`${key} = $${idx++}`);
        values.push(fields[key]);
      }
    }
    if (setClauses.length === 0) return this.getStandingOrder(orderId);
    setClauses.push(`updated_at = $${idx++}`);
    values.push(new Date().toISOString());
    values.push(orderId);
    await this.query(`UPDATE standing_orders SET ${setClauses.join(', ')} WHERE order_id = $${idx}`, values);
    return this.getStandingOrder(orderId);
  }

  async deleteStandingOrder(orderId) {
    await this.query("UPDATE standing_orders SET is_active = 0, updated_at = $1 WHERE order_id = $2", [new Date().toISOString(), orderId]);
  }

  async getSavingsApplications(accountId) {
    if (accountId) {
      const res = await this.query('SELECT * FROM savings_applications WHERE account_id = $1 ORDER BY created_at DESC', [accountId]);
      return res.rows;
    }
    const res = await this.query(`
      SELECT sa.*, a.child_name, sp.name as product_name
      FROM savings_applications sa
      LEFT JOIN accounts a ON sa.account_id = a.account_id
      LEFT JOIN savings_products sp ON sa.product_id = sp.product_id
      ORDER BY sa.created_at DESC
    `);
    return res.rows;
  }

  async createSavingsApplication(fields) {
    const app = {
      application_id: uuidv4(),
      account_id: fields.account_id,
      product_id: fields.product_id,
      status: 'pending',
      admin_notes: '',
      created_at: new Date().toISOString(),
    };
    await this.query(`
      INSERT INTO savings_applications (application_id, account_id, product_id, status, admin_notes, created_at)
      VALUES ($1,$2,$3,$4,$5,$6)
    `, [
      app.application_id, app.account_id, app.product_id,
      app.status, app.admin_notes, app.created_at,
    ]);
    return app;
  }

  async updateSavingsApplication(applicationId, fields) {
    const allowed = ['status', 'admin_notes', 'resolved_at'];
    const setClauses = [];
    const values = [];
    let idx = 1;
    for (const key of allowed) {
      if (fields[key] !== undefined) {
        setClauses.push(`${key} = $${idx++}`);
        values.push(fields[key]);
      }
    }
    if (setClauses.length === 0) {
      const r = await this.query('SELECT * FROM savings_applications WHERE application_id = $1', [applicationId]);
      return r.rows[0] || null;
    }
    values.push(applicationId);
    await this.query(`UPDATE savings_applications SET ${setClauses.join(', ')} WHERE application_id = $${idx}`, values);
    const r = await this.query('SELECT * FROM savings_applications WHERE application_id = $1', [applicationId]);
    return r.rows[0] || null;
  }

  async getOnlineDeposits(accountId) {
    if (accountId) {
      const r = await this.query('SELECT * FROM online_deposits WHERE account_id = $1 ORDER BY created_at DESC', [accountId]);
      return r.rows;
    }
    const r = await this.query('SELECT d.*, a.child_name FROM online_deposits d LEFT JOIN accounts a ON d.account_id = a.account_id ORDER BY d.created_at DESC');
    return r.rows;
  }

  async getOnlineDeposit(depositId) {
    const r = await this.query('SELECT * FROM online_deposits WHERE deposit_id = $1', [depositId]);
    return r.rows[0] || null;
  }

  async createOnlineDeposit(fields) {
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
    await this.query(
      `INSERT INTO online_deposits (deposit_id, account_id, amount, reference_number, sender_name, payment_method, status, admin_notes, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [deposit.deposit_id, deposit.account_id, deposit.amount, deposit.reference_number, deposit.sender_name, deposit.payment_method, deposit.status, deposit.admin_notes, deposit.created_at]
    );
    return deposit;
  }

  async updateOnlineDeposit(depositId, fields) {
    const allowed = ['status', 'admin_notes', 'resolved_at'];
    const setClauses = [];
    const values = [];
    let idx = 1;
    for (const key of allowed) {
      if (fields[key] !== undefined) {
        setClauses.push(`${key} = $${idx++}`);
        values.push(fields[key]);
      }
    }
    if (setClauses.length === 0) {
      const r = await this.query('SELECT * FROM online_deposits WHERE deposit_id = $1', [depositId]);
      return r.rows[0] || null;
    }
    values.push(depositId);
    await this.query(`UPDATE online_deposits SET ${setClauses.join(', ')} WHERE deposit_id = $${idx}`, values);
    const r = await this.query('SELECT * FROM online_deposits WHERE deposit_id = $1', [depositId]);
    return r.rows[0] || null;
  }

  async getInterestSummary(accountId) {
    const account = await this.getAccount(accountId);
    if (!account) return null;
    const interestEarned = Number(account.interest_earned) || 0;
    const product = account.savings_product_id ? await this.getSavingsProduct(account.savings_product_id) : null;
    return {
      interest_earned: interestEarned,
      savings_product: product,
      current_balance: Number(account.actual_balance),
      projected_yearly: product
        ? interestEarned + (Number(account.actual_balance) * Number(product.interest_rate))
        : interestEarned,
    };
  }

  async creditInterest(accountId, amount) {
    const account = await this.getAccount(accountId);
    if (!account) return null;
    const newBalance = Math.round((Number(account.actual_balance) + amount) * 100) / 100;
    const newInterest = Math.round((Number(account.interest_earned) + amount) * 100) / 100;
    await this.query(
      'UPDATE accounts SET actual_balance = $1, unallocated_balance = unallocated_balance + $2, interest_earned = $3, updated_at = $4 WHERE account_id = $5',
      [newBalance, amount, newInterest, new Date().toISOString(), accountId]
    );
    await this.addTransaction({
      account_id: accountId,
      type: 'interest',
      amount,
      description: 'Interest credited',
      balance_before: Number(account.actual_balance),
      balance_after: newBalance,
    });
    return { interest_earned: newInterest, new_balance: newBalance };
  }

  async getQuizQuestions(difficulty) {
    if (difficulty) {
      const res = await this.query(
        'SELECT * FROM quiz_questions WHERE difficulty_level = $1 AND is_active = 1 ORDER BY category',
        [difficulty]
      );
      return res.rows;
    }
    const res = await this.query('SELECT * FROM quiz_questions WHERE is_active = 1 ORDER BY difficulty_level, category');
    return res.rows;
  }

  async getQuizQuestion(id) {
    const res = await this.query('SELECT * FROM quiz_questions WHERE id = $1', [id]);
    return res.rows[0] || null;
  }

  async createQuizQuestion(fields) {
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
    await this.query(`
      INSERT INTO quiz_questions (id, question, options, correct_index, explanation, category, difficulty_level, xp_reward, coin_reward, is_active)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,1)
    `, [
      q.id, q.question, q.options, q.correct_index, q.explanation,
      q.category, q.difficulty_level, q.xp_reward, q.coin_reward,
    ]);
    return this.getQuizQuestion(q.id);
  }

  async updateQuizQuestion(id, fields) {
    const allowed = ['question', 'options', 'correct_index', 'explanation', 'category', 'difficulty_level', 'xp_reward', 'coin_reward', 'is_active'];
    const setClauses = [];
    const values = [];
    let idx = 1;
    for (const key of allowed) {
      if (fields[key] !== undefined) {
        let val = fields[key];
        if (key === 'options' && Array.isArray(val)) val = JSON.stringify(val);
        setClauses.push(`${key} = $${idx++}`);
        values.push(val);
      }
    }
    if (setClauses.length === 0) return this.getQuizQuestion(id);
    values.push(id);
    await this.query(`UPDATE quiz_questions SET ${setClauses.join(', ')} WHERE id = $${idx}`, values);
    return this.getQuizQuestion(id);
  }

  async deleteQuizQuestion(id) {
    await this.query('DELETE FROM quiz_questions WHERE id = $1', [id]);
  }

  async getFcmToken(accountId) {
    const res = await this.query('SELECT * FROM fcm_tokens WHERE account_id = $1 ORDER BY updated_at DESC', [accountId]);
    return res.rows[0] || null;
  }

  async getFcmTokens(accountId) {
    const res = await this.query('SELECT * FROM fcm_tokens WHERE account_id = $1', [accountId]);
    return res.rows;
  }

  async registerFcmToken(accountId, fcmToken, devicePlatform) {
    const existing = await this.query(
      'SELECT * FROM fcm_tokens WHERE account_id = $1 AND fcm_token = $2',
      [accountId, fcmToken]
    );
    if (existing.rows.length > 0) {
      await this.query(
        'UPDATE fcm_tokens SET updated_at = $1 WHERE token_id = $2',
        [new Date().toISOString(), existing.rows[0].token_id]
      );
      return existing.rows[0];
    }
    const token = {
      token_id: uuidv4(),
      account_id: accountId,
      fcm_token: fcmToken,
      device_platform: devicePlatform || '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await this.query(
      'INSERT INTO fcm_tokens (token_id, account_id, fcm_token, device_platform, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6)',
      [token.token_id, token.account_id, token.fcm_token, token.device_platform, token.created_at, token.updated_at]
    );
    return token;
  }

  async unregisterFcmToken(accountId, fcmToken) {
    await this.query(
      'DELETE FROM fcm_tokens WHERE account_id = $1 AND fcm_token = $2',
      [accountId, fcmToken]
    );
  }

  async transaction(fn) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn({
        query: (sql, params) => client.query(sql, params),
      });
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async close() {
    await this.pool.end();
  }

  async getSetting(key) {
    const res = await this.query('SELECT value FROM settings WHERE key = $1', [key]);
    return res.rows[0] ? res.rows[0].value : null;
  }

  async setSetting(key, value) {
    await this.query(
      'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
      [key, value]
    );
  }

  getPool() {
    return this.pool;
  }
}

module.exports = PgStore;
