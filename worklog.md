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
