// ═══════════════════════════════════════════════════════════════════════
// PM2 CONFIG — BLOCXERZ MEXC Desk 24/7 di VPS
// Pakai:  pm2 start ecosystem.config.js && pm2 save && pm2 startup
// ═══════════════════════════════════════════════════════════════════════
const path = require('path')

module.exports = {
  apps: [
    {
      name: 'blocxerz',
      cwd: __dirname,
      script: path.join(__dirname, '.next', 'standalone', 'server.js'),
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        HOSTNAME: '0.0.0.0',
        // DATABASE_URL dibaca dari .next/standalone/.env (diisi deploy.sh)
      },
      max_memory_restart: '700M',
      time: true,
      autorestart: true,
    },
  ],
}
