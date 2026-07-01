function startScheduler() {
  const { store } = require('../db');

  setInterval(async () => {
    try {
      const sql = (q, p) => store.query(q, p || []).then(r => r.rows);
      const one = (q, p) => store.query(q, p || []).then(r => r.rows[0]);

      const accounts = await sql('SELECT * FROM accounts');
      const now = new Date();

      // ── Interest Credits ──
      for (const account of accounts) {
        if (account.actual_balance <= 0) continue;

        const product = account.savings_product_id
          ? await one('SELECT * FROM savings_products WHERE product_id = $1', [account.savings_product_id])
          : await one("SELECT * FROM savings_products WHERE product_id = 'sp_regular'");

        if (!product) continue;

        let rate = product.interest_rate;
        let shouldApply = false;

        if (product.interest_frequency === 'daily') {
          rate = rate / 365;
          shouldApply = true;
        } else if (product.interest_frequency === 'monthly') {
          const lastInterest = await one(
            "SELECT created_at FROM transactions WHERE account_id = $1 AND (type = 'interest_credit' OR type = 'interest') ORDER BY created_at DESC LIMIT 1",
            [account.account_id]
          );

          if (!lastInterest) {
            const created = new Date(account.created_at);
            shouldApply = created.getMonth() !== now.getMonth() || created.getFullYear() !== now.getFullYear();
          } else {
            const lastDate = new Date(lastInterest.created_at);
            shouldApply = lastDate.getMonth() !== now.getMonth() || lastDate.getFullYear() !== now.getFullYear();
          }
        } else if (product.interest_frequency === 'yearly') {
          const lastInterest = await one(
            "SELECT created_at FROM transactions WHERE account_id = $1 AND (type = 'interest_credit' OR type = 'interest') ORDER BY created_at DESC LIMIT 1",
            [account.account_id]
          );

          if (!lastInterest) {
            const created = new Date(account.created_at);
            shouldApply = created.getFullYear() !== now.getFullYear();
          } else {
            const lastDate = new Date(lastInterest.created_at);
            shouldApply = lastDate.getFullYear() !== now.getFullYear();
          }
        }

        if (shouldApply && rate > 0) {
          const grossInterest = Math.round(account.actual_balance * rate * 100) / 100;
          if (grossInterest > 0) {
            // Withholding tax (20% on interest per tax_config)
            const taxConfig = await one("SELECT * FROM tax_config WHERE applies_to = 'interest' AND is_active = 1 LIMIT 1");
            const taxRate = taxConfig ? Number(taxConfig.rate) / 100 : 0;
            const taxAmount = Math.round(grossInterest * taxRate * 100) / 100;
            const netInterest = Math.round((grossInterest - taxAmount) * 100) / 100;

            const tx = store.creditInterest(account.account_id, netInterest);
            try {
              const gl = require('./gl');
              const txId = tx?.transaction_id || '';
              if (txId) {
                await gl.postDoubleEntry(txId, [
                  { account_code: '5000', debit: grossInterest, description: 'Interest expense (gross): ' + account.child_name },
                  { account_code: '2400', credit: taxAmount, description: 'Interest withholding tax: ' + account.child_name },
                  { account_code: '2000', credit: netInterest, description: 'Interest credited (net): ' + account.child_name },
                ], { postedBy: 'system', referenceType: 'interest', referenceNumber: txId });
              }
            } catch (glErr) {
              console.error('[Scheduler] GL post for interest failed:', glErr.message);
            }
            console.log(`[Scheduler] Credited PHP ${netInterest} (net of ${taxAmount} withholding) to ${account.child_name}`);
          }
        }
      }

      // ── Standing Orders Processing ──
      const dueOrders = await sql(
        "SELECT so.*, a.child_name, a.actual_balance, a.unallocated_balance FROM standing_orders so LEFT JOIN accounts a ON so.account_id = a.account_id WHERE so.is_active = 1 AND so.next_run <= CURRENT_TIMESTAMP"
      );

      for (const order of dueOrders) {
        try {
          const amount = Number(order.amount);
          if (Number(order.actual_balance) < amount) {
            console.log(`[Scheduler] Skipping standing order ${order.order_id} for ${order.child_name}: insufficient balance`);
            continue;
          }
          // Check maintaining balance
          const maintainingBalance = Number(order.maintaining_balance || 0);
          if (Number(order.actual_balance) - amount < maintainingBalance) {
            console.log(`[Scheduler] Skipping standing order ${order.order_id} for ${order.child_name}: would drop below maintaining balance of ₱${maintainingBalance.toFixed(2)}`);
            continue;
          }

          if (order.target_goal_id) {
            // Transfer to goal
            const goal = await one('SELECT * FROM goal_jars WHERE goal_id = $1', [order.target_goal_id]);
            if (goal) {
              const newAllocated = Math.round((Number(goal.current_allocated) + amount) * 100) / 100;
              await store.query("UPDATE goal_jars SET current_allocated = $1, updated_at = CURRENT_TIMESTAMP WHERE goal_id = $2", [newAllocated, order.target_goal_id]);
            }
          }

          // Deduct from account balance
          const newBalance = Math.round((Number(order.actual_balance) - amount) * 100) / 100;
          const newUnallocated = Math.round((Number(order.unallocated_balance) - amount) * 100) / 100;
          await store.query("UPDATE accounts SET actual_balance = $1, unallocated_balance = $2, updated_at = CURRENT_TIMESTAMP WHERE account_id = $3", [newBalance, Math.max(0, newUnallocated), order.account_id]);

          store.addTransaction({
            account_id: order.account_id,
            type: 'auto_save',
            amount: amount,
            description: order.description || 'Auto-save transfer',
            balance_before: Number(order.actual_balance),
            balance_after: newBalance,
          });

          // Update next_run
          const nextRun = new Date();
          switch (order.frequency) {
            case 'daily': nextRun.setDate(nextRun.getDate() + 1); break;
            case 'weekly': nextRun.setDate(nextRun.getDate() + 7); break;
            case 'monthly': nextRun.setMonth(nextRun.getMonth() + 1); break;
          }
          await store.query("UPDATE standing_orders SET next_run = $1, updated_at = CURRENT_TIMESTAMP WHERE order_id = $2", [nextRun.toISOString(), order.order_id]);

          console.log(`[Scheduler] Auto-save PHP ${amount} for ${order.child_name} (${order.frequency})`);
        } catch (err) {
          console.error(`[Scheduler] Standing order ${order.order_id} error:`, err.message);
        }
      }

      // ── Monthly Accrual Accounting ──
      const nowDate = new Date();
      if (nowDate.getDate() === 1 && nowDate.getHours() === 3 && nowDate.getMinutes() >= 15 && nowDate.getMinutes() < 30) {
        const log = (msg) => { const ts = nowDate.toISOString(); console.log(`[Scheduler ${ts}] ${msg}`); };
        try {
          log('Starting monthly accrual accounting...');
          const gl = require('./gl');
          const period = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, '0')}`;

          // Check if period is already closed
          const p = await one("SELECT * FROM accounting_periods WHERE period_id=$1", [period]);
          if (p && p.is_closed) { log(`Period ${period} is closed — skipping accrual`); return; }

          // Skip if already run this month
          const lastAccrual = await store.getSetting('last_accrual_run') || '';
          if (lastAccrual === period) { log(`Accrual already ran for ${period} — skipping`); return; }

          // 1. Accrue interest receivable on outstanding loans
          const loans = await sql("SELECT l.loan_id, l.account_id, l.principal, l.interest_rate, a.child_name AS name FROM loans l JOIN accounts a ON l.account_id = a.account_id WHERE l.status='active' AND l.principal > 0");
          let accIntCount = 0;
          for (const loan of loans) {
            const monthlyInt = Math.round(Number(loan.principal) * Number(loan.interest_rate) / 100 / 12 * 100) / 100;
            if (monthlyInt <= 0) continue;
            const { v4: uuidv4 } = require('uuid');
            const entryId = uuidv4();
            await gl.postDoubleEntry(entryId, [
              { account_code: '1300', debit: monthlyInt, description: `Accrued interest receivable — ${loan.name}` },
              { account_code: '4000', credit: monthlyInt, description: `Interest income accrual — ${loan.name}` }
            ], { postedBy: 'scheduler', referenceType: 'accrual', referenceNumber: `ACR-${period}-${loan.loan_id.slice(0,8)}` });
            accIntCount++;
          }

          // 2. Accrue interest payable on savings deposits
          const savings = await sql("SELECT account_id, actual_balance FROM accounts WHERE type='savings' AND actual_balance > 0");
          const savingsRate = await store.getSetting('savings_interest_rate') || '2';
          const sRate = Number(savingsRate) / 100 / 12;
          let accIntPayCount = 0;
          for (const s of savings) {
            const monthlyInt = Math.round(Number(s.actual_balance) * sRate * 100) / 100;
            if (monthlyInt <= 0) continue;
            const { v4: uuidv4 } = require('uuid');
            const entryId = uuidv4();
            await gl.postDoubleEntry(entryId, [
              { account_code: '5000', debit: monthlyInt, description: `Interest expense accrual — savings` },
              { account_code: '2500', credit: monthlyInt, description: `Accrued interest payable — savings` }
            ], { postedBy: 'scheduler', referenceType: 'accrual', referenceNumber: `ACP-${period}-${s.account_id.slice(0,8)}` });
            accIntPayCount++;
          }

          await store.setSetting('last_accrual_run', period);
          log(`Accrual complete: ${accIntCount} loans, ${accIntPayCount} savings — ${period}`);
        } catch (err) {
          console.error('[Scheduler] Accrual error:', err.message);
        }
      }
    } catch (err) {
      console.error('[Scheduler] Error:', err.message);
    }
  }, 60 * 60 * 1000);

  console.log('[Scheduler] Started (interest + standing orders, hourly)');
}

module.exports = { startScheduler };
