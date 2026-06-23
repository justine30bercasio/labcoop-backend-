const fs = require('fs');
const code = fs.readFileSync('D:\\LABCOOP\\backend\\src\\routes\\admin_converted.js', 'utf8');
let bal = 0;
let inStr = false, inTmpl = false, inTmplExpr = 0, strChar = '';
const lines = code.split('\n');
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  for (let j = 0; j < line.length; j++) {
    const ch = line[j], next = line[j + 1];
    if (inStr) {
      if (ch === strChar) inStr = false;
      continue;
    }
    if (inTmpl && inTmplExpr === 0) {
      if (ch === '`') { inTmpl = false; continue; }
      if (ch === '$' && next === '{') { inTmplExpr++; j++; continue; }
      continue;
    }
    if (inTmplExpr > 0) {
      if (ch === '{') inTmplExpr++;
      if (ch === '}') { inTmplExpr--; if (inTmplExpr === 0) continue; }
      if (ch === '(') bal++;
      if (ch === ')') bal--;
      continue;
    }
    if (ch === "'" || ch === '"') { inStr = true; strChar = ch; continue; }
    if (ch === '`') { inTmpl = true; continue; }
    if (ch === '(') bal++;
    if (ch === ')') bal--;
  }
  if (bal !== 0) console.log('Line ' + (i + 1) + ' bal=' + bal + ': ' + line.trim().substring(0, 60));
  if (bal < 0) { console.log('*** NEGATIVE at line ' + (i + 1)); process.exit(1); }
}
console.log('Final balance:', bal);
