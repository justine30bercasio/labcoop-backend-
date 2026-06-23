const fs = require('fs');

let code = fs.readFileSync('D:\\LABCOOP\\backend\\src\\routes\\admin.js', 'utf8');
const original = code;

// Step 1: Wrap route handlers with asyncHandler
code = code.replace(
  /router\.(get|post)\('([^']+)',\s*(requireSession(?:\s*,\s*requireAdmin)?)\s*,\s*\(req,\s*res\)\s*=>\s*\{/g,
  (match, method, path, session) => {
    return "router." + method + "('" + path + "', " + session + ", asyncHandler(async (req, res) => {";
  }
);

// Also handle routes without session middleware
code = code.replace(
  /router\.(get|post)\('([^']+)',\s*\(req,\s*res\)\s*=>\s*\{/g,
  (match, method, path) => {
    return "router." + method + "('" + path + "', asyncHandler(async (req, res) => {";
  }
);

// Step 2: Remove const db = getDb(); lines (keep any remaining getDb lines for review)
code = code.replace(/^\s*const db = getDb\(\);\s*$/gm, '');

// Step 3: Replace db.prepare(SQL).all() -> await sql(SQL)
// db.prepare(SQL).get() -> await one(SQL)  
// db.prepare(SQL).run(vals) -> await store.query(SQL, [vals])
// db.prepare(SQL).get(id) -> await one(SQL, [id])
// db.prepare(SQL).all(ids) -> await sql(SQL, [ids])

// Must handle both single-quoted and template-literal SQL strings
// Also handle SQL with params passed as separate args or as spread

// First, handle .run() with params - most specific
code = code.replace(/db\.prepare\((`(?:[^`\\]|\\.)*`|'(?:[^'\\]|\\.)*')\).run\((.*?)\)/gs, 'await store.query($1, [$2])');

// Handle .get() with a single param
code = code.replace(/db\.prepare\((`(?:[^`\\]|\\.)*`|'(?:[^'\\]|\\.)*')\)\.get\(([^,)]+)\)/g, 'await one($1, [$2])');

// Handle .all() with a single param
code = code.replace(/db\.prepare\((`(?:[^`\\]|\\.)*`|'(?:[^'\\]|\\.)*')\)\.all\(([^,)]+)\)/g, 'await sql($1, [$2])');

// Handle .get() with spread params
code = code.replace(/db\.prepare\((`(?:[^`\\]|\\.)*`|'(?:[^'\\]|\\.)*')\)\.get\(\.\.\.params\)/g, 'await one($1, ...params)');
code = code.replace(/db\.prepare\((`(?:[^`\\]|\\.)*`|'(?:[^'\\]|\\.)*')\)\.all\(\.\.\.params\)/g, 'await sql($1, ...params)');

// Handle .all() and .get() with no params
code = code.replace(/db\.prepare\((`(?:[^`\\]|\\.)*`|'(?:[^'\\]|\\.)*')\)\.all\(\)/g, 'await sql($1)');
code = code.replace(/db\.prepare\((`(?:[^`\\]|\\.)*`|'(?:[^'\\]|\\.)*')\)\.get\(\)/g, 'await one($1)');

// Step 4: Replace ? with $1, $2, $3, ... ONLY in SQL strings passed to sql(), one(), store.query()
// These are the strings that came from db.prepare() calls which we just converted

// Find all calls to sql(...), one(...), store.query(...) and convert ? in the first argument
let n = 0;
code = code.replace(/(await (?:sql|one|store\.query))\((`(?:[^`\\]|\\.)*`|'(?:[^'\\]|\\.)*')/g, (match, prefix, sqlStr) => {
  n++;
  let paramIdx = 0;
  const newSql = sqlStr.replace(/\?/g, () => '$' + (++paramIdx));
  if (newSql !== sqlStr) {
    console.log('  Converted ? in sql call #' + n + ': ' + sqlStr.substring(0, 60) + '... -> ' + newSql.substring(0, 60) + '...');
  }
  return prefix + '(' + newSql;
});

// Step 5: Fix cleanup - remove stray 'await' keywords inside non-async contexts
// (The asyncHandler wrapping handles this)

// Step 6: Remove empty params arrays
code = code.replace(/,\s*\[\s*\]\)/g, ')');

// Count and report
const routeCount = (code.match(/asyncHandler/g) || []).length;
const dbCount = (code.match(/getDb\(\)/g) || []).length;
const sqlCount = (code.match(/await (?:sql|one|store\.query)/g) || []).length;

// Write the converted file
fs.writeFileSync('D:\\LABCOOP\\backend\\src\\routes\\admin_converted.js', code, 'utf8');

console.log('=== Conversion Results ===');
console.log('asyncHandler wrappers:', routeCount);
console.log('getDb() remaining (should be 0):', dbCount);
console.log('await sql/one/store.query calls:', sqlCount);
console.log(' ');
console.log('Check admin_converted.js for correctness.');
