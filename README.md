# BLOCXERZ MEXC DESK v3.0

> **Edisi Monumen Rawagede** — Bot trading otomatis MEXC Futures dengan arsitektur **6 Agent Otonom 24/7** dan Signal Engine strategi **BLOCXERZ v3.0** (ICT · FVG · QM · MTF Confluence).

Bot ini memindai **seluruh aset futures USDT** di MEXC, menyaring pair dengan volume & momentum terbaik, menilai setiap pair dengan **8 faktor konfluensi** ala trader profesional, lalu **membuka posisi LONG/SHORT secara otomatis** beserta Stop Loss, Take Profit bertingkat, dan manajemen risiko — semuanya berjalan tanpa campur tangan manusia, 24 jam sehari, 7 hari seminggu.

---

## ✦ Fitur Utama

| Fitur | Keterangan |
|---|---|
| 🤖 **6 Agent Otonom** | Pair Scanner → Volume Radar → Strategy Engine → Position Sizer → Executor → Risk Monitor, siklus 20 detik |
| 📊 **Pasar Sungguhan** | Data harga & volume real-time, 6 sumber dengan failover otomatis |
| 🧠 **Strategi BLOCXERZ v3.0** | Port lengkap dari Pine Script: FVG/VI zone, struktur MTF, Bias Engine v2, QM state machine, 8-factor confluence |
| 🛡️ **Manajemen Risiko** | Risk % per trade, SL berbasis swing ± ATR, TP bertingkat 1R/2R/3R, break-even otomatis, daily loss guard |
| 🖥️ **Dashboard Real-time** | Monitoring agent, sinyal, posisi, riwayat, log, pengaturan — polling tanpa WebSocket |
| 📱 **Mobile Friendly** | Tampilan responsif 390px+ tanpa overflow |
| 🕊️ **Tema Monumen Rawagede** | Palet granit & emas, logo tugu marmer, teks berjalan peringatan pahlawan |

---

## ✦ Arsitektur 6 Agent

```
┌─────────────────┐   ┌──────────────┐   ┌─────────────────┐
│  AGENT 1        │   │  AGENT 2     │   │  AGENT 3        │
│  Pair Scanner   │──▶│ Volume Radar │──▶│ Strategy Engine │
│  Scan semua     │   │ Filter vol,  │   │ Skor 8 faktor   │
│  aset USDT      │   │ momentum     │   │ per pair, 6 TF  │
└─────────────────┘   └──────────────┘   └────────┬────────┘
                                                  │ skor ≥ 7
┌─────────────────┐   ┌──────────────┐   ┌────────▼────────┐
│  AGENT 6        │   │  AGENT 5     │   │  AGENT 4        │
│  Risk Monitor   │◀──│ Executor     │◀──│ Position Sizer  │
│  BE, ladder TP, │   │ Order market │   │ Ukuran posisi   │
│  SL, daily guard│   │ + SL/TP      │   │ dari risk %     │
└─────────────────┘   └──────────────┘   └─────────────────┘
```

- **Agent 1 — Pair Scanner**: memindai seluruh aset futures USDT (800+), filter stablecoin & volume minimum, menyusun watchlist top N.
- **Agent 2 — Volume Radar**: memantau volume 24 jam, lonjakan momentum, dan likuiditas watchlist.
- **Agent 3 — Strategy Engine**: menilai tiap pair pada 6 timeframe — hanya **bar yang sudah closed** (non-repainting), menghasilkan skor konfluensi BUY/SELL.
- **Agent 4 — Position Sizer**: menghitung ukuran posisi dari *risk % equity* ÷ jarak Stop Loss.
- **Agent 5 — Executor**: mengeksekusi order market + SL/TP trigger order; mode PAPER (simulasi harga riil) atau LIVE (MEXC Futures).
- **Agent 6 — Risk Monitor**: TP1 → pindah break-even, ladder TP 33/33/34, mode penuh di TP3, prioritas SL, penjaga kerugian harian.

---

## ✦ Strategi BLOCXERZ v3.0

Signal Engine hasil port setia dari Pine Script v3.0:

- **Struktur pasar multi-timeframe** (4H/1H/30m/15m): pivot 3/3, BOS & CHoCH.
- **Bias Engine v2**: arah bias bull/bear dari MSS/CHoCH/BOS/Partial + posisi harga terhadap PWH/PWL/PDH/PDL.
- **Zona FVG & VI**: deteksi, mitigasi, dan pembersihan zona otomatis.
- **QM State Machine**: `pending → armed → fired` dengan skor minimum tersendiri.
- **8 Faktor Konfluensi** per sisi (BUY/SELL): entry hanya saat skor ≥ 7/8 (dapat diatur).
- **SL/TP**: swing ± 0.5 ATR (maks 3 ATR), target 1R/2R/3R, flip otomatis saat sinyal berlawanan, cooldown per pair.

Semua parameter dapat diubah langsung dari tab **Pengaturan** di dashboard — tanpa menyentuh kode.

---

## ✦ Sumber Data Pasar (Anti Rate-Limit)

Rantai failover 6 sumber — bot tetap hidup walau satu sumber diblokir/di-ban:

```
MEXC Futures → MEXC Spot → Binance Futures → Binance Spot → Bybit → OKX
```

- Throttle 150ms per host (anti-burst)
- **Ban-aware**: HTTP 418 → istirahat ≥ 10 menit, 429 → ≥ 60 detik (Retry-After dihormati), 403/451 → 5 menit
- **Stale-cache rescue**: bila semua sumber gagal, data terakhir yang valid tetap dipakai

> Di beberapa wilayah (mis. AS/sandbox), domain futures MEXC & Binance bisa ter-blokir geo — bot otomatis pindah ke Bybit/OKX. Di VPS umumnya langsung tersambung ke **MEXC Futures**.

---

## ✦ Instalasi (Lokal)

**Kebutuhan**: Node.js 20+ (atau Bun), npm/bun.

```bash
# 1. Clone repo
git clone https://github.com/hydiracrypto/blocxerzbot.git
cd blocxerzbot

# 2. Environment
cp .env.example .env

# 3. Install dependencies
bun install        # atau: npm install

# 4. Siapkan database SQLite
npx prisma db push

# 5. Jalankan mode development
npm run dev
# buka http://localhost:3000
```

---

## ✦ Deploy ke VPS (Production)

```bash
# Upload/clone di VPS, lalu:
bash scripts/deploy.sh
```

Script otomatis: pasang Node 20 → install dependencies → perbaiki `DATABASE_URL` ke path absolut VPS → `prisma generate` + `db:push` → build production (standalone) → jalankan dengan **PM2** (autorestart, startup on boot, port 3000).

Perintah PM2 yang berguna:

```bash
pm2 status          # lihat status
pm2 logs blocxerz   # lihat log
pm2 restart blocxerz
```

---

## ✦ Mode PAPER vs LIVE

| | PAPER (default) | LIVE |
|---|---|---|
| Harga | Pasar sungguhan | Pasar sungguhan |
| Eksekusi | Simulasi lokal | Order nyata MEXC Futures |
| API Key | Tidak perlu | **Wajib** (isi di tab Pengaturan) |
| Risiko | Tanpa modal | **Dana nyata** |

Mengaktifkan LIVE menampilkan **dialog peringatan** dan butuh konfirmasi eksplisit. API key MEXC disimpan di database lokal server Anda sendiri.

> ⚠️ **PERINGATAN RISIKO**: Trading futures menggunakan leverage berisiko tinggi dan dapat mengakibatkan hilangnya seluruh modal. Gunakan hanya dana yang siap Anda hilangkan. Kinerja masa lalu tidak menjamin hasil di masa depan. Seluruh keputusan trading dan risikonya adalah tanggung jawab Anda.

---

## ✦ Dashboard

| Tab | Isi |
|---|---|
| **Scanner** | Tabel seluruh aset (volume 24 jam) + Volume Radar watchlist |
| **Sinyal & Analisa** | Skor 8 faktor BUY/SELL per pair, struktur MTF, status QM, feed sinyal |
| **Posisi** | PnL real-time posisi terbuka + tombol tutup manual |
| **Riwayat** | Statistik win rate, PnL kumulatif, daftar trade |
| **Log Agent** | Konsol aktivitas 6 agent, dapat difilter |
| **Pengaturan** | Mode PAPER/LIVE, API key, seluruh parameter risiko & strategi |

Header dashboard menampilkan status bot, uptime, siklus, dan **teks berjalan peringatan Monumen Perjuangan Rawagede**.

---

## ✦ Struktur Proyek

```
blocxerzbot/
├── src/
│   ├── app/                  # Next.js App Router
│   │   ├── api/              # status, analysis, positions, trades, logs, settings, control
│   │   └── page.tsx          # dashboard (6 tab)
│   ├── components/
│   │   ├── dashboard/        # header (ticker Rawagede), agents, tab-tab dashboard
│   │   └── ui/               # komponen shadcn/ui
│   ├── lib/
│   │   ├── strategy/blocxerz.ts   # port lengkap strategi Pine Script v3.0
│   │   ├── agents/orchestrator.ts # pengatur jadwal & alur 6 agent
│   │   ├── agents/state.ts        # settings persist + status agent
│   │   └── mexc/
│   │       ├── market-data.ts     # 6 sumber data + anti-rate-limit
│   │       └── trader.ts          # klien signed MEXC Futures (HMAC-SHA256)
│   └── hooks/
├── prisma/schema.prisma      # Setting, BotState, Signal, Position, Trade, AgentLog
├── scripts/deploy.sh         # deploy otomatis VPS + PM2
├── ecosystem.config.js       # konfigurasi PM2
└── db/                       # SQLite (lokal — tidak ikut di-commit)
```

---

## ✦ Konfigurasi Strategi (Default)

| Parameter | Default | Keterangan |
|---|---|---|
| Risk per trade | 1% | % equity yang dipertaruhkan per posisi |
| Leverage | 10x | Leverage futures |
| Skor masuk minimum | 7/8 | Ambang 8-factor confluence |
| Skor QM minimum | 6 | Ambang state machine QM |
| TP1 / TP2 / TP3 | 1R / 2R / 3R | Ladder keluar 33% / 33% / 34% |
| SL buffer | 0.5 ATR | Di luar swing high/low |
| SL maksimum | 3 ATR | Batas jarak Stop Loss |
| Cooldown | Aktif | Jeda per pair setelah trade |
| Flip | Aktif | Balik arah saat sinyal berlawanan |
| Daily loss guard | Aktif | Hentikan bot bila rugi harian melewati batas |

---

## ✦ Teknologi

[Next.js 16](https://nextjs.org) · TypeScript · Tailwind CSS · shadcn/ui · Prisma (SQLite) · PM2 · Lucide Icons

---

## ✦ Kenang Monumen Perjuangan Rawagede

Tema visual bot ini adalah penghormatan untuk **Monumen Perjuangan Rawagede** — Taman Makam Pahlawan Sampurna Raga, Desa Balongsari, Rawamerta, Karawang, Jawa Barat. Pada **9 Desember 1947**, 431 putra terbaik gugur mempertahankan kemerdekaan; 181 pahlawan kini bersemayam di taman ini.

> *"Kami yang kini terbaring antara Karawang-Bekasi…"* — Chairil Anwar, 1948

**Jas Merah — Jangan sekali-kali melupakan sejarah.**
