function startScheduler() {
  const { store } = require('../db');

  setInterval(() => {
    try {
      const db = require('../db').getDb();
      const accounts = db.prepare('SELECT * FROM accounts').all();
      const now = new Date();

      // ── Interest Credits ──
      for (const account of accounts) {
        if (account.actual_balance <= 0) continue;

        const product = account.savings_product_id
          ? db.prepare('SELECT * FROM savings_products WHERE product_id = ?').get(account.savings_product_id)
          : db.prepare("SELECT * FROM savings_products WHERE product_id = 'sp_regular'").get();

        if (!product) continue;

        let rate = product.interest_rate;
        let shouldApply = false;

        if (product.interest_frequency === 'daily') {
          rate = rate / 365;
          shouldApply = true;
        } else if (product.interest_frequency === 'monthly') {
          const lastInterest = db.prepare(
            "SELECT created_at FROM transactions WHERE account_id = ? AND (type = 'interest_credit' OR type = 'interest') ORDER BY created_at DESC LIMIT 1"
          ).get(account.account_id);

          if (!lastInterest) {
            shouldApply = true;
          } else {
            const lastDate = new Date(lastInterest.created_at);
            shouldApply = lastDate.getMonth() !== now.getMonth() || lastDate.getFullYear() !== now.getFullYear();
          }
        } else if (product.interest_frequency === 'yearly') {
          const lastInterest = db.prepare(
            "SELECT created_at FROM transactions WHERE account_id = ? AND (type = 'interest_credit' OR type = 'interest') ORDER BY created_at DESC LIMIT 1"
          ).get(account.account_id);

          if (!lastInterest) {
            shouldApply = true;
          } else {
            const lastDate = new Date(lastInterest.created_at);
            shouldApply = lastDate.getFullYear() !== now.getFullYear();
          }
        }

        if (shouldApply && rate > 0) {
          const interestAmount = Math.round(account.actual_balance * rate * 100) / 100;
          if (interestAmount > 0) {
            store.creditInterest(account.account_id, interestAmount);
            console.log(`[Scheduler] Credited PHP ${interestAmount} interest to ${account.child_name}`);
          }
        }
      }

      // ── Standing Orders Processing ──
      const dueOrders = db.prepare(
        "SELECT so.*, a.child_name, a.actual_balance, a.unallocated_balance FROM standing_orders so LEFT JOIN accounts a ON so.account_id = a.account_id WHERE so.is_active = 1 AND so.next_run <= datetime('now')"
      ).all();

      for (const order of dueOrders) {
        try {
          const amount = Number(order.amount);
          if (Number(order.actual_balance) < amount) {
            console.log(`[Scheduler] Skipping standing order ${order.order_id} for ${order.child_name}: insufficient balance`);
            continue;
          }

          if (order.target_goal_id) {
            // Transfer to goal
            const goal = db.prepare('SELECT * FROM goal_jars WHERE goal_id = ?').get(order.target_goal_id);
            if (goal) {
              const newAllocated = Math.round((Number(goal.current_allocated) + amount) * 100) / 100;
              db.prepare('UPDATE goal_jars SET current_allocated = ?, updated_at = datetime(\'now\') WHERE goal_id = ?').run(newAllocated, order.target_goal_id);
            }
          }

          // Deduct from account balance
          const newBalance = Math.round((Number(order.actual_balance) - amount) * 100) / 100;
          const newUnallocated = Math.round((Number(order.unallocated_balance) - amount) * 100) / 100;
          db.prepare("UPDATE accounts SET actual_balance = ?, unallocated_balance = ?, updated_at = datetime('now') WHERE account_id = ?").run(newBalance, Math.max(0, newUnallocated), order.account_id);

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
          db.prepare("UPDATE standing_orders SET next_run = ?, updated_at = datetime('now') WHERE order_id = ?").run(nextRun.toISOString(), order.order_id);

          console.log(`[Scheduler] Auto-save PHP ${amount} for ${order.child_name} (${order.frequency})`);
        } catch (err) {
          console.error(`[Scheduler] Standing order ${order.order_id} error:`, err.message);
        }
      }
    } catch (err) {
      console.error('[Scheduler] Error:', err.message);
    }
  }, 60 * 60 * 1000);

  console.log('[Scheduler] Started (interest + standing orders, hourly)');
}

module.exports = { startScheduler };
