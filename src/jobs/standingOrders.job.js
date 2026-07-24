const { store } = require('../db');

module.exports = {
  name: 'standingOrders',

  executionKey: () => {
    const n = new Date();
    return `standing-orders-${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}-${String(n.getHours()).padStart(2,'0')}`;
  },

  handler: async () => {
    const sql = (q, p) => store.query(q, p || []).then(r => r.rows);
    const one = (q, p) => store.query(q, p || []).then(r => r.rows[0]);
    let count = 0;
    const errors = [];

    const dueOrders = await sql("SELECT so.*, a.child_name, a.actual_balance, a.unallocated_balance FROM standing_orders so LEFT JOIN accounts a ON so.account_id = a.account_id WHERE so.is_active = 1 AND so.next_run <= datetime('now')");
    for (const order of dueOrders) {
      try {
        const amount = Number(order.amount);
        if (Number(order.actual_balance) < amount) continue;
        const accountForOrder = await one('SELECT * FROM accounts WHERE account_id = $1', [order.account_id]);
        const maintainingBalance = Number(accountForOrder?.maintaining_balance || 0);
        if (Number(order.actual_balance) - amount < maintainingBalance) continue;
        if (order.target_goal_id) {
          const goal = await one('SELECT * FROM goal_jars WHERE goal_id = $1', [order.target_goal_id]);
          if (goal) {
            const newAllocated = Math.round((Number(goal.current_allocated) + amount) * 100) / 100;
            await store.query("UPDATE goal_jars SET current_allocated = $1, updated_at = CURRENT_TIMESTAMP WHERE goal_id = $2", [newAllocated, order.target_goal_id]);
          }
        }
        const newBalance = Math.round((Number(order.actual_balance) - amount) * 100) / 100;
        const newUnallocated = Math.round((Number(order.unallocated_balance) - amount) * 100) / 100;
        await store.query("UPDATE accounts SET actual_balance = $1, unallocated_balance = $2, updated_at = CURRENT_TIMESTAMP WHERE account_id = $3", [newBalance, Math.max(0, newUnallocated), order.account_id]);
        const soTxRecord = await store.addTransaction({ account_id: order.account_id, type: 'auto_save', amount, description: order.description || 'Auto-save transfer', balance_before: Number(order.actual_balance), balance_after: newBalance });
        try {
          const gl = require('../services/gl');
          await gl.postDoubleEntry(soTxRecord.transaction_id, [
            { account_code: '5100', debit: amount, description: `Auto-save transfer: ${order.child_name} — ${order.description || 'Auto-save'}` },
            { account_code: '1000', credit: amount, description: `Auto-save transfer: ${order.child_name} — ${order.description || 'Auto-save'}` },
          ], { postedBy: 'system', referenceType: 'auto_save', referenceNumber: order.order_id });
        } catch (glErr) { errors.push('GL auto-save failed: ' + glErr.message); }
        const nextRun = new Date();
        switch (order.frequency) { case 'daily': nextRun.setDate(nextRun.getDate() + 1); break; case 'weekly': nextRun.setDate(nextRun.getDate() + 7); break; case 'monthly': nextRun.setMonth(nextRun.getMonth() + 1); break; }
        await store.query("UPDATE standing_orders SET next_run = $1, updated_at = CURRENT_TIMESTAMP WHERE order_id = $2", [nextRun.toISOString(), order.order_id]);
        count++;
      } catch (err) { errors.push('Standing order ' + order.order_id + ': ' + err.message); }
    }

    return { standingOrders: count, errors: errors.length ? errors : undefined };
  },
};
