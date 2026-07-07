module.exports = {
  apps: [{
    name: 'labcoop-backend',
    script: 'src/index.js',
    cwd: './backend',
    instances: 1,
    exec_mode: 'fork',
    max_memory_restart: '500M',
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true,
    max_restarts: 10,
    restart_delay: 5000,
    env: {
      NODE_ENV: 'production',
    },
    shutdown_with_message: true,
  }]
};
