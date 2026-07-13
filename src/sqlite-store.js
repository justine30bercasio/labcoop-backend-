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
      CREATE TABLE IF NOT EXISTS accounts (account_id TEXT PRIMARY KEY, child_name VARCHAR(255) NOT NULL, member_id VARCHAR(20), password VARCHAR(255) DEFAULT '', password_changed INTEGER DEFAULT 0, actual_balance DECIMAL(12,2) DEFAULT 0, unallocated_balance DECIMAL(12,2) DEFAULT 0, current_xp INTEGER DEFAULT 0, parent_phone VARCHAR(20) DEFAULT '', interest_earned DECIMAL(12,2) DEFAULT 0, savings_product_id TEXT, last_name VARCHAR(100) DEFAULT '', first_name VARCHAR(100) DEFAULT '', middle_name VARCHAR(100) DEFAULT '', age INTEGER DEFAULT 0, birthday VARCHAR(10) DEFAULT '', gender VARCHAR(10) DEFAULT '', savings_schedule VARCHAR(50) DEFAULT '', photo_2x2_url TEXT DEFAULT '', birth_cert_url TEXT DEFAULT '', id_photo_url TEXT DEFAULT '', kyc_status TEXT DEFAULT '', selfie_url TEXT DEFAULT '', kyc_submitted_at TEXT DEFAULT '', kyc_verified_at TEXT DEFAULT '', kyc_rejected_reason TEXT DEFAULT '', is_active INTEGER DEFAULT 1, failed_login_attempts INTEGER DEFAULT 0, locked_until TEXT, created_at TEXT, updated_at TEXT, pin_hash VARCHAR(255) DEFAULT '', parent_email VARCHAR(255) DEFAULT '', consent_status VARCHAR(20) DEFAULT 'none', link_code VARCHAR(10) DEFAULT '', link_code_expires_at TEXT DEFAULT '');
      CREATE TABLE IF NOT EXISTS gl_accounts (code TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('asset','liability','equity','income','expense')), is_active INTEGER DEFAULT 1);
      CREATE TABLE IF NOT EXISTS gl_entries (entry_id TEXT PRIMARY KEY, transaction_id TEXT, account_code TEXT NOT NULL REFERENCES gl_accounts(code), debit DECIMAL(12,2) DEFAULT 0, credit DECIMAL(12,2) DEFAULT 0, description TEXT DEFAULT '', created_at TEXT);
      CREATE TABLE IF NOT EXISTS audit_log (log_id TEXT PRIMARY KEY, admin_id TEXT, admin_name TEXT, action TEXT NOT NULL, entity_type TEXT, entity_id TEXT, details TEXT DEFAULT '{}', ip_address TEXT DEFAULT '', created_at TEXT);
      CREATE TABLE IF NOT EXISTS parental_consent (consent_id TEXT PRIMARY KEY, account_id TEXT NOT NULL, parent_phone TEXT DEFAULT '', parent_email TEXT DEFAULT '', consent_token TEXT NOT NULL, status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')), rejected_reason TEXT DEFAULT '', ip_address TEXT DEFAULT '', created_at TEXT, responded_at TEXT);
      CREATE TABLE IF NOT EXISTS account_deletion_requests (request_id TEXT PRIMARY KEY, account_id TEXT NOT NULL, requested_by TEXT DEFAULT 'parent', reason TEXT DEFAULT '', status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')), admin_notes TEXT DEFAULT '', created_at TEXT, resolved_at TEXT);
      CREATE TABLE IF NOT EXISTS admin_users (admin_id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT DEFAULT 'admin' CHECK(role IN ('super_admin','manager','teller','auditor')), display_name TEXT DEFAULT '', email TEXT DEFAULT '', is_active INTEGER DEFAULT 1, created_at TEXT);
    `);
    // Migrate existing admin_users table — add email column if missing
    try { db.exec("ALTER TABLE admin_users ADD COLUMN email TEXT DEFAULT ''"); } catch (_) {}
    try { db.exec("CREATE TABLE IF NOT EXISTS online_deposits (deposit_id TEXT PRIMARY KEY, account_id TEXT NOT NULL, amount DECIMAL(12,2) NOT NULL, reference_number VARCHAR(255) DEFAULT '', sender_name VARCHAR(255) DEFAULT '', payment_method VARCHAR(50) DEFAULT 'gcash', status VARCHAR(20) DEFAULT 'pending', admin_notes TEXT DEFAULT '', created_at TEXT, resolved_at TEXT)"); } catch (_) {}
    try { db.exec("CREATE TABLE IF NOT EXISTS fcm_tokens (token_id TEXT PRIMARY KEY, account_id TEXT NOT NULL, fcm_token TEXT NOT NULL, device_platform VARCHAR(20) DEFAULT '', created_at TEXT, updated_at TEXT)"); } catch (_) {}
    try { db.exec("CREATE TABLE IF NOT EXISTS parent_fcm_tokens (token_id TEXT PRIMARY KEY, parent_id TEXT NOT NULL, fcm_token TEXT NOT NULL, device_platform VARCHAR(20) DEFAULT '', created_at TEXT, updated_at TEXT)"); } catch (_) {}
    try { db.exec("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '')"); } catch (_) {}
    try { db.exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('gcash_number', '09171234567')"); } catch (_) {}
    try { db.exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('gcash_name', 'LabCoop Savings')"); } catch (_) {}
    try { db.exec("CREATE TABLE IF NOT EXISTS transactions (transaction_id TEXT PRIMARY KEY, trn_number INTEGER UNIQUE, account_id TEXT NOT NULL, goal_id TEXT, type VARCHAR(50) NOT NULL, amount DECIMAL(12,2) NOT NULL, balance_before DECIMAL(12,2), balance_after DECIMAL(12,2), description TEXT DEFAULT '', reference_type VARCHAR(50), reference_id TEXT, created_at TEXT)"); } catch (_) {}
    try { db.exec("CREATE TABLE IF NOT EXISTS sequences (name TEXT NOT NULL, year INTEGER NOT NULL, value INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (name, year))"); } catch (_) {}
    try { db.exec("CREATE TABLE IF NOT EXISTS eod_logs (eod_id TEXT PRIMARY KEY, date TEXT NOT NULL UNIQUE, opening_cash DECIMAL(12,2) DEFAULT 0, total_collections DECIMAL(12,2) DEFAULT 0, total_disbursements DECIMAL(12,2) DEFAULT 0, closing_cash DECIMAL(12,2) DEFAULT 0, tx_count INTEGER DEFAULT 0, closed_by TEXT, notes TEXT DEFAULT '', created_at TEXT)"); } catch (_) {}
    try { db.exec("CREATE TABLE IF NOT EXISTS eoy_logs (eoy_id TEXT PRIMARY KEY, year INTEGER NOT NULL UNIQUE, total_income DECIMAL(12,2) DEFAULT 0, total_expense DECIMAL(12,2) DEFAULT 0, net_profit DECIMAL(12,2) DEFAULT 0, tx_count INTEGER DEFAULT 0, archived INTEGER DEFAULT 0, closed_by TEXT, created_at TEXT)"); } catch (_) {}
    try { db.exec("CREATE TABLE IF NOT EXISTS archived_transactions (archive_id TEXT PRIMARY KEY, transaction_id TEXT, trn_number INTEGER, account_id TEXT, type VARCHAR(50), amount DECIMAL(12,2), description TEXT, reference_type VARCHAR(50), reference_id TEXT, original_created_at TEXT, archived_at TEXT, year INTEGER)"); } catch (_) {}
    try { db.exec("CREATE TABLE IF NOT EXISTS backup_logs (backup_id TEXT PRIMARY KEY, filename TEXT NOT NULL, file_size INTEGER DEFAULT 0, checksum TEXT, table_count INTEGER DEFAULT 0, row_count INTEGER DEFAULT 0, status TEXT DEFAULT 'completed', notes TEXT DEFAULT '', created_by TEXT, created_at TEXT)"); } catch (_) {}
    try { db.exec("ALTER TABLE transactions ADD COLUMN trn_number INTEGER"); } catch (_) {}
    try { db.exec("ALTER TABLE transactions ADD COLUMN voided_by TEXT"); } catch (_) {}
    try { db.exec("ALTER TABLE transactions ADD COLUMN void_reason TEXT"); } catch (_) {}
    try { db.exec("ALTER TABLE transactions ADD COLUMN voided_at TEXT"); } catch (_) {}
    try { db.exec("ALTER TABLE gl_entries ADD COLUMN is_voided INTEGER DEFAULT 0"); } catch (_) {}
    try { db.exec("ALTER TABLE gl_entries ADD COLUMN voided_by TEXT"); } catch (_) {}
    try { db.exec("ALTER TABLE gl_entries ADD COLUMN void_reason TEXT"); } catch (_) {}
    try { db.exec("ALTER TABLE gl_entries ADD COLUMN voided_at TEXT"); } catch (_) {}
    try { db.exec("ALTER TABLE gl_entries ADD COLUMN posted_by TEXT"); } catch (_) {}
    try { db.exec("ALTER TABLE gl_entries ADD COLUMN approved_by TEXT"); } catch (_) {}
    try { db.exec("ALTER TABLE gl_entries ADD COLUMN reference_type TEXT"); } catch (_) {}
    try { db.exec("ALTER TABLE gl_entries ADD COLUMN reference_number TEXT"); } catch (_) {}
    try { db.exec("ALTER TABLE gl_entries ADD COLUMN period_id TEXT"); } catch (_) {}
    try { db.exec("ALTER TABLE gl_accounts ADD COLUMN category TEXT DEFAULT ''"); } catch (_) {}
    try { db.exec("ALTER TABLE gl_accounts ADD COLUMN is_contra INTEGER DEFAULT 0"); } catch (_) {}
    try { db.exec("ALTER TABLE transactions ADD COLUMN or_number TEXT"); } catch (_) {}
    try { db.exec("CREATE TABLE IF NOT EXISTS accounting_periods (period_id TEXT PRIMARY KEY, year INTEGER NOT NULL, month INTEGER NOT NULL, is_closed INTEGER DEFAULT 0, closed_by TEXT, closed_at TEXT, UNIQUE(year, month))"); } catch (_) {}
    try { db.exec("CREATE TABLE IF NOT EXISTS or_series (series_id TEXT PRIMARY KEY, prefix TEXT NOT NULL, current_number INTEGER DEFAULT 1, end_number INTEGER, type TEXT NOT NULL CHECK(type IN ('deposit','withdrawal','collection')))"); } catch (_) {}
    try { db.exec("ALTER TABLE accounts ADD COLUMN profile_pic_url TEXT DEFAULT ''"); } catch (_) {}
    try { db.exec("CREATE TABLE IF NOT EXISTS teller_cash (cash_id TEXT PRIMARY KEY, teller_id TEXT NOT NULL, opening_balance DECIMAL(12,2) DEFAULT 0, current_balance DECIMAL(12,2) DEFAULT 0, date TEXT NOT NULL, status TEXT DEFAULT 'open' CHECK(status IN ('open','closed')), closed_at TEXT, notes TEXT DEFAULT '', created_at TEXT)"); } catch (_) {}
    try { db.exec("CREATE TABLE IF NOT EXISTS checks (check_id TEXT PRIMARY KEY, account_id TEXT NOT NULL, check_number TEXT NOT NULL, bank_name TEXT DEFAULT '', amount DECIMAL(12,2) NOT NULL, status TEXT DEFAULT 'pending' CHECK(status IN ('pending','cleared','bounced','deposited')), deposit_date TEXT, clear_date TEXT, created_at TEXT)"); } catch (_) {}
    try { db.exec("CREATE TABLE IF NOT EXISTS fees (fee_id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, amount DECIMAL(12,2) NOT NULL DEFAULT 0, fee_type TEXT DEFAULT 'fixed' CHECK(fee_type IN ('fixed','percentage')), gl_account_code TEXT REFERENCES gl_accounts(code), description TEXT DEFAULT '', is_active INTEGER DEFAULT 1, created_at TEXT)"); } catch (_) {}
    try { db.exec("CREATE TABLE IF NOT EXISTS branches (branch_id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, code TEXT UNIQUE, address TEXT DEFAULT '', contact_number TEXT DEFAULT '', manager_name TEXT DEFAULT '', is_active INTEGER DEFAULT 1, created_at TEXT)"); } catch (_) {}
    try { db.exec("ALTER TABLE accounts ADD COLUMN branch_id TEXT REFERENCES branches(branch_id)"); } catch (_) {}
    try { db.exec("ALTER TABLE accounts ADD COLUMN photo_2x2_url TEXT DEFAULT ''"); } catch (_) {}
    try { db.exec("ALTER TABLE accounts ADD COLUMN birth_cert_url TEXT DEFAULT ''"); } catch (_) {}
    try { db.exec("ALTER TABLE accounts ADD COLUMN id_photo_url TEXT DEFAULT ''"); } catch (_) {}
    try { db.exec("ALTER TABLE accounts ADD COLUMN kyc_status TEXT DEFAULT ''"); } catch (_) {}
    try { db.exec("ALTER TABLE accounts ADD COLUMN selfie_url TEXT DEFAULT ''"); } catch (_) {}
    try { db.exec("ALTER TABLE accounts ADD COLUMN kyc_submitted_at TEXT DEFAULT ''"); } catch (_) {}
    try { db.exec("ALTER TABLE accounts ADD COLUMN kyc_verified_at TEXT DEFAULT ''"); } catch (_) {}
    try { db.exec("ALTER TABLE accounts ADD COLUMN kyc_rejected_reason TEXT DEFAULT ''"); } catch (_) {}
    try { db.exec("ALTER TABLE accounts ADD COLUMN consent_status TEXT DEFAULT 'none'"); } catch (_) {}
    try { db.exec("ALTER TABLE accounts ADD COLUMN pin_hash VARCHAR(255) DEFAULT ''"); } catch (_) {}
    try { db.exec("ALTER TABLE accounts ADD COLUMN parent_email VARCHAR(255) DEFAULT ''"); } catch (_) {}
    try { db.exec("ALTER TABLE accounts ADD COLUMN link_code VARCHAR(10) DEFAULT ''"); } catch (_) {}
    try { db.exec("ALTER TABLE accounts ADD COLUMN link_code_expires_at TEXT DEFAULT ''"); } catch (_) {}
    try { db.exec("ALTER TABLE parental_consent ADD COLUMN parent_email TEXT DEFAULT ''"); } catch (_) {}
    try { db.exec("ALTER TABLE admin_users ADD COLUMN branch_id TEXT REFERENCES branches(branch_id)"); } catch (_) {}
    try { db.exec("CREATE TABLE IF NOT EXISTS parents (parent_id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT DEFAULT '', pin_hash TEXT DEFAULT '', display_name TEXT DEFAULT '', phone TEXT DEFAULT '', photo_url TEXT DEFAULT '', id_type TEXT DEFAULT '', id_number TEXT DEFAULT '', id_photo_url TEXT DEFAULT '', status TEXT DEFAULT 'pending', created_at TEXT)"); } catch (_) {}
    try { db.exec("ALTER TABLE parents ADD COLUMN photo_url TEXT DEFAULT ''"); } catch (_) {}
    try { db.exec("ALTER TABLE parents ADD COLUMN id_type TEXT DEFAULT ''"); } catch (_) {}
    try { db.exec("ALTER TABLE parents ADD COLUMN id_number TEXT DEFAULT ''"); } catch (_) {}
    try { db.exec("ALTER TABLE parents ADD COLUMN id_photo_url TEXT DEFAULT ''"); } catch (_) {}
    try { db.exec("ALTER TABLE parents ADD COLUMN status TEXT DEFAULT 'pending'"); } catch (_) {}
    try { db.exec("ALTER TABLE parents ADD COLUMN address TEXT DEFAULT ''"); } catch (_) {}
    try { db.exec("ALTER TABLE parents ADD COLUMN city TEXT DEFAULT ''"); } catch (_) {}
    try { db.exec("ALTER TABLE parents ADD COLUMN province TEXT DEFAULT ''"); } catch (_) {}
    try { db.exec("ALTER TABLE parents ADD COLUMN postal_code TEXT DEFAULT ''"); } catch (_) {}
    try { db.exec("CREATE TABLE IF NOT EXISTS parent_child_links (link_id TEXT PRIMARY KEY, parent_id TEXT NOT NULL, child_account_id TEXT NOT NULL, linking_code TEXT, status TEXT DEFAULT 'active', created_at TEXT)"); } catch (_) {}
    try { db.exec("CREATE TABLE IF NOT EXISTS parent_limits (limit_id TEXT PRIMARY KEY, parent_id TEXT NOT NULL, child_account_id TEXT NOT NULL, max_daily_withdrawal DECIMAL(12,2) DEFAULT 0, max_loan_amount DECIMAL(12,2) DEFAULT 0, require_approval_for TEXT DEFAULT 'all')"); } catch (_) {}
    try { db.exec("ALTER TABLE teller_cash ADD COLUMN branch_id TEXT REFERENCES branches(branch_id)"); } catch (_) {}
    try { db.exec("INSERT OR IGNORE INTO branches (branch_id, name, code, address) VALUES ('main', 'Main Branch', 'MAIN', 'Head Office')"); } catch (_) {}
    try { db.exec("INSERT OR IGNORE INTO fees (fee_id, name, amount, fee_type, gl_account_code, description) VALUES ('fee_acct_maintenance', 'Account Maintenance Fee', 10, 'fixed', '4100', 'Monthly account maintenance fee')"); } catch (_) {}
    try { db.exec("INSERT OR IGNORE INTO fees (fee_id, name, amount, fee_type, gl_account_code, description) VALUES ('fee_withdrawal', 'Withdrawal Fee', 5, 'fixed', '4100', 'Per withdrawal transaction fee')"); } catch (_) {}
    try { db.exec("INSERT OR IGNORE INTO fees (fee_id, name, amount, fee_type, gl_account_code, description) VALUES ('fee_check', 'Check Processing Fee', 15, 'fixed', '4100', 'Per check deposit processing fee')"); } catch (_) {}
    // ── Advanced Banking Tables ──
    try { db.exec("CREATE TABLE IF NOT EXISTS loan_collateral (collateral_id TEXT PRIMARY KEY, loan_id TEXT NOT NULL, type TEXT NOT NULL, description TEXT DEFAULT '', estimated_value DECIMAL(12,2) DEFAULT 0, appraised_value DECIMAL(12,2), document_url TEXT DEFAULT '', is_released INTEGER DEFAULT 0, created_at TEXT)"); } catch (_) {}
    try { db.exec("CREATE TABLE IF NOT EXISTS loan_guarantors (guarantor_id TEXT PRIMARY KEY, loan_id TEXT NOT NULL, name TEXT NOT NULL, relationship TEXT DEFAULT '', contact_number TEXT DEFAULT '', address TEXT DEFAULT '', income DECIMAL(12,2) DEFAULT 0, created_at TEXT)"); } catch (_) {}
    try { db.exec("CREATE TABLE IF NOT EXISTS loan_restructuring (restructure_id TEXT PRIMARY KEY, loan_id TEXT NOT NULL, old_principal DECIMAL(12,2), new_principal DECIMAL(12,2), old_interest_rate DECIMAL(5,2), new_interest_rate DECIMAL(5,2), old_term_months INTEGER, new_term_months INTEGER, reason TEXT DEFAULT '', approved_by TEXT, created_at TEXT)"); } catch (_) {}
    try { db.exec("ALTER TABLE loans ADD COLUMN asset_classification TEXT DEFAULT 'current'"); } catch (_) {}
    try { db.exec("ALTER TABLE loans ADD COLUMN late_fee_accrued DECIMAL(12,2) DEFAULT 0"); } catch (_) {}
    try { db.exec("ALTER TABLE loans ADD COLUMN last_late_fee_date TEXT"); } catch (_) {}
    try { db.exec("ALTER TABLE loans ADD COLUMN due_date TEXT"); } catch (_) {}
    try { db.exec("CREATE TABLE IF NOT EXISTS term_deposits (td_id TEXT PRIMARY KEY, account_id TEXT NOT NULL, td_number TEXT UNIQUE, amount DECIMAL(12,2) NOT NULL, term_days INTEGER NOT NULL, interest_rate DECIMAL(5,2) NOT NULL, maturity_date TEXT NOT NULL, status TEXT DEFAULT 'active' CHECK(status IN ('active','matured','closed','renewed')), renew_instruction TEXT DEFAULT 'mature', auto_renew INTEGER DEFAULT 0, interest_earned DECIMAL(12,2) DEFAULT 0, created_at TEXT, closed_at TEXT)"); } catch (_) {}
    try { db.exec("CREATE TABLE IF NOT EXISTS share_capital (share_id TEXT PRIMARY KEY, account_id TEXT NOT NULL, shares INTEGER DEFAULT 0, share_value DECIMAL(12,2) DEFAULT 0, total_amount DECIMAL(12,2) DEFAULT 0, transaction_type TEXT CHECK(transaction_type IN ('subscription','dividend','refund')), notes TEXT DEFAULT '', created_at TEXT)"); } catch (_) {}
    try { db.exec("ALTER TABLE accounts ADD COLUMN total_shares INTEGER DEFAULT 0"); } catch (_) {}
    try { db.exec("ALTER TABLE accounts ADD COLUMN share_capital_balance DECIMAL(12,2) DEFAULT 0"); } catch (_) {}
    try { db.exec("CREATE TABLE IF NOT EXISTS dividends (dividend_id TEXT PRIMARY KEY, year INTEGER NOT NULL, total_amount DECIMAL(12,2) NOT NULL, rate DECIMAL(5,2) NOT NULL, per_share DECIMAL(10,4) DEFAULT 0, declared_date TEXT NOT NULL, paid_date TEXT, status TEXT DEFAULT 'declared' CHECK(status IN ('declared','paid')), created_at TEXT)"); } catch (_) {}
    try { db.exec("ALTER TABLE accounts ADD COLUMN overdraft_limit DECIMAL(12,2) DEFAULT 0"); } catch (_) {}
    try { db.exec("ALTER TABLE accounts ADD COLUMN overdraft_interest_rate DECIMAL(5,2) DEFAULT 0"); } catch (_) {}
    try { db.exec("ALTER TABLE accounts ADD COLUMN address TEXT DEFAULT ''"); } catch (_) {}
    try { db.exec("ALTER TABLE accounts ADD COLUMN city TEXT DEFAULT ''"); } catch (_) {}
    try { db.exec("ALTER TABLE accounts ADD COLUMN province TEXT DEFAULT ''"); } catch (_) {}
    try { db.exec("ALTER TABLE accounts ADD COLUMN postal_code TEXT DEFAULT ''"); } catch (_) {}
    try { db.exec("ALTER TABLE accounts ADD COLUMN civil_status TEXT DEFAULT ''"); } catch (_) {}
    try { db.exec("ALTER TABLE accounts ADD COLUMN occupation TEXT DEFAULT ''"); } catch (_) {}
    try { db.exec("ALTER TABLE accounts ADD COLUMN employer TEXT DEFAULT ''"); } catch (_) {}
    try { db.exec("ALTER TABLE accounts ADD COLUMN monthly_income DECIMAL(12,2) DEFAULT 0"); } catch (_) {}
    try { db.exec("CREATE TABLE IF NOT EXISTS checkbooks (checkbook_id TEXT PRIMARY KEY, account_id TEXT NOT NULL, bank_name TEXT DEFAULT '', start_number TEXT NOT NULL, end_number TEXT NOT NULL, issue_date TEXT NOT NULL, status TEXT DEFAULT 'active' CHECK(status IN ('active','fully_used','cancelled','stopped')), next_check_number TEXT, created_at TEXT)"); } catch (_) {}
    try { db.exec("ALTER TABLE checks ADD COLUMN checkbook_id TEXT"); } catch (_) {}
    try { db.exec("ALTER TABLE checks ADD COLUMN stop_payment INTEGER DEFAULT 0"); } catch (_) {}
    try { db.exec("CREATE TABLE IF NOT EXISTS demand_drafts (dd_id TEXT PRIMARY KEY, account_id TEXT NOT NULL, dd_number TEXT UNIQUE, payee TEXT NOT NULL, amount DECIMAL(12,2) NOT NULL, charge_type TEXT DEFAULT 'debit' CHECK(charge_type IN ('debit','cash')), status TEXT DEFAULT 'issued' CHECK(status IN ('issued','cancelled','paid')), created_at TEXT, issued_by TEXT)"); } catch (_) {}
    try { db.exec("CREATE TABLE IF NOT EXISTS credit_scores (score_id TEXT PRIMARY KEY, account_id TEXT NOT NULL, score INTEGER DEFAULT 500, rating TEXT DEFAULT 'fair' CHECK(rating IN ('poor','fair','good','very_good','excellent')), total_loans INTEGER DEFAULT 0, late_payments INTEGER DEFAULT 0, avg_balance DECIMAL(12,2) DEFAULT 0, last_updated TEXT, created_at TEXT)"); } catch (_) {}
    try { db.exec("CREATE TABLE IF NOT EXISTS groups (group_id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '', member_count INTEGER DEFAULT 0, created_at TEXT)"); } catch (_) {}
    try { db.exec("CREATE TABLE IF NOT EXISTS group_members (gm_id TEXT PRIMARY KEY, group_id TEXT NOT NULL, account_id TEXT NOT NULL, role TEXT DEFAULT 'member' CHECK(role IN ('leader','member')), joined_at TEXT)"); } catch (_) {}
    try { db.exec("ALTER TABLE accounts ADD COLUMN currency TEXT DEFAULT 'PHP'"); } catch (_) {}
    try { db.exec("ALTER TABLE accounts ADD COLUMN maintaining_balance DECIMAL(12,2) DEFAULT 0"); } catch (_) {}
    try { db.exec("ALTER TABLE accounts ADD COLUMN regular_savings_number TEXT"); } catch (_) {}
    try { db.exec("CREATE TABLE IF NOT EXISTS holiday_calendar (holiday_id TEXT PRIMARY KEY, name TEXT NOT NULL, date TEXT NOT NULL UNIQUE, type TEXT DEFAULT 'regular' CHECK(type IN ('regular','special','local')), is_recurring INTEGER DEFAULT 0, created_at TEXT)"); } catch (_) {}
    try { db.exec("CREATE TABLE IF NOT EXISTS tax_config (tax_id TEXT PRIMARY KEY, name TEXT NOT NULL, rate DECIMAL(5,2) NOT NULL, applies_to TEXT DEFAULT 'interest' CHECK(applies_to IN ('interest','fee','dividend','all')), is_active INTEGER DEFAULT 1, created_at TEXT)"); } catch (_) {}
    try { db.exec("INSERT OR IGNORE INTO tax_config (tax_id, name, rate, applies_to) VALUES ('tax_interest', 'Interest Income Tax', 20, 'interest')"); } catch (_) {}
    try { db.exec("INSERT OR IGNORE INTO tax_config (tax_id, name, rate, applies_to) VALUES ('tax_dividend', 'Dividend Tax', 10, 'dividend')"); } catch (_) {}
    try { db.exec("CREATE TABLE IF NOT EXISTS board_members (id TEXT PRIMARY KEY, name TEXT NOT NULL, position TEXT NOT NULL, image_url TEXT DEFAULT '', sort_order INTEGER DEFAULT 0, created_at TEXT)"); } catch (_) {}
    try { db.exec("ALTER TABLE accounts ADD COLUMN coins INTEGER DEFAULT 0"); } catch (_) {}
    try { db.exec("CREATE TABLE IF NOT EXISTS coin_transactions (id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE, amount INTEGER NOT NULL, balance_before INTEGER NOT NULL, balance_after INTEGER NOT NULL, reason TEXT DEFAULT '', created_at TEXT NOT NULL)"); } catch (_) {}
    try { db.exec("CREATE INDEX IF NOT EXISTS idx_coin_tx_account ON coin_transactions(account_id)"); } catch (_) {}
    try { db.exec("CREATE TABLE IF NOT EXISTS refresh_tokens (token_id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE, token_hash TEXT NOT NULL, expires_at TEXT NOT NULL, revoked INTEGER DEFAULT 0, created_at TEXT NOT NULL)"); } catch (_) {}
    try { db.exec("CREATE TABLE IF NOT EXISTS parent_notifications (notif_id TEXT PRIMARY KEY, parent_id TEXT NOT NULL, title TEXT NOT NULL, body TEXT DEFAULT '', type TEXT DEFAULT 'info', is_read INTEGER DEFAULT 0, created_at TEXT)"); } catch (_) {}
    try { db.exec("CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash)"); } catch (_) {}
    try { db.exec("CREATE INDEX IF NOT EXISTS idx_refresh_tokens_account ON refresh_tokens(account_id)"); } catch (_) {}
    const accounts = [
      ['1000','Cash on Hand','asset','current_asset',0], ['1010','Cash in Bank','asset','current_asset',0],
      ['1020','Petty Cash','asset','current_asset',0], ['1100','Loans Receivable','asset','current_asset',0],
      ['1200','Accrued Interest Receivable','asset','current_asset',0], ['1300','Prepaid Expenses','asset','current_asset',0],
      ['1400','Property & Equipment','asset','non_current_asset',0], ['1401','Accumulated Depreciation','asset','non_current_asset',1],
      ['1500','Accounts Receivable - Loans','asset','current_asset',0],
      ['2000','Savings Deposits','liability','current_liability',0], ['2100','Time Deposits','liability','current_liability',0],
      ['2200','Interest Payable','liability','current_liability',0], ['2300','Accounts Payable','liability','current_liability',0],
      ['2400','Income Tax Payable','liability','current_liability',0], ['2500','Accrued Expenses','liability','current_liability',0],
      ['3000','Share Capital','equity','equity',0], ['3100','Retained Earnings','equity','equity',0],
      ['4000','Interest Income','income','operating_income',0], ['4100','Fee Income','income','operating_income',0],
      ['4200','Insurance Income','income','operating_income',0], ['4300','Miscellaneous Income','income','other_income',0],
      ['5000','Interest Expense','expense','operating_expense',0], ['5100','Other Operating Expenses','expense','operating_expense',0],
      ['5200','Depreciation Expense','expense','operating_expense',0], ['5300','Tax Expense','expense','operating_expense',0],
    ];
    const insert = db.prepare('INSERT OR IGNORE INTO gl_accounts (code, name, type, category, is_contra) VALUES (?,?,?,?,?)');
    for (const a of accounts) insert.run(...a);
    const updateCat = db.prepare('UPDATE gl_accounts SET category = ? WHERE code = ?');
    for (const a of accounts) updateCat.run(a[3], a[0]);
  }
  return db;
}

function getAccount(accountId, tx) {
  // tx ignored — SQLite is synchronous
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
    profile_pic_url: fields.profile_pic_url || '',
    kyc_status: fields.kyc_status || '',
    selfie_url: fields.selfie_url || '',
    is_active: fields.is_active ?? 1,
    savings_product_id: fields.savings_product_id || null,
    maintaining_balance: fields.maintaining_balance || 0,
    regular_savings_number: fields.regular_savings_number || null,
    pin_hash: fields.pin_hash || '',
    parent_email: fields.parent_email || '',
    consent_status: fields.consent_status || 'none',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  getDb().prepare(`
    INSERT INTO accounts (account_id, child_name, member_id, password, password_changed, actual_balance, unallocated_balance, current_xp, parent_phone, last_name, first_name, middle_name, birthday, age, gender, savings_schedule, photo_2x2_url, birth_cert_url, id_photo_url, profile_pic_url, kyc_status, selfie_url, is_active, savings_product_id, maintaining_balance, regular_savings_number, pin_hash, parent_email, consent_status, created_at, updated_at)
    VALUES (@account_id, @child_name, @member_id, @password, @password_changed, @actual_balance, @unallocated_balance, @current_xp, @parent_phone, @last_name, @first_name, @middle_name, @birthday, @age, @gender, @savings_schedule, @photo_2x2_url, @birth_cert_url, @id_photo_url, @profile_pic_url, @kyc_status, @selfie_url, @is_active, @savings_product_id, @maintaining_balance, @regular_savings_number, @pin_hash, @parent_email, @consent_status, @created_at, @updated_at)
  `).run(account);
  return account;
}

function generateSavingsAccountNumber(branch) {
  const now = new Date();
  const mmdd = String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0') + String(now.getFullYear()).slice(-2);
  const seqName = `savings_acct_${branch || '01'}_${mmdd}`;
  const db = getDb();
  const seq = db.transaction(() => {
    const existing = db.prepare('SELECT value FROM sequences WHERE name = ? AND year = ?').get(seqName, now.getFullYear());
    if (!existing) {
      db.prepare('INSERT INTO sequences (name, year, value) VALUES (?, ?, 1)').run(seqName, now.getFullYear());
      return 1;
    }
    db.prepare('UPDATE sequences SET value = value + 1 WHERE name = ? AND year = ?').run(seqName, now.getFullYear());
    return existing.value + 1;
  })();
  return `SAVC-${String(branch || '01').padStart(2, '0')}-${mmdd}-${String(seq).padStart(3, '0')}`;
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

function updateAccount(accountId, fields, tx) {
  // tx ignored — SQLite is synchronous
  // actual_balance and unallocated_balance are SERVER-MANAGED only — never via user-facing API
  const allowed = ['current_xp', 'child_name', 'parent_phone', 'parent_email', 'consent_status', 'last_name', 'first_name', 'middle_name', 'birthday', 'age', 'gender', 'savings_schedule', 'photo_2x2_url', 'birth_cert_url', 'id_photo_url', 'profile_pic_url', 'kyc_status', 'selfie_url', 'kyc_submitted_at', 'kyc_verified_at', 'kyc_rejected_reason', 'is_active', 'maintaining_balance', 'regular_savings_number', 'savings_product_id', 'actual_balance', 'unallocated_balance'];
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

// ── OR Series & Accounting Periods ──

function assignOrNumber(type) {
  const year = new Date().getFullYear();
  const seriesId = 'or_' + type;
  getDb().prepare("INSERT OR IGNORE INTO or_series (series_id, prefix, current_number, type) VALUES (?, 'LABCOOP', 1, ?)").run(seriesId, type);
  const row = getDb().prepare('UPDATE or_series SET current_number = current_number + 1 WHERE series_id = ? RETURNING current_number, prefix').get(seriesId);
  const num = String(Number(row.current_number) - 1).padStart(5, '0');
  return row.prefix + '-' + year + '-' + num;
}

function getOrCreatePeriod(createdAt) {
  const d = new Date(createdAt);
  const periodId = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  getDb().prepare("INSERT OR IGNORE INTO accounting_periods (period_id, year, month) VALUES (?, ?, ?)").run(periodId, d.getFullYear(), d.getMonth() + 1);
  return getDb().prepare('SELECT * FROM accounting_periods WHERE period_id = ?').get(periodId);
}

function isPeriodClosed(createdAt) {
  const d = new Date(createdAt);
  const periodId = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  const row = getDb().prepare('SELECT is_closed FROM accounting_periods WHERE period_id = ?').get(periodId);
  return row ? row.is_closed === 1 : false;
}

function closePeriod(periodId, closedBy) {
  getDb().prepare('UPDATE accounting_periods SET is_closed = 1, closed_by = ?, closed_at = ? WHERE period_id = ?').run(closedBy, new Date().toISOString(), periodId);
}

function addTransaction(txData, tx) {
  // tx ignored — SQLite is synchronous
  const account = getAccount(txData.account_id);
  const currentBalance = account ? account.actual_balance : 0;

  let balanceAfter = currentBalance;
  // Compute running balance based on transaction type
  if (['deposit', 'interest_credit', 'loan_disbursement'].includes(txData.type)) {
    balanceAfter = Math.round((currentBalance + Number(txData.amount)) * 100) / 100;
  } else if (['withdrawal', 'loan_payment', 'fee'].includes(txData.type)) {
    balanceAfter = Math.round((currentBalance - Number(txData.amount)) * 100) / 100;
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
    account_id: txData.account_id,
    goal_id: txData.goal_id || null,
    type: txData.type,
    amount: txData.amount,
    balance_before: txData.balance_before !== undefined ? txData.balance_before : currentBalance,
    balance_after: txData.balance_after !== undefined ? txData.balance_after : balanceAfter,
    description: txData.description || '',
    reference_type: txData.reference_type || null,
    reference_id: txData.reference_id || null,
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

function creditInterest(accountId, amount, tx) {
  // tx ignored — SQLite is synchronous
  const db = getDb();
  const account = getAccount(accountId);
  if (!account) return null;
  const newBalance = Math.round((Number(account.actual_balance) + amount) * 100) / 100;
  const newInterest = Math.round((Number(account.interest_earned) + amount) * 100) / 100;
  db.prepare('UPDATE accounts SET actual_balance = ?, unallocated_balance = unallocated_balance + ?, interest_earned = ?, updated_at = datetime(\'now\') WHERE account_id = ?').run(newBalance, amount, newInterest, accountId);
  const txRecord = addTransaction({
    account_id: accountId,
    type: 'interest_credit',
    amount,
    description: 'Interest credited',
    balance_before: Number(account.actual_balance),
    balance_after: newBalance,
  });
  return txRecord;
}

// ── Loans ──

function getLoans(accountId, tx) {
  // tx ignored — SQLite is synchronous
  return getDb().prepare('SELECT * FROM loans WHERE account_id = ? ORDER BY created_at DESC').all(accountId);
}

function getLoan(loanId, tx) {
  // tx ignored — SQLite is synchronous
  return getDb().prepare('SELECT * FROM loans WHERE loan_id = ?').get(loanId) || null;
}

function createLoan(fields, tx) {
  // tx ignored — SQLite is synchronous
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
    due_date: fields.due_date || null,
  };
  getDb().prepare(`
    INSERT INTO loans (loan_id, account_id, product_id, principal, interest_rate, interest_type, term_months, monthly_amortization, total_payable, amount_paid, remaining_balance, status, purpose, created_at, updated_at, due_date)
    VALUES (@loan_id, @account_id, @product_id, @principal, @interest_rate, @interest_type, @term_months, @monthly_amortization, @total_payable, @amount_paid, @remaining_balance, @status, @purpose, @created_at, @updated_at, @due_date)
  `).run(loan);
  return loan;
}

function updateLoan(loanId, fields, tx) {
  // tx ignored — SQLite is synchronous
  const allowed = ['amount_paid', 'remaining_balance', 'status', 'approved_by', 'approved_at', 'disbursed_at', 'due_date'];
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

function addLoanPayment(fields, tx) {
  // tx ignored — SQLite is synchronous
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

function getLoanPayments(loanId, tx) {
  // tx ignored — SQLite is synchronous
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

// ── Parent FCM Tokens ──
function getParentFcmTokens(parentId) {
  return getDb().prepare('SELECT * FROM parent_fcm_tokens WHERE parent_id = ?').all(parentId);
}

function registerParentFcmToken(parentId, fcmToken, devicePlatform) {
  const existing = getDb().prepare('SELECT * FROM parent_fcm_tokens WHERE parent_id = ? AND fcm_token = ?').get(parentId, fcmToken);
  if (existing) {
    getDb().prepare('UPDATE parent_fcm_tokens SET updated_at = ? WHERE token_id = ?').run(new Date().toISOString(), existing.token_id);
    return existing;
  }
  const token_id = uuidv4();
  getDb().prepare('INSERT INTO parent_fcm_tokens (token_id, parent_id, fcm_token, device_platform, created_at, updated_at) VALUES (?,?,?,?,?,?)').run(
    token_id, parentId, fcmToken, devicePlatform || '', new Date().toISOString(), new Date().toISOString()
  );
  return { token_id, parent_id: parentId, fcm_token: fcmToken, device_platform: devicePlatform || '' };
}

async function query(sql, params) {
  const db = getDb();
  const adaptedSql = sql.replace(/\$(\d+)/g, '?');
  const stmt = db.prepare(adaptedSql);
  const isRead = /^\s*SELECT/i.test(adaptedSql);
  const rows = isRead ? stmt.all(...(params || [])) : [];
  if (!isRead) stmt.run(...(params || []));
  return { rows };
}

// ── Parent Notifications ──

function createParentNotification({ parentId, title, body, type = 'info' }) {
  const id = uuidv4();
  getDb().prepare(`
    INSERT INTO parent_notifications (notif_id, parent_id, title, body, type, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, parentId, title, body, type, new Date().toISOString());
  return id;
}

function getParentNotifications(parentId, limit = 50) {
  return getDb().prepare(
    'SELECT * FROM parent_notifications WHERE parent_id = ? ORDER BY created_at DESC LIMIT ?'
  ).all(parentId, Number(limit));
}

function getParentUnreadCount(parentId) {
  const r = getDb().prepare(
    'SELECT COUNT(*) as cnt FROM parent_notifications WHERE parent_id = ? AND is_read = 0'
  ).get(parentId);
  return Number(r?.cnt || 0);
}

function markParentNotificationRead(notifId) {
  getDb().prepare('UPDATE parent_notifications SET is_read = 1 WHERE notif_id = ?').run(notifId);
}

function markAllParentNotificationsRead(parentId) {
  getDb().prepare('UPDATE parent_notifications SET is_read = 1 WHERE parent_id = ?').run(parentId);
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

// ── Coin Management ──

function getCoins(accountId) {
  const row = getDb().prepare('SELECT coins FROM accounts WHERE account_id = ?').get(accountId);
  return row ? Number(row.coins) : 0;
}

function addCoins(accountId, amount, reason) {
  const account = getAccount(accountId);
  if (!account) throw new Error('Account not found');
  const currentCoins = Number(account.coins) || 0;
  const newBalance = currentCoins + amount;
  const now = new Date().toISOString();
  getDb().prepare("UPDATE accounts SET coins = ?, updated_at = datetime('now') WHERE account_id = ?").run(newBalance, accountId);
  getDb().prepare(`
    INSERT INTO coin_transactions (id, account_id, amount, balance_before, balance_after, reason, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), accountId, amount, currentCoins, newBalance, reason || 'coins_added', now);
  return newBalance;
}

function spendCoins(accountId, amount, reason) {
  const account = getAccount(accountId);
  if (!account) throw new Error('Account not found');
  const currentCoins = Number(account.coins) || 0;
  if (currentCoins < amount) throw new Error('Insufficient coins');
  const newBalance = currentCoins - amount;
  const now = new Date().toISOString();
  getDb().prepare("UPDATE accounts SET coins = ?, updated_at = datetime('now') WHERE account_id = ?").run(newBalance, accountId);
  getDb().prepare(`
    INSERT INTO coin_transactions (id, account_id, amount, balance_before, balance_after, reason, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), accountId, -amount, currentCoins, newBalance, reason || 'coins_spent', now);
  return newBalance;
}

function getCoinHistory(accountId) {
  return getDb().prepare('SELECT * FROM coin_transactions WHERE account_id = ? ORDER BY created_at DESC LIMIT 100').all(accountId);
}

// ── Refresh Tokens ──

function saveRefreshToken(accountId, tokenHash, expiresAt) {
  const token = {
    token_id: uuidv4(),
    account_id: accountId,
    token_hash: tokenHash,
    expires_at: expiresAt,
    revoked: 0,
    created_at: new Date().toISOString(),
  };
  getDb().prepare(`
    INSERT INTO refresh_tokens (token_id, account_id, token_hash, expires_at, revoked, created_at)
    VALUES (@token_id, @account_id, @token_hash, @expires_at, @revoked, @created_at)
  `).run(token);
  return token;
}

function getRefreshToken(tokenHash) {
  return getDb().prepare('SELECT * FROM refresh_tokens WHERE token_hash = ?').get(tokenHash) || null;
}

function revokeRefreshToken(tokenHash) {
  getDb().prepare('UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?').run(tokenHash);
}

function revokeAllAccountTokens(accountId) {
  getDb().prepare('UPDATE refresh_tokens SET revoked = 1 WHERE account_id = ? AND revoked = 0').run(accountId);
}

module.exports = {
  getDb,
  getAccount,
  getAccountByName,
  createAccount,
  updateAccount,
  generateSavingsAccountNumber,
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
  assignOrNumber,
  getOrCreatePeriod,
  isPeriodClosed,
  closePeriod,
  getQuizQuestions,
  getQuizQuestion,
  createQuizQuestion,
  updateQuizQuestion,
  deleteQuizQuestion,
  close,
  // ── Coins ──
  getCoins,
  addCoins,
  spendCoins,
  getCoinHistory,
  // ── Refresh Tokens ──
  saveRefreshToken,
  getRefreshToken,
  revokeRefreshToken,
  revokeAllAccountTokens,
  // ── Parent Notifications ──
  createParentNotification,
  getParentNotifications,
  getParentUnreadCount,
  markParentNotificationRead,
  markAllParentNotificationsRead,
  // ── Parent FCM Tokens ──
  getParentFcmTokens,
  registerParentFcmToken,
};
