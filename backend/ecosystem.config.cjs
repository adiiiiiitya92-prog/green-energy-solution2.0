module.exports = {
  apps: [
    {
      name: 'ges-backend-api',
      script: 'server.js',
      instances: 1, // Single instance maximizes memory efficiency on low-resource VPS
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      node_args: '--max-old-space-size=512',
      env: {
        NODE_ENV: 'production',
        PORT: 5050
      },
      time: true,
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    }
  ]
};
