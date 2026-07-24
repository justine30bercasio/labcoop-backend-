const { store } = require('../db');

module.exports = {
  name: 'accrualAccounting',

  executionKey: () => {
    const n = new Date();
    return `accrual-${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`;
  },

  handler: async () => {
    const sql = (q, p) => store.query(q, p || []).then(r => r.rows);
    const one = (q, p) => store.query(q, p || []).then(r => r.rows[0]);
    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const p = await one("SELECT * FROM accounting_periods WHERE period_id=$1", [period]);
    if (p && p.is_closed) return { accrual: false, reason: 'period closed' };

    const gl = require('../services/gl');

    const loans = await sql("SELECT l.loan_id, l.principal, l.interest_rate, a.child_name AS name FROM loans l JOIN accounts a ON l.account_id = a.account_id WHERE l.status='active' AND l.principal > 0");
    for (const loan of loans) {
      const monthlyInt = Math.round(Number(loan.principal) * Number(loan.interest_rate) / 100 / 12 * 100) / 100;
      if (monthlyInt <= 0) continue;
      await gl.postDoubleEntry(require('uuid').v4(), [
        { account_code: '1300', debit: monthlyInt, description: `Accrued interest receivable — ${loan.name}` },
        { account_code: '4000', credit: monthlyInt, description: `Interest income accrual — ${loan.name}` }
      ], { postedBy: 'scheduler', referenceType: 'accrual', referenceNumber: `ACR-${period}-${loan.loan_id.slice(0,8)}` });
    }

    const savings = await sql("SELECT account_id, actual_balance FROM accounts WHERE actual_balance > 0");
    const savingsRate = Number(await store.getSetting('savings_interest_rate') || '2') / 100 / 12;
    for (const s of savings) {
      const monthlyInt = Math.round(Number(s.actual_balance) * savingsRate * 100) / 100;
      if (monthlyInt <= 0) continue;
      await gl.postDoubleEntry(require('uuid').v4(), [
        { account_code: '5000', debit: monthlyInt, description: `Interest expense accrual — savings` },
        { account_code: '2500', credit: monthlyInt, description: `Accrued interest payable — savings` }
      ], { postedBy: 'scheduler', referenceType: 'accrual', referenceNumber: `ACP-${period}-${s.account_id.slice(0,8)}` });
    }

    const activeTDs = await sql("SELECT * FROM term_deposits WHERE status='active'");
    for (const td of activeTDs) {
      const monthlyInt = Math.round(Number(td.amount) * Number(td.interest_rate) / 100 / 12 * 100) / 100;
      if (monthlyInt <= 0) continue;
      await gl.postDoubleEntry(require('uuid').v4(), [
        { account_code: '5000', debit: monthlyInt, description: 'TD interest accrual ' + (td.td_number || td.td_id.slice(0,8)) },
        { account_code: '2500', credit: monthlyInt, description: 'Accrued interest - TD ' + (td.td_number || td.td_id.slice(0,8)) }
      ], { postedBy: 'scheduler', referenceType: 'accrual', referenceNumber: 'TD-ACR-' + period });
    }

    await store.setSetting('last_accrual_run', period);
    return { accrual: true };
  },
};
