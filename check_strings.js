const fs = require('fs');
const code = fs.readFileSync('D:\\LABCOOP\\backend\\src\\routes\\admin_converted.js', 'utf8');
let inStr = false, inTmpl = false, strChar = '', inTmplExpr = 0;
let inLineComment = false, inBlockComment = false;
let lines = code.split('\n');
let openStrLine = 0, openTmplLine = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  inLineComment = false;
  for (let j = 0; j < line.length; j++) {
    const ch = line[j], next = line[j + 1];
    if (inBlockComment) {
      if (ch === '*' && next === '/') { inBlockComment = false; j++; }
      continue;
    }
    if (inLineComment) continue;
    if (ch === '/' && next === '/') { inLineComment = true; j++; continue; }
    if (ch === '/' && next === '*') { inBlockComment = true; j++; continue; }
    if (inStr) {
      if (ch === strChar) {
        inStr = false;
        // Check for \ before the closing quote
        let k = j - 1;
        let escapes = 0;
        while (k >= 0 && line[k] === '\\') { escapes++; k--; }
        if (escapes % 2 === 1) inStr = true; // escaped quote, still in string
      }
      continue;
    }
    if (inTmpl && inTmplExpr === 0) {
      if (ch === '`') { inTmpl = false; continue; }
      if (ch === '$' && next === '{') { inTmplExpr++; j++; continue; }
      continue;
    }
    if (inTmplExpr > 0) {
      if (ch === '{') inTmplExpr++;
      if (ch === '}') inTmplExpr--;
      continue;
    }
    if (ch === "'" || ch === '"') { inStr = true; strChar = ch; openStrLine = i + 1; continue; }
    if (ch === '`') { inTmpl = true; openTmplLine = i + 1; continue; }
  }
}
if (inStr) console.log('UNTERMINATED STRING starting at line', openStrLine, 'with char', strChar);
if (inTmpl) console.log('UNTERMINATED TEMPLATE starting at line', openTmplLine);
if (!inStr && !inTmpl) console.log('All strings and templates properly terminated');
