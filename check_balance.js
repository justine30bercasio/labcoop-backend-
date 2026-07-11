const { store } = require('./src/db');
(async () => {
  const result = await store.query(
    "SELECT account_id, actual_balance, child_name, member_id FROM accounts WHERE member_id = $1",
    ['000001']
  );
  const a = result.rows[0];
  console.log('Account:', JSON.stringify({ id: a.account_id, name: a.child_name, member_id: a.member_id, actual_balance: Number(a.actual_balance) }, null, 2));
  
  const txs = await store.query(
    "SELECT type, amount, balance_before, balance_after, created_at FROM transactions WHERE account_id = $1 ORDER BY created_at ASC",
    [a.account_id]
  );
  txs.rows.forEach(t => {
    console.log(t.type, Number(t.amount), 'before:', Number(t.balance_before), 'after:', Number(t.balance_after));
  });
  
  // Compute what the balance SHOULD be (deposits - withdrawals, excluding fees)
  const allTxs = txs.rows;
  let savingsBalance = 0;
  allTxs.forEach(t => {
    const type = t.type;
    const amount = Number(t.amount);
    if (['deposit', 'interest_credit', 'interest', 'interest_income'].includes(type)) {
      savingsBalance += amount;
    } else if (['withdrawal', 'loan_payment'].includes(type)) {
      savingsBalance -= amount;
    }
    // fee and penalty are NOT deducted from savings balance
    console.log(`  After ${type}: savings balance = ${savingsBalance}`);
  });
  
  console.log('\nCorrect closing balance:', savingsBalance);
  process.exit(0);
})();
