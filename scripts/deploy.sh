#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# DEPLOY.SH — Setup otomatis BLOCXERZ MEXC Desk di VPS (Ubuntu/Debian)
# Jalankan dari folder proyek:  bash scripts/deploy.sh
# ═══════════════════════════════════════════════════════════════════════
set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"
echo "▶ Folder proyek: $PROJECT_DIR"

# ── 1) Node.js 20+ ──────────────────────────────────────────────────────
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -c2- | cut -d. -f1)" -lt 20 ]; then
  echo "▶ Menginstal Node.js 20…"
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo "▶ Node $(node -v)"

# ── 2) Dependensi ───────────────────────────────────────────────────────
if command -v bun >/dev/null 2>&1; then
  echo "▶ bun install…"; bun install
else
  echo "▶ npm install…"; npm install
fi

# ── 3) .env — path database sesuai lokasi VPS ───────────────────────────
mkdir -p "$PROJECT_DIR/db"
if grep -q '^DATABASE_URL=' .env 2>/dev/null; then
  sed -i "s|^DATABASE_URL=.*|DATABASE_URL=file:${PROJECT_DIR}/db/custom.db|" .env
else
  echo "DATABASE_URL=file:${PROJECT_DIR}/db/custom.db" > .env
fi
echo "▶ .env → $(grep DATABASE_URL .env)"

# ── 4) Prisma (generate client + buat/tuning DB) ────────────────────────
npx prisma generate
npm run db:push

# ── 5) Build production (standalone) ────────────────────────────────────
npm run build
# pastikan .env runtime tersalin ke folder standalone
cp .env .next/standalone/.env

# ── 6) PM2 — proses 24/7, auto-restart saat reboot ──────────────────────
if ! command -v pm2 >/dev/null 2>&1; then
  echo "▶ Menginstal PM2…"; sudo npm i -g pm2
fi
pm2 delete blocxerz 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save
pm2 startup 2>/dev/null | tail -1 || true

echo ""
echo "═══════════════════════════════════════════════════════"
echo "✓ SELESAI! Bot berjalan di:  http://$(curl -s ifconfig.me):3000"
echo "  Perintah berguna:"
echo "    pm2 status          — lihat status"
echo "    pm2 logs blocxerz   — lihat log live"
echo "    pm2 restart blocxerz"
echo "═══════════════════════════════════════════════════════"
