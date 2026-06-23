const fs = require('fs');
const cp = require('child_process');

// Read the full converted file
const code = fs.readFileSync('D:\\LABCOOP\\backend\\src\\routes\\admin_converted.js', 'utf8');
const lines = code.split('\n');

// Create a minimal wrapper module that matches the beginning of admin_converted.js
// Start with the first 580 lines, then skip to the problematic section
const header = `const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../async-handler');
const { store, sqlite } = require('../db');
const sql = (q, ...p) => store.query(q, p).then(r => r.rows);
const one = (q, ...p) => store.query(q, p).then(r => r.rows[0]);
`;

// Take lines 0-580 from the original, but strip the existing requires/imports 
// and replace with the header above
let testCode = header;
// Lines 580-610
testCode += lines.slice(580, 610).join('\n') + '\n\nmodule.exports = router;\n';

fs.writeFileSync('D:\\LABCOOP\\backend\\src\\routes\\admin_test2.js', testCode, 'utf8');
try {
  const result = cp.execSync('node -c "D:\\LABCOOP\\backend\\src\\routes\\admin_test2.js"', { encoding: 'utf8' });
  console.log('Test PASS');
} catch (e) {
  console.log('Test FAIL:', e.stderr || e.message);
}
