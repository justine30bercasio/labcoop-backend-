const fs = require('fs');
let code = fs.readFileSync('D:\\LABCOOP\\backend\\src\\routes\\admin_converted.js', 'utf8');

// Fix 1: Remaining db.prepare() + getDb() calls that weren't converted
// Each fix maps: pattern -> replacement

const fixes = [
  // Line 575: shop image upload
  [ `db.prepare("UPDATE shop_items SET image_url=$1 WHERE id=$2").run(imageUrl, id);`,
    `await store.query("UPDATE shop_items SET image_url=$1 WHERE id=$2", [imageUrl, id]);` ],

  // Line 641: shop image upload
  [ `db.prepare("UPDATE shop_items SET image_url=$1, updated_at=datetime('now') WHERE id=$2").run(imageUrl, req.params.id);`,
    `await store.query("UPDATE shop_items SET image_url=$1, updated_at=datetime('now') WHERE id=$2", [imageUrl, req.params.id]);` ],

  // Line 957: accounts create - max member
  [ "const maxMember = db.prepare(\"SELECT MAX(CAST(member_id AS INTEGER)) as m FROM accounts\").get().m || 0;",
    "const maxMember = (await one(\"SELECT MAX(CAST(member_id AS INTEGER)) as m FROM accounts\")).m || 0;" ],

  // Line 1641: transactions page
  [ "const transactions = db.prepare(`",
    "const transactions = await sql(`" ],
  [ "`).all(...params, perPage, offset);",
    "`, ...params, perPage, offset);" ],

  // Line 1724: settings/database page
  [ "const tables = db.prepare(\"SELECT name FROM sqlite_master WHERE type='table' ORDER BY name\").all();",
    "const tables = await sql(\"SELECT name FROM sqlite_master WHERE type='table' ORDER BY name\");" ],

  // Line 2213: withdrawal pay
  [ "db.prepare(\"UPDATE accounts SET actual_balance=?, unallocated_balance=?, updated_at=datetime('now') WHERE account_id=?\")",
    "await store.query(\"UPDATE accounts SET actual_balance=$1, unallocated_balance=$2, updated_at=datetime('now') WHERE account_id=$3\"," ],

  // Line 2321: savings approve
  [ `db.prepare("UPDATE accounts SET savings_product_id = ?, updated_at = datetime('now') WHERE account_id = ?").run(app.prod`,
    `await store.query("UPDATE accounts SET savings_product_id = $1, updated_at = datetime('now') WHERE account_id = $2", [app.prod` ],

  // Line 2331: savings reject
  [ `const app = getDb().prepare('SELECT * FROM savings_applications WHERE application_id = $1').get(req.params.id);`,
    `const app = (await one('SELECT * FROM savings_applications WHERE application_id = $1', [req.params.id]));` ],

  // Line 2364: teller active loans
  [ `const activeLoans = db.prepare("SELECT * FROM loans WHERE account_id = ? AND status = 'active' ORDER BY created_at DESC"`,
    `const activeLoans = await sql("SELECT * FROM loans WHERE account_id = $1 AND status = 'active' ORDER BY created_at DESC",` ],

  // Line 2377: teller receipt lookup
  [ `const receipt = qry.receipt ? db.prepare("SELECT t.*, a.child_name, a.member_id FROM transactions t LEFT JOIN accounts a`,
    `const receipt = qry.receipt ? (await one("SELECT t.*, a.child_name, a.member_id FROM transactions t LEFT JOIN accounts a` ],

  // Line 2617: teller deposit
  [ `db.prepare("UPDATE accounts SET actual_balance=?, unallocated_balance=unallocated_balance+?, updated_at=datetime('now') `,
    `await store.query("UPDATE accounts SET actual_balance=$1, unallocated_balance=unallocated_balance+$2, updated_at=datetime('now') ` ],

  // Line 2645: teller withdraw
  [ `db.prepare("UPDATE accounts SET actual_balance=?, unallocated_balance=?, updated_at=datetime('now') WHERE account_id=?")`,
    `await store.query("UPDATE accounts SET actual_balance=$1, unallocated_balance=$2, updated_at=datetime('now') WHERE account_id=$3",` ],

  // Line 2703: teller loan pay
  [ `db.prepare("UPDATE loans SET amount_paid = ?, remaining_balance = ?, status = ?, updated_at = datetime('now') WHERE loan`,
    `await store.query("UPDATE loans SET amount_paid = $1, remaining_balance = $2, status = $3, updated_at = datetime('now') WHERE loan` ],

  // Line 1719: settings route is SQLite-specific - skip (keep it limited)
];

// Fix 2: Route closings that need })); instead of });
// These are lines that end with just '});' following a res.send/redirect/json
const lines = code.split('\n');
for (let i = 0; i < lines.length; i++) {
  const trimmed = lines[i].trim();
  if (trimmed === '});') {
    // Check if this follows a res.xxx call (route closing)
    let prev = i - 1;
    while (prev >= 0 && lines[prev].trim() === '') prev--;
    if (prev >= 0 && lines[prev].includes('res.')) {
      lines[i] = lines[i].replace('});', '}));');
      console.log('Fixed route closing at line ' + (i + 1));
    }
  }
}
code = lines.join('\n');

// Fix 3: Clean up remaining getDb() (non-const pattern)
code = code.replace(/getDb\(\)\.prepare\(/g, 'prepare('); // shouldn't happen but just in case

// Apply all the targeted replacements
let fixCount = 0;
for (const [oldStr, newStr] of fixes) {
  if (code.includes(oldStr)) {
    code = code.replace(oldStr, newStr);
    fixCount++;
    console.log('Fixed: ' + oldStr.substring(0, 80) + '...');
  } else {
    console.log('NOT FOUND: ' + oldStr.substring(0, 60) + '...');
  }
}

// Fix 4: Clean up unmatched patterns - many .run( calls need proper array wrapping
// Find cases like await store.query(SQL, [val1, val2) where closing ] is missing
// These come from .run(val1, val2) being wrapped in [] but parameter list might have spanned multiple lines

fs.writeFileSync('D:\\LABCOOP\\backend\\src\\routes\\admin_converted.js', code, 'utf8');

// Check syntax
const { execSync } = require('child_process');
try {
  execSync('node -c "' + 'D:\\LABCOOP\\backend\\src\\routes\\admin_converted.js"', { stdio: 'pipe' });
  console.log('SYNTAX OK');
} catch (e) {
  console.log('SYNTAX ERROR:', e.stderr.toString().split('\n')[0]);
}

// Check paren balance
let o = 0, c = 0;
for (const ch of code) { if (ch === '(') o++; if (ch === ')') c++; }
console.log('Paren balance:', o - c);
