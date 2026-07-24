const logger = require('./logger');
const { runDatabaseBackup, cleanupOldBackups } = require('./backup');

async function runAllJobs() {
  const { store } = require('../db');
  const sql = (q, p) => store.query(q, p || []).then(r => r.rows);
  const one = (q, p) => store.query(q, p || []).then(r => r.rows[0]);

  const now = new Date();
  const results = { interest: 0, standingOrders: 0, accrual: false, backup: false, errors: [] };
  let jobId = null;

  try {
    jobId = await store.createJob('scheduler_hourly');
  } catch (e) {
    logger.error('[Scheduler] Failed to create job record', { error: e.message });
  }

  try {
    // ── Interest Credits ──
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
          const created = new Date(account.created_at);
          shouldApply = created.getMonth() !== now.getMonth() || created.getFullYear() !== now.getFullYear();
        } else {
          const lastDate = new Date(lastInterest.created_at);
          shouldApply = lastDate.getMonth() !== now.getMonth() || lastDate.getFullYear() !== now.getFullYear();
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
            const gl = require('./gl');
            const txId = txRecord?.transaction_id || '';
            if (txId) {
              await gl.postDoubleEntry(txId, [
                { account_code: '5000', debit: grossInterest, description: 'Interest expense (gross): ' + account.child_name },
                { account_code: '2400', credit: taxAmount, description: 'Interest withholding tax: ' + account.child_name },
                { account_code: '2000', credit: netInterest, description: 'Interest credited (net): ' + account.child_name },
              ], { postedBy: 'system', referenceType: 'interest', referenceNumber: txId });
            }
          } catch (glErr) {
            results.errors.push('GL interest post failed account_id=' + account.account_id + ': ' + glErr.message);
          }
          results.interest++;
        }
      }
    }

    // ── Standing Orders Processing ──
    const dueOrders = await sql("SELECT so.*, a.child_name, a.actual_balance, a.unallocated_balance FROM standing_orders so LEFT JOIN accounts a ON so.account_id = a.account_id WHERE so.is_active = 1 AND so.next_run <= CURRENT_TIMESTAMP");
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
          const gl = require('./gl');
          await gl.postDoubleEntry(soTxRecord.transaction_id, [
            { account_code: '5100', debit: amount, description: `Auto-save transfer: ${order.child_name} — ${order.description || 'Auto-save'}` },
            { account_code: '1000', credit: amount, description: `Auto-save transfer: ${order.child_name} — ${order.description || 'Auto-save'}` },
          ], { postedBy: 'system', referenceType: 'auto_save', referenceNumber: order.order_id });
        } catch (glErr) { results.errors.push('GL auto-save failed: ' + glErr.message); }
        const nextRun = new Date();
        switch (order.frequency) { case 'daily': nextRun.setDate(nextRun.getDate() + 1); break; case 'weekly': nextRun.setDate(nextRun.getDate() + 7); break; case 'monthly': nextRun.setMonth(nextRun.getMonth() + 1); break; }
        await store.query("UPDATE standing_orders SET next_run = $1, updated_at = CURRENT_TIMESTAMP WHERE order_id = $2", [nextRun.toISOString(), order.order_id]);
        results.standingOrders++;
      } catch (err) { results.errors.push('Standing order ' + order.order_id + ': ' + err.message); }
    }

    // ── Monthly Accrual Accounting ──
    if (now.getDate() === 1 && now.getHours() === 3 && now.getMinutes() >= 0 && now.getMinutes() < 30) {
      results.accrual = true;
      const gl = require('./gl');
      const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const p = await one("SELECT * FROM accounting_periods WHERE period_id=$1", [period]);
      if (p && p.is_closed) return results;
      const lastAccrual = await store.getSetting('last_accrual_run') || '';
      if (lastAccrual === period) return results;
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
      results.accrual = true;
    }

    // ── Database Backup (6:00 AM daily) ──
    if (now.getHours() === 6 && now.getMinutes() >= 0 && now.getMinutes() < 30) {
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const lastBackup = await store.getSetting('last_backup_date') || '';
      if (lastBackup !== todayStr) {
        const bkResult = await runDatabaseBackup();
        if (bkResult.success) {
          results.backup = true;
          await store.setSetting('last_backup_date', todayStr);
          await cleanupOldBackups();
        } else {
          results.errors.push('Backup failed: ' + (bkResult.reason || 'unknown'));
        }
      }
    }
  } catch (err) {
    results.errors.push('Unhandled: ' + err.message);
    logger.error('[Scheduler] Unhandled error', { error: err.message, stack: err.stack });
  }

  // ── Update job record ──
  if (jobId) {
    const completedAt = new Date().toISOString();
    const status = results.errors.length > 0 ? 'failed' : 'success';
    try {
      await store.updateJob(jobId, {
        status,
        completed_at: completedAt,
        result_summary: JSON.stringify(results),
        failed_reason: results.errors.length > 0 ? results.errors.join('; ') : null,
      });
    } catch (e) {
      logger.error('[Scheduler] Failed to update job record', { error: e.message });
    }
  }

  return results;
}

function startScheduler() {
  setInterval(async () => {
    const results = await runAllJobs().catch(e => ({ errors: [e.message] }));
    if (results?.interest) logger.info('[Scheduler] Interest credited', { count: results.interest });
    if (results?.standingOrders) logger.info('[Scheduler] Standing orders processed', { count: results.standingOrders });
    if (results?.accrual) logger.info('[Scheduler] Accrual accounting complete');
    if (results?.backup) logger.info('[Scheduler] Database backup completed');
    if (results?.errors?.length) logger.error('[Scheduler] Errors', { errors: results.errors });
  }, 60 * 60 * 1000);
  logger.info('[Scheduler] Started (hourly, dev-mode setInterval)');
}

module.exports = { startScheduler, runAllJobs };
