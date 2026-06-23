const fs = require('fs');
const cp = require('child_process');

const code = fs.readFileSync('D:\\LABCOOP\\backend\\src\\routes\\admin_converted.js', 'utf8');
const lines = code.split('\n');

const header = `const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../async-handler');
const { store, sqlite } = require('../db');
const sql = (q, ...p) => store.query(q, p).then(r => r.rows);
const one = (q, ...p) => store.query(q, p).then(r => r.rows[0]);
`;

// Find a route start near line 580
// Look backwards from line 580 to find a router.get or router.post
let startLine = 580;
for (let i = 580; i >= 0; i--) {
  if (lines[i].includes('router.get(') || lines[i].includes('router.post(')) {
    startLine = i;
    break;
  }
}

let testCode = header;
testCode += lines.slice(startLine, 610 + 1).join('\n') + '\nmodule.exports = router;\n';

fs.writeFileSync('D:\\LABCOOP\\backend\\src\\routes\\admin_test3.js', testCode, 'utf8');
try {
  const result = cp.execSync('node -c "D:\\LABCOOP\\backend\\src\\routes\\admin_test3.js"', { encoding: 'utf8' });
  console.log('Test PASS');
} catch (e) {
  const stderr = e.stderr || e.message;
  console.log('Test FAIL:', stderr);
  // Try with just the shop/update route section
  let idx = -1;
  lines.forEach((l, i) => { if (l.includes("router.post('/shop/update/")) idx = i; });
  if (idx >= 0) {
    console.log('Found shop/update at line', idx + 1);
    let header2 = header;
    let code2 = header2 + lines.slice(idx, idx + 30).join('\n') + '\nmodule.exports = router;\n';
    fs.writeFileSync('D:\\LABCOOP\\backend\\src\\routes\\admin_test4.js', code2, 'utf8');
    try {
      cp.execSync('node -c "D:\\LABCOOP\\backend\\src\\routes\\admin_test4.js"', { encoding: 'utf8' });
      console.log('Test4 PASS');
    } catch (e2) {
      console.log('Test4 FAIL:', e2.stderr || e2.message);
    }
  }
}
