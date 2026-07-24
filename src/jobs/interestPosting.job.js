const { store } = require('../db');

module.exports = {
  name: 'interestPosting',

  executionKey: () => {
    const n = new Date();
    return `interest-${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}-${String(n.getHours()).padStart(2,'0')}`;
  },

  handler: async () => {
    const sql = (q, p) => store.query(q, p || []).then(r => r.rows);
    const one = (q, p) => store.query(q, p || []).then(r => r.rows[0]);
    const now = new Date();
    let count = 0;
    const errors = [];

    const accounts = await sql('SELECT * FROM accounts');
    for (const account of accounts) {
      if (account.actual_balance <= 0) continue;
      const product = account.savings_product_id
        ? await one('SELECT * FROM savings_products WHERE product_id = $1', [account.savings_product_id])
        : await one("SELECT * FROM savings_products WHERE product_id = 'sp_regular'");
      if (!product) continue;
      let rate = product.interest_rate;
      let shouldApply = false;
      if (product.interest_frequency === 'daily') {
        rate = rate / 365; shouldApply = true;
      } else if (product.interest_frequency === 'monthly') {
        const lastInterest = await one("SELECT created_at FROM transactions WHERE account_id = $1 AND (type = 'interest_credit' OR type = 'interest') ORDER BY created_at DESC LIMIT 1", [account.account_id]);
        if (!lastInterest) {
          shouldApply = new Date(account.created_at).getMonth() !== now.getMonth() || new Date(account.created_at).getFullYear() !== now.getFullYear();
        } else {
          shouldApply = new Date(lastInterest.created_at).getMonth() !== now.getMonth() || new Date(lastInterest.created_at).getFullYear() !== now.getFullYear();
        }
      } else if (product.interest_frequency === 'yearly') {
        const lastInterest = await one("SELECT created_at FROM transactions WHERE account_id = $1 AND (type = 'interest_credit' OR type = 'interest') ORDER BY created_at DESC LIMIT 1", [account.account_id]);
        if (!lastInterest) {
          shouldApply = new Date(account.created_at).getFullYear() !== now.getFullYear();
        } else {
          shouldApply = new Date(lastInterest.created_at).getFullYear() !== now.getFullYear();
        }
      }
      if (shouldApply && rate > 0) {
        const grossInterest = Math.round(account.actual_balance * rate * 100) / 100;
        if (grossInterest > 0) {
          const taxConfig = await one("SELECT * FROM tax_config WHERE applies_to = 'interest' AND is_active = 1 LIMIT 1");
          const taxRate = taxConfig ? Number(taxConfig.rate) / 100 : 0;
          const taxAmount = Math.round(grossInterest * taxRate * 100) / 100;
          const netInterest = Math.round((grossInterest - taxAmount) * 100) / 100;
          const txRecord = await store.creditInterest(account.account_id, netInterest);
          try {
            const gl = require('../services/gl');
            const txId = txRecord?.transaction_id || '';
            if (txId) {
              await gl.postDoubleEntry(txId, [
                { account_code: '5000', debit: grossInterest, description: 'Interest expense (gross): ' + account.child_name },
                { account_code: '2400', credit: taxAmount, description: 'Interest withholding tax: ' + account.child_name },
                { account_code: '2000', credit: netInterest, description: 'Interest credited (net): ' + account.child_name },
              ], { postedBy: 'system', referenceType: 'interest', referenceNumber: txId });
            }
          } catch (glErr) {
            errors.push('GL interest post failed account_id=' + account.account_id + ': ' + glErr.message);
          }
          count++;
        }
      }
    }

    return { interest: count, errors: errors.length ? errors : undefined };
  },
};
