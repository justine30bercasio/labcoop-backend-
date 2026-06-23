const fs = require('fs');
const cp = require('child_process');
const code = fs.readFileSync('D:\\LABCOOP\\backend\\src\\routes\\admin_converted.js', 'utf8');
const lines = code.split('\n');
const start = lines.slice(0, 580).join('\n').length + 1;
const end = lines.slice(0, 610).join('\n').length + 1;
const section = code.substring(start, end);
fs.writeFileSync('D:\\LABCOOP\\backend\\src\\routes\\admin_section.js', section, 'utf8');
try {
  const result = cp.execSync('node -c "D:\\LABCOOP\\backend\\src\\routes\\admin_section.js"', { encoding: 'utf8' });
  console.log('Section syntax: OK');
  console.log(result);
} catch (e) {
  console.log('Section syntax: ERROR');
  console.log(e.stderr || e.message);
}
