const { store } = require('../db');
const { runDatabaseBackup, cleanupOldBackups } = require('../services/backup');

module.exports = {
  name: 'backup',

  executionKey: () => {
    const n = new Date();
    return `backup-${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
  },

  handler: async () => {
    const bkResult = await runDatabaseBackup();
    if (bkResult.success) {
      await store.setSetting('last_backup_date', new Date().toISOString().slice(0, 10));
      await cleanupOldBackups();
      return { backup: true };
    }
    throw new Error('Backup failed: ' + (bkResult.reason || 'unknown'));
  },
};
