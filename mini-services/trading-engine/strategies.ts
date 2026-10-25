// ============================================================
// APEX-5 · Expert Strategies — "Strategi para ahli & pakar
// trading profesional terbaik dunia"
//
// 1. TURTLE   — Richard Dennis  : Donchian breakout + ATR sizing
// 2. SEYKOTA  — Ed Seykota      : EMA crossover trend following
// 3. SCHWARTZ — Marty Schwartz  : Momentum RSI + MACD + volume
// 4. PTJ      — Paul Tudor Jones: Filter macro EMA200, asimetri 1:5
// 5. BOLLINGER— John Bollinger  : Mean reversion band + RSI
//
// Semua entry hanya LONG (spot). Exit mengikuti disiplin masing-
// masing master. Risk management global di Risk Manager.
// ============================================================

import type { Candle } from './binance'
import type { MasterId } from '../../src/lib/engine-types'
import { atr, bollinger, ema, highestHigh, lowestLow, macd, rsi, sma } from './indicators'

export interface MarketCtx {
  symbol: string
  candles: Candle[] // candle CLOSED (1m)
  livePrice: number
  atr14: number
  equity: number
}

export interface EntrySignal {
  master: MasterId
  stopDist: number // jarak stop dalam USD (harga)
  takeProfitDist: number // jarak TP dalam USD (harga)
  riskPct: number // % ekuitas yang dipertaruhkan
  reason: string
}

export interface ExitSignal {
  reason: string
}

/** Data posisi yang dilihat strategi saat mengelola exit */
export interface StrategyPosition {
  entryPrice: number
  peakPrice: number
  openedAt: number
  meta: Record<string, number> // data antar-evaluasi (mis. histPrev)
}

export interface MasterStrategy {
  id: MasterId
  name: string
  trader: string
  icon: string
  role: string
  quote: string
  entry(ctx: MarketCtx): EntrySignal | null
  manageExit(pos: StrategyPosition, ctx: MarketCtx): ExitSignal | null
  /** Evaluasi intracandle per detik (stop trailing dsb) — opsional */
  manageTick?(pos: StrategyPosition, ctx: MarketCtx): ExitSignal | null
}

// ---------- 1. TURTLE — Richard Dennis ----------
// "Saya selalu percaya bahwa keberuntungan tidak bertahan lama;
//  sistem mekanis dengan risiko terukur yang bertahan."
// S1: breakout Donchian 20, stop 2N (N=ATR20), exit Donchian 10.
const turtle: MasterStrategy = {
  id: 'turtle',
  name: 'Turtle Breakout',
  trader: 'Richard Dennis',
  icon: 'turtle',
  role: 'Donchian-20 breakout · stop 2N · exit Donchian-10',
  quote: 'Trading bisa dipelajari. Sistem + disiplin risiko mengalahkan bakat.',
  entry(ctx) {
    const cs = ctx.candles
    if (cs.length < 60) return null
    const i = cs.length - 1
    const closes = cs.map((c) => c.c)
    const ema55 = ema(closes, 55)
    if (!Number.isFinite(ema55[i]) || cs[i].c <= ema55[i]) return null
    const breakout = highestHigh(cs, i, 20)
    if (cs[i].c <= breakout) return null
    if (cs[i].c <= cs[i].o) return null // harus candle hijau (momentum konfirmasi)
    const n = ctx.atr14
    if (!Number.isFinite(n) || n <= 0) return null
    const stopDist = 2 * n
    return {
      master: 'turtle',
      stopDist,
      takeProfitDist: 6 * n, // Turtle S1: bila tak exit sinyal, TP long-run 6N
      riskPct: 1.0,
      reason: `Breakout Donchian-20 ${breakout.toPrecision(6)} · close di atas EMA55 · N=${n.toPrecision(4)} — stop 2N, unit risiko 1%`,
    }
  },
  manageExit(pos, ctx) {
    const cs = ctx.candles
    const i = cs.length - 1
    if (cs.length < 12) return null
    const exitLow = lowestLow(cs, i, 10)
    if (cs[i].c < exitLow) return { reason: `Exit Turtle: close di bawah Donchian-10 (${exitLow.toPrecision(6)})` }
    return null
  },
  manageTick(pos, ctx) {
    // stop keras 2N dihitung saat entry & disimpan engine; trailing tidak dipakai S1
    return null
  },
}

// ---------- 2. SEYKOTA — Ed Seykota ----------
// "Semua orang mendapat apa yang mereka inginkan dari pasar."
// Trend following murni: EMA8/21 cross, filter EMA55, trailing 3ATR.
const seykota: MasterStrategy = {
  id: 'seykota',
  name: 'Trend Rider',
  trader: 'Ed Seykota',
  icon: 'waves',
  role: 'EMA 8/21 cross · filter EMA55 · trailing 3ATR',
  quote: 'Risiko diukur, trend diikuti, emosi dikendalikan.',
  entry(ctx) {
    const cs = ctx.candles
    if (cs.length < 60) return null
    const i = cs.length - 1
    const closes = cs.map((c) => c.c)
    const e8 = ema(closes, 8)
    const e21 = ema(closes, 21)
    const e55 = ema(closes, 55)
    if (![e8[i], e21[i], e55[i], e8[i - 1], e21[i - 1]].every(Number.isFinite)) return null
    const crossUp = e8[i - 1] <= e21[i - 1] && e8[i] > e21[i]
    if (!crossUp) return null
    if (cs[i].c <= e55[i]) return null
    if (ctx.atr14 <= 0) return null
    const stopDist = 2.2 * ctx.atr14
    return {
      master: 'seykota',
      stopDist,
      takeProfitDist: 8 * ctx.atr14, // biarkan profit berjalan
      riskPct: 1.5,
      reason: `EMA8 cross di atas EMA21 (${e8[i].toPrecision(6)} > ${e21[i].toPrecision(6)}) · harga di atas EMA55 — tren naik terkonfirmasi`,
    }
  },
  manageExit(pos, ctx) {
    const cs = ctx.candles
    if (cs.length < 24) return null
    const closes = cs.map((c) => c.c)
    const e8 = ema(closes, 8)
    const e21 = ema(closes, 21)
    const i = cs.length - 1
    if (Number.isFinite(e8[i - 1]) && Number.isFinite(e21[i - 1]) && e8[i - 1] >= e21[i - 1] && e8[i] < e21[i]) {
      return { reason: 'Exit Seykota: EMA8 cross turun di bawah EMA21 — tren berbalik' }
    }
    return null
  },
  manageTick(pos, ctx) {
    // trailing 3*ATR dari puncak — engine memanggil tiap detik dgn ATR terkini
    const trail = 3 * ctx.atr14
    if (Number.isFinite(trail) && trail > 0 && pos.peakPrice - ctx.livePrice >= trail) {
      return { reason: `Exit Seykota: trailing stop 3ATR (${trail.toPrecision(4)}) terpicu dari puncak` }
    }
    return null
  },
}

// ---------- 3. SCHWARTZ — Marty Schwartz ----------
// "Cara terbaik menghasilkan uang: momentum. Kuat terus kuat."
// RSI14 cross 60 + MACD bullish + volume > 1.3x rata-rata + EMA50 filter.
const schwartz: MasterStrategy = {
  id: 'schwartz',
  name: 'Momentum Hunter',
  trader: 'Marty Schwartz',
  icon: 'rocket',
  role: 'RSI×MACD momentum · konfirmasi volume 1.3x',
  quote: 'Jangan pernah bermain melawan momentum. Ikuti uang besar.',
  entry(ctx) {
    const cs = ctx.candles
    if (cs.length < 60) return null
    const i = cs.length - 1
    const closes = cs.map((c) => c.c)
    const vols = cs.map((c) => c.q) // volume USDT
    const r = rsi(closes, 14)
    const m = macd(closes)
    const e50 = ema(closes, 50)
    if (![r[i], r[i - 1], m.hist[i], m.hist[i - 1], e50[i]].every(Number.isFinite)) return null
    const rsiCross60 = r[i - 1] <= 60 && r[i] > 60
    if (!rsiCross60) return null
    if (m.macd[i] <= m.signal[i]) return null
    if (m.hist[i] <= m.hist[i - 1]) return null
    if (cs[i].c <= e50[i]) return null
    const volAvg = sma(vols, 20)[i]
    if (!Number.isFinite(volAvg) || cs[i].q < 1.3 * volAvg) return null
    if (ctx.atr14 <= 0) return null
    return {
      master: 'schwartz',
      stopDist: 1.5 * ctx.atr14,
      takeProfitDist: 3 * ctx.atr14,
      riskPct: 1.0,
      reason: `RSI cross 60 (${r[i - 1].toFixed(1)}→${r[i].toFixed(1)}) · MACD hist naik · volume ${(cs[i].q / volAvg).toFixed(1)}x rata-rata — momentum kuat`,
    }
  },
  manageExit(pos, ctx) {
    const cs = ctx.candles
    const i = cs.length - 1
    const closes = cs.map((c) => c.c)
    const r = rsi(closes, 14)
    if (Number.isFinite(r[i]) && r[i] < 48) {
      return { reason: `Exit Schwartz: momentum melemah — RSI turun ke ${r[i].toFixed(1)}` }
    }
    return null
  },
}

// ---------- 4. PTJ — Paul Tudor Jones ----------
// "Saya percaya Defense 10x lebih penting daripada Offense."
// Hanya long saat harga cross EMA200 dengan EMA50>EMA200 (macro uptrend),
// stop ketat 1.2 ATR, target asimetris 5R.
const ptj: MasterStrategy = {
  id: 'ptj',
  name: 'Macro Trend',
  trader: 'Paul Tudor Jones',
  icon: 'landmark',
  role: 'Filter EMA200 · stop ketat 1.2ATR · target 5R',
  quote: 'Pertahanan 10x lebih penting. Bertahanlah dulu, profit menyusul.',
  entry(ctx) {
    const cs = ctx.candles
    if (cs.length < 220) return null
    const i = cs.length - 1
    const closes = cs.map((c) => c.c)
    const e50 = ema(closes, 50)
    const e200 = ema(closes, 200)
    if (![e50[i], e200[i], e200[i - 1]].every(Number.isFinite)) return null
    const crossUp = cs[i - 1].c <= e200[i - 1] && cs[i].c > e200[i]
    if (!crossUp) return null
    if (e50[i] <= e200[i]) return null
    if (ctx.atr14 <= 0) return null
    return {
      master: 'ptj',
      stopDist: 1.2 * ctx.atr14,
      takeProfitDist: 6 * ctx.atr14, // ~5R dari stop 1.2
      riskPct: 1.5,
      reason: `Cross EMA200 dari bawah ke atas · EMA50>EMA200 (uptrend makro) — setup krusial, risiko 1:5`,
    }
  },
  manageExit(pos, ctx) {
    const cs = ctx.candles
    const i = cs.length - 1
    const closes = cs.map((c) => c.c)
    const e200 = ema(closes, 200)
    if (Number.isFinite(e200[i]) && cs[i].c < e200[i]) {
      return { reason: 'Exit PTJ: harga jatuh di bawah EMA200 — trend makro gagal' }
    }
    return null
  },
}

// ---------- 5. BOLLINGER — John Bollinger ----------
// "Band adalah cermin volatilitas; mean adalah magnet."
// Mean reversion: harga menembus band bawah lalu close kembali ke dalam,
// RSI oversold. TP ke middle band (SMA20), stop 2ATR.
const bollinger_: MasterStrategy = {
  id: 'bollinger',
  name: 'Mean Reversion',
  trader: 'John Bollinger',
  icon: 'activity',
  role: 'Bollinger(20,2) + RSI oversold · TP middle band',
  quote: 'Volatilitas selalu kembali ke rata-rata — di situ untungnya.',
  entry(ctx) {
    const cs = ctx.candles
    if (cs.length < 60) return null
    const i = cs.length - 1
    const closes = cs.map((c) => c.c)
    const bb = bollinger(closes, 20, 2)
    const r = rsi(closes, 14)
    if (![bb.lower[i], bb.lower[i - 1], bb.middle[i], r[i], r[i - 1]].every(Number.isFinite)) return null
    const dipped = cs[i - 1].c < bb.lower[i - 1] // candle sebelumnya di bawah band bawah
    const reclaimed = cs[i].c > bb.lower[i] // sekarang close kembali ke dalam band
    if (!dipped || !reclaimed) return null
    if (r[i] > 38) return null
    if (ctx.atr14 <= 0) return null
    return {
      master: 'bollinger',
      stopDist: 2 * ctx.atr14,
      takeProfitDist: Math.max(bb.middle[i] - cs[i].c, ctx.atr14), // target middle band
      riskPct: 1.0,
      reason: `Pantulan dari luar band bawah · RSI oversold ${r[i].toFixed(1)} — mean reversion ke middle band`,
    }
  },
  manageExit(pos, ctx) {
    const cs = ctx.candles
    const i = cs.length - 1
    const closes = cs.map((c) => c.c)
    const bb = bollinger(closes, 20, 2)
    if (Number.isFinite(bb.middle[i]) && cs[i].c >= bb.middle[i]) {
      return { reason: 'Exit Bollinger: harga mencapai middle band — reversion selesai' }
    }
    return null
  },
}

export const MASTERS: MasterStrategy[] = [turtle, seykota, schwartz, ptj, bollinger_]
export const MASTER_BY_ID = new Map<MasterId, MasterStrategy>(MASTERS.map((m) => [m.id, m]))
