# Worklog

---
Task ID: 1
Agent: Main Agent (Z.ai)
Task: Membangun bot trading otomatis MEXC Futures dengan strategi BLOCXERZ v3.0 (dari file Pine Script user) dan arsitektur 6 Agent Otonom 24/7

Work Log:
- Baca kedua file strategi user: BLOCXERZ_v3.0_Signal_Engine.pine.txt (1706 baris) & BLOCXERZ_v3.0_Backtest_Strategy.pine.txt — ekstrak logika lengkap: FVG/VI zones, PWH/PWL/PDH/PDL, MTF structure (4H/1H/30m/15m pivot 3/3 + BOS/CHoCH), bias engine v2, QM state machine, 8-factor confluence scoring, SL/TP R-multiple, cooldown, non-repainting bar close
- Load skill fullstack-dev, init environment Next.js 16
- Tes konektivitas: contract.mexc.com DIBLOKIR Akamai dari sandbox; api.mexc.com (spot), fapi.binance.com, Bybit, OKX BISA diakses → arsitektur fallback berlapis
- prisma/schema.prisma: Setting, BotState, Signal, Position, Trade, AgentLog → db:push
- src/lib/mexc/market-data.ts: MarketData facade dgn fallback chain MEXC_FUTURES → MEXC_SPOT → BINANCE_FUTURES (klines 6 TF, universe, tickers, health tracking, cache TTL)
- src/lib/mexc/trader.ts: MEXC Futures signed client (HMAC-SHA256): order submit/cancel, leverage, positions, assets + SIDE codes + contract conversion
- src/lib/strategy/blocxerz.ts: PORT LENGKAP strategi Pine ke TypeScript — deterministic replay per bar closed: ATR/SMA/EMA, structure per TF, FVG/VI detection + mitigasi + prune, bias engine v2 (MSS/CHoCH/BOS/Partial), QM state machine (pending→armed→fired), 8-factor scoring B/S, SL gates (swing ± 0.5 ATR, max 3 ATR), TP 1R/2R/3R, cooldown, non-repainting
- src/lib/agents/state.ts: BotSettings persist DB + OrchestratorState globalThis + 6 AgentStatus
- src/lib/agents/orchestrator.ts: siklus 20 detik — A1 Pair Scanner (523 aset, filter stablecoin & vol min, watchlist top N), A2 Volume Radar, A3 Strategy Engine (kline 6 TF per pair, skip jika bar belum closed), A4 Position Sizer (risk % equity / jarak SL), A5 Executor (PAPER simulasi + LIVE order MEXC: entry market + SL/TP trigger orders + flip), A6 Risk Monitor (TP1→BE, ladder 33/33/34, TP3 full mode, SL priority, daily loss guard), closePosition helper
- API routes: /api/status, /api/analysis, /api/positions (GET+POST close manual), /api/trades+stats, /api/logs, /api/settings (GET masked, POST validasi + cek akun MEXC), /api/control (start/stop/reset/demo-trade)
- Dashboard UI (dark trading theme, TanStack-free polling): header status+kontrol, 6 agent cards, KPI strip, 6 tab: Scanner (tabel pasar + radar), Sinyal & Analisa (factor dots 8 faktor per sisi + sinyal feed), Posisi (PnL live + close manual), Riwayat (stats win rate/PnL), Log Agent (konsol filterable), Pengaturan (mode PAPER/LIVE dgn dialog peringatan, API key, semua parameter risiko & strategi)
- Perbaikan: hot-reload orchestrator via CODE_VERSION (timer lama diganti otomatis), filter stablecoin watchlist (USDC dll), filter analisa ke watchlist aktif
- Uji end-to-end via API + agent-browser: siklus agent, demo trade (LONG BTC @ 80399.33, sizing 0.0207 BTC akurat utk risiko 1%), monitoring PnL live, close manual → trade tercatat +0.38 (fee 0.02% disertakan), restore minScore 7/6, lint bersih, screenshot desktop 1440px & mobile 390px OK

Stage Summary:
- Aplikasi Next.js 16 lengkap: bot MEXC Futures dgn strategi BLOCXERZ v3.0 asli (port setia dari Pine user) + 6 Agent Otonom 24/7
- Di sandbox: data pasar dari MEXC Spot/Binance Futures (fallback, karena domain futures MEXC geo-blocked Akamai) — tetap harga pasar sungguhan
- Di server user (VPS tanpa blokir): koneksi langsung MEXC Futures untuk data & eksekusi LIVE
- Mode PAPER default (harga riil, tanpa modal); LIVE butuh API key + toggle eksplisit dgn dialog peringatan
- Semua parameter Pine dapat diatur di UI: minScore 7, qmMinScore 6, TP 1R/2R/3R, SL buffer 0.5 ATR, max 3 ATR, cooldown, flip

---
Task ID: 2
Agent: Main Agent (Z.ai)
Task: Perbaiki error "Scanner gagal: HTTP 418" (Pair Scanner diblokir Binance)

Work Log:
- Diagnosis: HTTP 418 dari Binance = IP auto-ban rate limit. Penyebab: contract.mexc.com (403 Akamai) + MEXC Spot sempat gagal → seluruh trafik jatuh ke Binance Futures → weight tembak → ban. Fakta baru: endpoint data Binance Futures (fapi) & Binance Spot exchangeInfo juga region-blocked (403/timeout) dari sandbox
- Rewrite src/lib/mexc/market-data.ts: (1) 6 sumber data — MEXC_FUTURES, MEXC_SPOT, BINANCE_FUTURES, BINANCE_SPOT, BYBIT (v5 linear perp), OKX (v5 SWAP) dgn mapping simbol/TF per sumber; (2) throttle per-host 150ms (anti-burst); (3) ban-aware: HTTP 418→istirahat ≥10 menit, 429→≥60 detik (Retry-After dihormati), 403/451→5 menit, gagal lain→backoff bertahap; (4) stale-cache rescue: semua sumber gagal → data terakhir sukses dipakai (tanpa error); (5) pesan error Indonesia yg jelas
- Tambah provider: klines Bybit (max 1000 bar, reverse list), klines OKX (paginasi after=, 300 bar/hal), ticker+universe Bybit/OKX (turnover24h, volCcy24h×last)
- Fix bug runtime lama blocxerz.ts: sibiAbovePwh & bisiBelowPwl dideklarasi di dalam blok if tapi dipakai di return (baris 788) → ReferenceError potensial saat bias bull/bear. Deklarasi dipindah ke scope fungsi
- Fix tipe orchestrator.ts (executed boolean|undefined), header.tsx (label 6 sumber), status API (health 6 sumber + bannedUntil + banReason), base.tsx (tipe sources)
- Uji: skrip scripts/test-market-data.ts — universe 812 aset (BYBIT), ticker 1454 pair (MEXC_SPOT), klines 6 TF × 3 simbol OK, cache hit 0ms
- Restart dev server (setsid detach agar persisten), verifikasi siklus agent: A1 memindai 812 aset err=0, watchlist top 10, harga asli MEXC Spot (BTC 80.330), screenshot dashboard OK, banner "BYBIT PERP (fallback) · PASAR SUNGGUHAN"

Stage Summary:
- HTTP 418 tuntas: scanner tidak lagi jatuh ke satu sumber; 6 sumber pasar sungguhan + throttle + ban-aware + stale rescue
- Kesehatan sumber di sandbox: MEXC_SPOT ✓, BYBIT ✓, OKX ✓ (MEXC Futures & Binance diblokir geo — otomatis dihindari, tetap dipakai di VPS user)
- Semua agent kembali ACTIVE tanpa error; harga = pasar sungguhan

---
Task ID: 3
Agent: Main Agent (Z.ai)
Task: Panduan + paket deployment VPS untuk BLOCXERZ MEXC Desk

Work Log:
- Verifikasi build production: npm run build sukses (output standalone), prisma client ikut ter-trace, .env tersalin ke .next/standalone
- Uji standalone server di port 3001: HTTP 200, API status OK — setara dengan kondisi VPS
- Buat ecosystem.config.js (PM2: PORT 3000, HOSTNAME 0.0.0.0, autorestart, max_memory_restart 700M)
- Buat scripts/deploy.sh (instal Node 20, npm/bun install, perbaiki DATABASE_URL ke path VPS, prisma generate + db:push, build, PM2 start + startup)
- Kemas source-only zip: download/blocxerz-vps.zip (223KB, 116 file) untuk diupload ke VPS

Stage Summary:
- Deploy ke VPS = upload zip → bash scripts/deploy.sh → buka http://IP_VPS:3000 → isi API key MEXC di tab Pengaturan
- Di VPS tanpa blokir geo, sumber data otomatis MEXC FUTURES langsung

---
Task ID: 4
Agent: Main Agent (Z.ai)
Task: Ubah tema template situs + logo ke tema Monumen Rawagede (nama BLOCXERZ MEXC DESK v3.0 dipertahankan)

Work Log:
- Riset visual via image-search: Monumen Perjuangan Rawagede = piramida marmer terpotong putih + tangga tengah + pintu, papan granit hitam inskripsi emas, makam pahlawan (483 jiwa, 9 Des 1947)
- Desain palet "Granit & Emas Rawagede": background granit hangat (#0d0a06 / #14100a / #16120c), emas (yellow-500/400) sebagai aksen brand, putih marmer untuk logo; hijau/merah DIPERTAHANKAN khusus semantik trading (PnL, bull/bear, LONG/SHORT, TP, harga naik/turun, win rate)
- Logo SVG Monumen Rawagede dibuat (src/app/icon.svg + public/rawagede-monument.svg): piramida marmer putih, pintu, 3 tangga emas, bintang emas puncak, ring emas — dipakai sebagai favicon & logo header (komponen LogoRawagede inline)
- layout.tsx: title + "Edisi Monumen Rawagede", description + Karawang, favicon internal
- globals.css: --ring emas (focus state)
- header.tsx: logo monumen menggantikan Zap, "MEXC DESK" emas, subtitle + "Edisi Monumen Rawagede — Karawang 1947", RUNNING badge emas, START button emas, border header granit
- page.tsx: bg granit hangat, Skor Konfluensi emas, PAPER badge emas, tab aktif emas
- agents.tsx: ikon & status ACTIVE emas; scanner-tab: DIPANTAU emas, header granit; analysis-tab: factor dots emas; positions/trades/logs/settings: ikon emas, signal log emas, warn oranye, tombol SIMPAN emas
- Verifikasi screenshot 3 tab: konsisten, lint bersih, favicon 200

Stage Summary:
- Tema Monumen Rawagede lengkap: logo tugu piramida marmer + tangga & bintang emas, palet granit gelap + emas, semua tab konsisten, nama BLOCXERZ MEXC DESK v3.0 utuh

---
Task ID: 5
Agent: Main Agent (Z.ai)
Task: Perbaiki & rapikan tampilan mobile dashboard (laporan user + screenshot Chrome Android)

Work Log:
- Reproduksi bug via agent-browser viewport 390px: tab "Sinyal & Analisa" menyebabkan scrollWidth halaman 601px (viewport 390) — akar masalah: grid item (section tabel Strategy Engine) min-width:auto sehingga tidak bisa menyusut di bawah min-content tabel 585px; di HP user Chrome memaksa zoom-out ~68% (teks mengecil semua) + area hitam kanan + semua konten terpotong
- Fix akar: min-w-0 pada semua grid item (scanner-tab, analysis-tab) + overflow-x: clip di html/body (globals.css) + viewport eksplisit (layout.tsx: width=device-width, initialScale=1, themeColor)
- layout.tsx: export const viewport: Viewport
- analysis-tab.tsx: layout DUAL — mobile (<md) kartu per pair (symbol, harga, badge bias, alasan, baris BUY/SELL factor dots 1-8 + skor, Struktur/MTF/QM label-rows); desktop (≥md) tabel 6 kolom seperti semula
- page.tsx: TabsList grid grid-cols-3 (2 baris × 3 kolom, semua 6 tab terlihat tanpa scroll) → sm:inline-flex satu baris
- header.tsx: mobile = baris 1 [RUNNING][STOP BOT], baris 2 badge sumber data full-width truncate; desktop urutan normal (RUNNING, sumber, uptime, tombol)
- agents.tsx: fix badge ACTIVE tumpang-tindih "171 tick · 7 dtk lalu" (shrink-0 + min-w-0 truncate); judul kartu "AGENT n" + subteks nama (hapus duplikasi, tanpa potongan teks)
- scanner-tab.tsx: kolom # & VOL 24J hidden di <sm; judul dipendekkan di mobile
- positions-tab.tsx: tabel min-w-[860px] + scroll horizontal + hint "Geser tabel…" (hanya saat ada posisi); empty state di luar tabel
- trades-tab.tsx: tabel min-w-[620px] + overflow-x; empty state di luar tabel
- logs-tab.tsx: filter select w-full di mobile; settings-tab.tsx: baris Mode Live gap-3 + switch shrink-0
- Verifikasi: tsc --noEmit src/ bersih, eslint bersih, screenshot agent-browser 390px SEMUA 6 tab scrollWidth=390 (zero overflow), desktop 1440px tabel lengkap utuh, bot tetap RUNNING (A1-A6 aktif)

Stage Summary:
- Mobile 390px: tidak ada lagi halaman meluber (601→390), semua tab terlihat, kartu agent tanpa tumpang-tindih, Strategy Engine tampil sebagai kartu mudah dibaca
- Desktop 1440px: tidak ada perubahan visual (tabel lengkap tetap)
- Screenshot before/after tersimpan di download/mobile-fix/

---
Task ID: 6
Agent: Main Agent (Z.ai)
Task: Hapus badge "BYBIT PERP (fallback) · PASAR SUNGGUHAN" dari header, ganti dengan teks berjalan (running text) peringatan Monumen Perjuangan Rawagede

Work Log:
- Hapus rantai srcLabel (6 sumber + label fallback) dan badge amber-nya dari header.tsx — permintaan user: teks sumber data/fallback tidak ditampilkan lagi; import Activity ikut dibersihkan
- Buat komponen TickerRawagede di header.tsx: strip 28px di bawah baris header (dalam header sticky, selalu terlihat), teks emas mono di granit gelap #0d0a06, pemisah segmen ✦
- Teks lengkap sesuai input user (verbatim, dipecah 14 segmen): SELAMAT DATANG DI MONUMEN PERJUANGAN RAWAGEDE, 9 Des 1947 - 431 putra, dibangun Nov 1995 - diresmikan 12 Juli 1996, Taman Makam Pahlawan Sampurna Raga 181 pahlawan, puisi Chairil Anwar 1948 lengkap, JAS MERAH - JANGAN SEKALI-KALI MELUPAKAN SEJARAH
- Mekanisme marquee mulus: track w-max berisi 2 salinan teks identik, animasi CSS translateX(0 → -50%) linear infinite (globals.css: @keyframes ticker-scroll + .ticker-track, durasi via --ticker-duration default 180s), gradasi tepi kiri/kanan, prefers-reduced-motion = animasi berhenti
- Kalibrasi: lebar 1 salinan teks = 11.877px → 180s ≈ 66px/dtk (kecepatan baca nyaman)
- Verifikasi agent-browser: mobile 390px pageW=390 (zero overflow), badge BYBIT hilang, ticker bergerak (transform -950→-1016px per 1 dtk, dur 180s); desktop 1440px pageW=1440, dashboard utuh, bot tetap RUNNING (siklus 555); tsc bersih, eslint bersih
- Screenshot: download/ticker/mobile-390-header.png & desktop-1440-header.png

Stage Summary:
- Header kini: baris 1 brand+status+kontrol, baris 2 = teks berjalan peringatan Monumen Rawagede (tanpa label sumber data/fallback di mana pun)
- Teks berjalan loop mulus 3 menit/siklus, aman di mobile (tidak meluber), hormati reduced-motion
