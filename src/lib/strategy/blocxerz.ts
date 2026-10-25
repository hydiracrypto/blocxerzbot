// ═══════════════════════════════════════════════════════════════════════
// BLOCXERZ v3.0 SIGNAL ENGINE — Port lengkap dari Pine Script
// ICT Bias · FVG Path · Levels · QM · 8-Factor Confluence · BUY/SELL
//
// F1 HTF Trend (4H EMA50/200)      F5 Premium–Discount location
// F2 MTF Structure (bias ≥ med)    F6 FVG/VI zone confluence
// F3 Fresh CHoCH/MSS trigger       F7 Volume displacement
// F4 Liquidity sweep / QM sweep    F8 Displacement candle
//
// Signal = score ≥ threshold + bias aligned + fresh trigger + SL gates
// + cooldown. Non-repainting: evaluasi HANYA pada candle CLOSED.
// ═══════════════════════════════════════════════════════════════════════
import { Candle, TF, TF_MS, SourceId } from '@/lib/mexc/market-data'

export interface StrategyParams {
  minScore: number // default 7
  qmMinScore: number // default 6
  trigBars: number // 8
  sweepLb: number // 24
  cooldown: number // 15
  allowFlip: boolean
  volMult: number // 1.2
  bodyRatio: number // 0.55
  slLb: number // 12
  slBufAtr: number // 0.5
  maxSlAtr: number // 3.0
  tp1m: number
  tp2m: number
  tp3m: number
  qmPlen: number // 3
  qmMinH: number // 0.5
  qmGiveup: number // 3.0
  qmMaxRet: number // 36
  zoneLookback: number // 1000 (auto utk 15m)
}

export const DEFAULT_PARAMS: StrategyParams = {
  minScore: 7,
  qmMinScore: 6,
  trigBars: 8,
  sweepLb: 24,
  cooldown: 15,
  allowFlip: true,
  volMult: 1.2,
  bodyRatio: 0.55,
  slLb: 12,
  slBufAtr: 0.5,
  maxSlAtr: 3.0,
  tp1m: 1.0,
  tp2m: 2.0,
  tp3m: 3.0,
  qmPlen: 3,
  qmMinH: 0.5,
  qmGiveup: 3.0,
  qmMaxRet: 36,
  zoneLookback: 1000,
}

export interface SignalEvent {
  dir: 1 | -1
  entry: number
  sl: number
  tp1: number
  tp2: number
  tp3: number
  score: number
  factors: number[]
  isQM: boolean
  kind: 'CORE' | 'QM'
}

export interface StrategyInput {
  m15: Candle[]
  m30: Candle[]
  h1: Candle[]
  h4: Candle[]
  d1: Candle[]
  w1: Candle[]
  source: SourceId
}

export interface StrategyResult {
  symbol: string
  barT: number
  price: number
  bias: { dir: number; conf: number; reason: string; struct: string; draw: string }
  scores: { buy: number; sell: number }
  factors: { buy: number[]; sell: number[] }
  levels: { pwh: number; pwl: number; pdh: number; pdl: number; eq: number }
  qm: {
    status: string
    bullActive: boolean
    bearActive: boolean
    bullEvent: boolean
    bearEvent: boolean
    slBuy: number | null
    slSell: number | null
  }
  signal: SignalEvent | null
  tfAlign: string
  zones: { bull: number; bear: number }
  atr: number
  source: SourceId
}

// ═══════════════════════════════════════════════════════════════════════
// INDICATORS
// ═══════════════════════════════════════════════════════════════════════
export function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1)
  const out: number[] = []
  let prev = values[0] ?? 0
  for (let i = 0; i < values.length; i++) {
    const v = i === 0 ? values[0] : values[i] * k + prev * (1 - k)
    out.push(v)
    prev = v
  }
  return out
}

export function sma(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN)
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= period) sum -= values[i - period]
    if (i >= period - 1) out[i] = sum / period
  }
  return out
}

export function atr(candles: Candle[], period = 14): number[] {
  const out: number[] = new Array(candles.length).fill(NaN)
  let prevClose = candles.length > 0 ? candles[0].c : 0
  let a = NaN
  let sum = 0
  let count = 0
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]
    const tr = i === 0 ? c.h - c.l : Math.max(c.h - c.l, Math.abs(c.h - prevClose), Math.abs(c.l - prevClose))
    prevClose = c.c
    if (i < period) {
      sum += tr
      count++
      if (i === period - 1) a = sum / period
    } else {
      a = (a! * (period - 1) + tr) / period
    }
    out[i] = a
  }
  return out
}

function lowest(c: Candle[], from: number, to: number): number {
  let lo = Infinity
  for (let i = Math.max(0, from); i <= Math.min(c.length - 1, to); i++) if (c[i].l < lo) lo = c[i].l
  return lo === Infinity ? NaN : lo
}
function highest(c: Candle[], from: number, to: number): number {
  let hi = -Infinity
  for (let i = Math.max(0, from); i <= Math.min(c.length - 1, to); i++) if (c[i].h > hi) hi = c[i].h
  return hi === -Infinity ? NaN : hi
}

// ═══════════════════════════════════════════════════════════════════════
// MTF STRUCTURE — pivot swing + BOS/CHoCH (Pine f_struct_data)
// ═══════════════════════════════════════════════════════════════════════
interface StructEvent {
  t: number // open time of the bar where break happened
  closeT: number // close time
  dir: 1 | -1
  isChoch: boolean
}
interface StructState {
  dir: number
  events: StructEvent[]
}

function structure(candles: Candle[], pLen = 3): StructState {
  const a = atr(candles, 14)
  const events: StructEvent[] = []
  let sh: number | null = null
  let sl: number | null = null
  let dir = 0
  let chochBar = -1

  for (let i = pLen * 2; i < candles.length; i++) {
    const idx = i - pLen // candidate pivot bar
    // pivothigh confirmed at i: high[idx] is max of [idx-pLen, idx+pLen]
    let isPh = true
    let isPl = true
    for (let k = idx - pLen; k <= idx + pLen; k++) {
      if (k === idx) continue
      if (candles[k].h >= candles[idx].h) isPh = false
      if (candles[k].l <= candles[idx].l) isPl = false
      if (!isPh && !isPl) break
    }
    const thr = !isNaN(a[i]) ? a[i] * 2.5 : 0
    if (isPh && (sh === null || Math.abs(candles[idx].h - sh) >= thr)) sh = candles[idx].h
    if (isPl && (sl === null || Math.abs(candles[idx].l - sl) >= thr)) sl = candles[idx].l

    const c = candles[i]
    if (sh !== null && c.c > sh && dir !== 1) {
      const isChoch = dir === -1
      dir = 1
      sh = null
      chochBar = i
      events.push({ t: c.t, closeT: c.t + TF_MS['15m'], dir: 1, isChoch })
    }
    if (sl !== null && c.c < sl && dir !== -1) {
      const isChoch = dir === 1
      dir = -1
      sl = null
      chochBar = i
      events.push({ t: c.t, closeT: c.t + TF_MS['15m'], dir: -1, isChoch })
    }
  }
  void chochBar
  return { dir, events }
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN EVALUATION — deterministic replay pada candle closed terakhir
// ═══════════════════════════════════════════════════════════════════════
export function evaluate(symbol: string, input: StrategyInput, params: StrategyParams = DEFAULT_PARAMS): StrategyResult | null {
  const base = input.m15
  if (base.length < 60) return null

  // ── Weekly / Daily levels (dari candle 1w & 1d yang sudah closed) ──
  const w1c = input.w1.filter((c) => c.c > 0)
  const d1c = input.d1.filter((c) => c.c > 0)
  // bar terakhir pada array = candle yang belum tuntas → level "prev" = dua dari belakang
  const wClosed = w1c.slice(0, -1)
  const dClosed = d1c.slice(0, -1)
  const pwh = wClosed.length >= 1 ? wClosed[wClosed.length - 1].h : NaN
  const pwl = wClosed.length >= 1 ? wClosed[wClosed.length - 1].l : NaN
  const pdh = dClosed.length >= 1 ? dClosed[dClosed.length - 1].h : NaN
  const pdl = dClosed.length >= 1 ? dClosed[dClosed.length - 1].l : NaN
  const atrW1Arr = atr(wClosed.length >= 15 ? wClosed : w1c, 14)
  const atrW1 = atrW1Arr[atrW1Arr.length - 1] ?? NaN

  const baseAtrArr = atr(base, 14)
  const volAvgArr = sma(
    base.map((c) => c.v),
    20
  )
  const h4Ema50 = ema(
    input.h4.map((c) => c.c),
    50
  )
  const h4Ema200 = ema(
    input.h4.map((c) => c.c),
    200
  )

  // ── MTF structure states (4H / 1H / 30m / 15m) ──
  const st4h = structure(input.h4, 3)
  const st1h = structure(input.h1, 3)
  const st30 = structure(input.m30, 3)
  const st15 = structure(base, 3)

  const lastBar = base[base.length - 1]
  const barT = lastBar.t

  // choch events → freshness dalam satuan bar 15m
  const chochFresh = (ev: StructEvent | undefined, tf: TF): { dir: number; barsAgo: number } => {
    if (!ev) return { dir: 0, barsAgo: Infinity }
    const seenAt = ev.t + TF_MS[tf] // terlihat saat bar HTF itu closed
    const barsAgo = Math.floor((barT + TF_MS['15m'] - seenAt) / TF_MS['15m'])
    return { dir: ev.dir, barsAgo }
  }
  const c4h = chochFresh(st4h.events[st4h.events.length - 1], '4h')
  const c1h = chochFresh(st1h.events[st1h.events.length - 1], '1h')
  const c30 = chochFresh(st30.events[st30.events.length - 1], '30m')
  const c15 = chochFresh(st15.events[st15.events.length - 1], '15m')

  const anyChochBullNow = (c4h.dir === 1 && c4h.barsAgo === 0) || (c1h.dir === 1 && c1h.barsAgo === 0)
  const anyChochBearNow = (c4h.dir === -1 && c4h.barsAgo === 0) || (c1h.dir === -1 && c1h.barsAgo === 0)

  const bullCnt = (st4h.dir === 1 ? 1 : 0) + (st1h.dir === 1 ? 1 : 0) + (st30.dir === 1 ? 1 : 0) + (st15.dir === 1 ? 1 : 0)
  const bearCnt = (st4h.dir === -1 ? 1 : 0) + (st1h.dir === -1 ? 1 : 0) + (st30.dir === -1 ? 1 : 0) + (st15.dir === -1 ? 1 : 0)

  // HTF trend (4H EMA50/200)
  const h4n = input.h4.length
  const h4close = input.h4[h4n - 1]?.c ?? NaN
  const e50 = h4Ema50[h4n - 1]
  const e200 = h4Ema200[h4n - 1]
  const h4Bull = !isNaN(h4close) && !isNaN(e50) && !isNaN(e200) && h4close > e50 && e50 > e200
  const h4Bear = !isNaN(h4close) && !isNaN(e50) && !isNaN(e200) && h4close < e50 && e50 < e200

  // ── FVG + VI zone replay (base TF) ──
  interface Zone {
    ty: number // 1 BISI, 2 SIBI, 3 VI+, 4 VI-
    top: number
    bot: number
    cbar: number // index bar pembentuk
    st: number // 0 fresh, 2 mitigated
    mitBar: number
  }
  const zones: Zone[] = []
  let lastFvgBull = -1
  let lastFvgBear = -1
  let lastViBull = -1
  let lastViBear = -1

  // sweep trackers (bar-level liquidity sweep di PWH/PWL/PDH/PDL)
  let lastPwhSweep = -1
  let lastPwlSweep = -1

  const zoneLookback = params.zoneLookback

  for (let i = 3; i < base.length; i++) {
    const c = base[i]
    const a = baseAtrArr[i]
    const gapOk = (g: number) => !isNaN(a) && g >= a * 0.01

    // FVG bull: low[i-1] > high[i-3]
    if (base[i - 1].l > base[i - 3].h && lastFvgBull !== i - 1) {
      const gap = base[i - 1].l - base[i - 3].h
      if (gap > 0 && gapOk(gap)) {
        lastFvgBull = i - 1
        zones.push({ ty: 1, top: base[i - 1].l, bot: base[i - 3].h, cbar: i - 1, st: 0, mitBar: -1 })
      }
    }
    // FVG bear
    if (base[i - 1].h < base[i - 3].l && lastFvgBear !== i - 1) {
      const gap = base[i - 3].l - base[i - 1].h
      if (gap > 0 && gapOk(gap)) {
        lastFvgBear = i - 1
        zones.push({ ty: 2, top: base[i - 3].l, bot: base[i - 1].h, cbar: i - 1, st: 0, mitBar: -1 })
      }
    }
    // VI (value imbalance) bull: body gap antara candle i-2 dan i-1
    const c1t = Math.max(base[i - 2].o, base[i - 2].c)
    const c1bd = Math.min(base[i - 2].o, base[i - 2].c)
    const c2t = Math.max(base[i - 1].o, base[i - 1].c)
    const c2b = Math.min(base[i - 1].o, base[i - 1].c)
    if (c2b > c1t && lastViBull !== i - 1 && gapOk(c2b - c1t)) {
      lastViBull = i - 1
      zones.push({ ty: 3, top: c2b, bot: c1t, cbar: i - 1, st: 0, mitBar: -1 })
    }
    if (c2t < c1bd && lastViBear !== i - 1 && gapOk(c1bd - c2t)) {
      lastViBear = i - 1
      zones.push({ ty: 4, top: c1bd, bot: c2t, cbar: i - 1, st: 0, mitBar: -1 })
    }

    // mitigasi: bar i menyentuh zona
    for (const z of zones) {
      if (z.st === 0 && i > z.cbar && c.h >= z.bot && c.l <= z.top) {
        z.st = 2
        z.mitBar = i
      }
    }
    // prune zona lama
    if (i - zoneLookback > 0) {
      while (zones.length > 0 && zones[0].cbar < i - zoneLookback) zones.shift()
    }

    // liquidity sweep detection bar-level (wick menembus level, close kembali)
    if (!isNaN(pwh) && c.h >= pwh && c.c <= pwh) lastPwhSweep = i
    if (!isNaN(pwl) && c.l <= pwl && c.c >= pwl) lastPwlSweep = i
    if (!isNaN(pdh) && c.h >= pdh && c.c <= pdh) lastPwhSweep = Math.max(lastPwhSweep, 0) // PDH ikut kontribusi sweep
    if (!isNaN(pdl) && c.l <= pdl && c.c >= pdl) lastPwlSweep = Math.max(lastPwlSweep, 0)
  }

  // ── Evaluasi pada bar CLOSED terakhir ──
  const i = base.length - 1
  const c = base[i]
  const close = c.c
  const aNow = baseAtrArr[i]
  const volAvg = volAvgArr[i]
  const eq = !isNaN(pwh) && !isNaN(pwl) ? (pwh + pwl) / 2 : NaN

  const volOk = !isNaN(volAvg) && volAvg > 0 && c.v > volAvg * params.volMult
  const dispBull = c.h > c.l && c.c > c.o && (c.c - c.o) / (c.h - c.l) >= params.bodyRatio
  const dispBear = c.h > c.l && c.c < c.o && (c.o - c.c) / (c.h - c.l) >= params.bodyRatio
  const discOk = !isNaN(eq) && close <= eq
  const premOk = !isNaN(eq) && close >= eq

  const freshBull = c4h.dir === 1 && c4h.barsAgo <= params.trigBars ? true : c1h.dir === 1 && c1h.barsAgo <= params.trigBars
  const freshBear = c4h.dir === -1 && c4h.barsAgo <= params.trigBars ? true : c1h.dir === -1 && c1h.barsAgo <= params.trigBars

  const recentPwlSweep = lastPwlSweep >= 0 && i - lastPwlSweep <= params.sweepLb
  const recentPwhSweep = lastPwhSweep >= 0 && i - lastPwhSweep <= params.sweepLb

  // ── BIAS ENGINE v2.0 (single-pass zone scan) ──
  let biasDir = 0
  let biasConf = 0
  let biasReason = 'Range not set'
  let biasStruct = '—'
  // dipakai juga di return (draw on-chart) → harus di scope fungsi, bukan blok if
  let bisiBelowPwl = NaN
  let sibiAbovePwh = NaN

  if (!isNaN(pwh) && !isNaN(pwl) && !isNaN(atrW1) && atrW1 > 0) {
    const tol = atrW1 * 0.5
    const nearPwh = Math.abs(close - pwh) <= tol || (c.h >= pwh && close <= pwh + tol)
    const nearPwl = Math.abs(close - pwl) <= tol || (c.l <= pwl && close >= pwl - tol)
    const nearPdh = !isNaN(pdh) && Math.abs(close - pdh) <= tol * 0.6
    const nearPdl = !isNaN(pdl) && Math.abs(close - pdl) <= tol * 0.6

    let sibiAbove = NaN
    let bisiBelow = NaN
    let ifvgAbove = NaN
    let ifvgBelow = NaN
    let bisiBelowPwlTy = 0
    let bisiAnyBelow = NaN
    let bisiAnyBelowTy = 0
    let sibiAbovePwhTy = 0
    let sibiAnyAbove = NaN
    let sibiAnyAboveTy = 0

    for (const z of zones) {
      const zm = (z.top + z.bot) / 2
      const isBull = z.ty === 1 || z.ty === 3
      const isBear = z.ty === 2 || z.ty === 4
      if (z.st === 0) {
        if (isBear && z.bot > close && (isNaN(sibiAbove) || z.bot < sibiAbove)) sibiAbove = z.bot
        if (isBull && z.top < close && (isNaN(bisiBelow) || z.top > bisiBelow)) bisiBelow = z.top
        if (isBull) {
          if (!isNaN(pwl) && z.top < pwl && (isNaN(bisiBelowPwl) || zm > bisiBelowPwl)) {
            bisiBelowPwl = zm
            bisiBelowPwlTy = z.ty
          }
          if (zm < close && (isNaN(bisiAnyBelow) || zm > bisiAnyBelow)) {
            bisiAnyBelow = zm
            bisiAnyBelowTy = z.ty
          }
        }
        if (isBear) {
          if (!isNaN(pwh) && z.bot > pwh && (isNaN(sibiAbovePwh) || zm < sibiAbovePwh)) {
            sibiAbovePwh = zm
            sibiAbovePwhTy = z.ty
          }
          if (zm > close && (isNaN(sibiAnyAbove) || zm < sibiAnyAbove)) {
            sibiAnyAbove = zm
            sibiAnyAboveTy = z.ty
          }
        }
      } else if (z.st === 2) {
        if (zm > close && (isNaN(ifvgAbove) || zm < ifvgAbove)) ifvgAbove = zm
        if (zm < close && (isNaN(ifvgBelow) || zm > ifvgBelow)) ifvgBelow = zm
      }
    }

    const recentPwhSweep48 = lastPwhSweep >= 0 && i - lastPwhSweep <= 48
    const recentPwlSweep48 = lastPwlSweep >= 0 && i - lastPwlSweep <= 48
    const ifvgNearAbove = !isNaN(ifvgAbove) && ifvgAbove - close <= atrW1 * 0.8
    const ifvgNearBelow = !isNaN(ifvgBelow) && close - ifvgBelow <= atrW1 * 0.8

    const mssBear = anyChochBearNow && (recentPwhSweep48 || nearPwh || nearPdh)
    const mssBull = anyChochBullNow && (recentPwlSweep48 || nearPwl || nearPdl)

    let structD = 0
    let strSt = 0
    if (mssBear && ifvgNearAbove) {
      structD = -1
      strSt = 5
      biasStruct = 'MSS Bear + IFVG'
    } else if (mssBull && ifvgNearBelow) {
      structD = 1
      strSt = 5
      biasStruct = 'MSS Bull + IFVG'
    } else if (mssBear) {
      structD = -1
      strSt = 4
      biasStruct = 'MSS Bear'
    } else if (mssBull) {
      structD = 1
      strSt = 4
      biasStruct = 'MSS Bull'
    } else if (anyChochBearNow) {
      structD = -1
      strSt = 3
      biasStruct = 'CHoCH Bear'
    } else if (anyChochBullNow) {
      structD = 1
      strSt = 3
      biasStruct = 'CHoCH Bull'
    } else if (bearCnt >= 3) {
      structD = -1
      strSt = 2
      biasStruct = `BOS Bear ${bearCnt}/4`
    } else if (bullCnt >= 3) {
      structD = 1
      strSt = 2
      biasStruct = `BOS Bull ${bullCnt}/4`
    } else if (bearCnt >= 1 && bearCnt > bullCnt) {
      structD = -1
      strSt = 1
      biasStruct = `Partial Bear ${bearCnt}/4`
    } else if (bullCnt >= 1 && bullCnt > bearCnt) {
      structD = 1
      strSt = 1
      biasStruct = `Partial Bull ${bullCnt}/4`
    }

    if (structD === 0) {
      biasReason = 'No structure — wait BOS/CHoCH'
    } else if (structD === -1) {
      biasDir = -1
      biasConf = strSt >= 4 ? 3 : strSt === 3 ? (!isNaN(bisiBelow) ? 3 : 2) : strSt === 2 ? (!isNaN(bisiBelow) ? 2 : 1) : 1
      const cn = strSt >= 5 ? ' [MSS+IFVG]' : strSt === 4 ? ' [MSS]' : ''
      if (!isNaN(sibiAbove) && !isNaN(bisiBelow)) biasReason = `Bearish${cn} · SIBI → BISI below`
      else if (!isNaN(bisiBelow)) biasReason = `Bearish${cn} · draw to BISI below`
      else if (!isNaN(sibiAbove)) biasReason = `Bearish${cn} · rebal SIBI above`
      else {
        biasReason = `Bearish${cn} · no FVG target`
        biasConf = Math.max(1, biasConf - 1)
      }
      if (close < eq && close < eq - atrW1 * 0.5) {
        biasConf = Math.max(1, biasConf - 1)
        biasReason += ' (discount—risky)'
      }
    } else {
      biasDir = 1
      biasConf = strSt >= 4 ? 3 : strSt === 3 ? (!isNaN(sibiAbove) ? 3 : 2) : strSt === 2 ? (!isNaN(sibiAbove) ? 2 : 1) : 1
      const cn = strSt >= 5 ? ' [MSS+IFVG]' : strSt === 4 ? ' [MSS]' : ''
      if (!isNaN(bisiBelow) && !isNaN(sibiAbove)) biasReason = `Bullish${cn} · BISI → SIBI above`
      else if (!isNaN(sibiAbove)) biasReason = `Bullish${cn} · draw to SIBI above`
      else if (!isNaN(bisiBelow)) biasReason = `Bullish${cn} · rebal BISI below`
      else {
        biasReason = `Bullish${cn} · no FVG target`
        biasConf = Math.max(1, biasConf - 1)
      }
      if (close > eq && close > eq + atrW1 * 0.5) {
        biasConf = Math.max(1, biasConf - 1)
        biasReason += ' (premium—risky)'
      }
    }
  }

  // ── QM (Quasimodo) state machine replay ──
  interface QMState {
    pending: boolean
    armed: boolean
    ls: number
    head: number
    headBar: number
    neck: number
    neckBar: number
    breakBar: number
    fireBar: number
  }
  const qmB: QMState = { pending: false, armed: false, ls: NaN, head: NaN, headBar: -1, neck: NaN, neckBar: -1, breakBar: -1, fireBar: -1 }
  const qmT: QMState = { pending: false, armed: false, ls: NaN, head: NaN, headBar: -1, neck: NaN, neckBar: -1, breakBar: -1, fireBar: -1 }

  let phA = NaN
  let phAbar = -1
  let phB = NaN
  let phBbar = -1
  let plA = NaN
  let plAbar = -1
  let plB = NaN
  let plBbar = -1
  let qmTEvent = false
  let qmBEvent = false

  const qmPlen = params.qmPlen
  for (let k = qmPlen * 2; k < base.length; k++) {
    const idx = k - qmPlen
    let isPh = true
    let isPl = true
    for (let m = idx - qmPlen; m <= idx + qmPlen; m++) {
      if (m === idx) continue
      if (base[m].h >= base[idx].h) isPh = false
      if (base[m].l <= base[idx].l) isPl = false
      if (!isPh && !isPl) break
    }

    if (isPh) {
      phA = phB
      phAbar = phBbar
      phB = base[idx].h
      phBbar = idx
      if (!isNaN(phA) && phB > phA) {
        // cari neck: lowest low di antara kedua pivot
        let nk = NaN
        let nkb = -1
        for (let b = phAbar + 1; b < phBbar; b++) {
          if (isNaN(nk) || base[b].l < nk) {
            nk = base[b].l
            nkb = b
          }
        }
        if (!isNaN(nk) && !isNaN(aNow) && phB - nk >= (baseAtrArr[k] ?? aNow) * params.qmMinH) {
          qmB.pending = true
          qmB.armed = false
          qmB.ls = phA
          qmB.head = phB
          qmB.headBar = phBbar
          qmB.neck = nk
          qmB.neckBar = nkb
          qmB.breakBar = -1
          qmB.fireBar = -1
        }
      }
    }
    if (isPl) {
      plA = plB
      plAbar = plBbar
      plB = base[idx].l
      plBbar = idx
      if (!isNaN(plA) && plB < plA) {
        let nk = NaN
        let nkb = -1
        for (let b = plAbar + 1; b < plBbar; b++) {
          if (isNaN(nk) || base[b].h > nk) {
            nk = base[b].h
            nkb = b
          }
        }
        if (!isNaN(nk) && !isNaN(aNow) && nk - plB >= (baseAtrArr[k] ?? aNow) * params.qmMinH) {
          qmT.pending = true
          qmT.armed = false
          qmT.ls = plA
          qmT.head = plB
          qmT.headBar = plBbar
          qmT.neck = nk
          qmT.neckBar = nkb
          qmT.breakBar = -1
          qmT.fireBar = -1
        }
      }
    }

    // transisi state pada bar k
    const cc = base[k]
    if (qmB.pending && cc.c < qmB.neck) {
      qmB.pending = false
      qmB.armed = true
      qmB.breakBar = k
    }
    if (qmB.armed) {
      if (cc.c > qmB.head) {
        qmB.armed = false
      } else if (k - qmB.breakBar > params.qmMaxRet) {
        qmB.armed = false
      } else if (cc.c < qmB.neck - aNow * params.qmGiveup) {
        qmB.armed = false
      } else if (k > qmB.breakBar && cc.h >= qmB.neck) {
        qmBEvent = k === i
        qmB.fireBar = k
        qmB.armed = false
      }
    }
    if (qmT.pending && cc.c > qmT.neck) {
      qmT.pending = false
      qmT.armed = true
      qmT.breakBar = k
    }
    if (qmT.armed) {
      if (cc.c < qmT.head) {
        qmT.armed = false
      } else if (k - qmT.breakBar > params.qmMaxRet) {
        qmT.armed = false
      } else if (cc.c > qmT.neck + aNow * params.qmGiveup) {
        qmT.armed = false
      } else if (k > qmT.breakBar && cc.l <= qmT.neck) {
        qmTEvent = k === i
        qmT.fireBar = k
        qmT.armed = false
      }
    }
  }

  const qmBullActive = qmT.pending || qmT.armed || (qmT.fireBar >= 0 && i - qmT.fireBar <= params.sweepLb)
  const qmBearActive = qmB.pending || qmB.armed || (qmB.fireBar >= 0 && i - qmB.fireBar <= params.sweepLb)

  const qmSlBuy = qmT.headBar >= 0 && !isNaN(qmT.head) ? qmT.head - aNow * params.slBufAtr : NaN
  const qmSlSell = qmB.headBar >= 0 && !isNaN(qmB.head) ? qmB.head + aNow * params.slBufAtr : NaN

  let qmStatus = '—'
  if (qmT.pending) qmStatus = 'Bull sweep ✓ · wait BOS'
  else if (qmT.armed) qmStatus = 'Bull armed · buy retest ' + qmT.neck.toFixed(2)
  else if (qmT.fireBar >= 0 && i - qmT.fireBar <= 10) qmStatus = 'Bull QM fired ✓'
  else if (qmB.pending) qmStatus = 'Bear sweep ✓ · wait BOS'
  else if (qmB.armed) qmStatus = 'Bear armed · sell retest ' + qmB.neck.toFixed(2)
  else if (qmB.fireBar >= 0 && i - qmB.fireBar <= 10) qmStatus = 'Bear QM fired ✓'

  // ── Zone confluence (F6) ──
  const zoneConf = (dir: 1 | -1): boolean => {
    const band = isNaN(aNow) ? 0 : aNow * 0.5
    for (const z of zones) {
      if (z.st !== 0) continue
      if (dir === 1 && (z.ty === 1 || z.ty === 3) && z.bot <= close && z.top >= c.l - band) return true
      if (dir === -1 && (z.ty === 2 || z.ty === 4) && z.top >= close && z.bot <= c.h + band) return true
    }
    return false
  }
  const unmitigatedBull = zones.filter((z) => z.st === 0 && (z.ty === 1 || z.ty === 3)).length
  const unmitigatedBear = zones.filter((z) => z.st === 0 && (z.ty === 2 || z.ty === 4)).length

  // ── 8-FACTOR SCORING ──
  const fB = [
    h4Bull ? 1 : 0,
    biasDir === 1 && biasConf >= 2 ? 1 : 0,
    freshBull ? 1 : 0,
    recentPwlSweep || qmBullActive ? 1 : 0,
    discOk ? 1 : 0,
    zoneConf(1) ? 1 : 0,
    volOk ? 1 : 0,
    dispBull ? 1 : 0,
  ]
  const fS = [
    h4Bear ? 1 : 0,
    biasDir === -1 && biasConf >= 2 ? 1 : 0,
    freshBear ? 1 : 0,
    recentPwhSweep || qmBearActive ? 1 : 0,
    premOk ? 1 : 0,
    zoneConf(-1) ? 1 : 0,
    volOk ? 1 : 0,
    dispBear ? 1 : 0,
  ]
  const scoreB = fB.reduce((x, y) => x + y, 0)
  const scoreS = fS.reduce((x, y) => x + y, 0)

  // ── SL / TP + gates ──
  const swLo = lowest(base, i - params.slLb + 1, i)
  const swHi = highest(base, i - params.slLb + 1, i)
  const candSlBuy = swLo - aNow * params.slBufAtr
  const candSlSell = swHi + aNow * params.slBufAtr
  const sldOkBuy = !isNaN(candSlBuy) && !isNaN(aNow) && close - candSlBuy > 0 && close - candSlBuy <= aNow * params.maxSlAtr
  const sldOkSell = !isNaN(candSlSell) && !isNaN(aNow) && candSlSell - close > 0 && candSlSell - close <= aNow * params.maxSlAtr
  const qmSldOkBuy = !isNaN(qmSlBuy) && close - qmSlBuy > 0 && close - qmSlBuy <= aNow * params.maxSlAtr
  const qmSldOkSell = !isNaN(qmSlSell) && qmSlSell - close > 0 && qmSlSell - close <= aNow * params.maxSlAtr

  // ── Cooldown (deterministik): jarak dari event trigger terakhir ──
  const lastEventBar = Math.max(
    qmT.fireBar,
    qmB.fireBar,
    c4h.barsAgo !== Infinity && c4h.barsAgo < 100 ? i - c4h.barsAgo : -1,
    c1h.barsAgo !== Infinity && c1h.barsAgo < 100 ? i - c1h.barsAgo : -1
  )
  const coolOkFinal = lastEventBar < 0 || i - lastEventBar >= Math.min(params.cooldown, 8)

  // ── Signal conditions (Pine: buy_core / sell_core / qm events) ──
  const buyCore = biasDir === 1 && scoreB >= params.minScore && freshBull && sldOkBuy
  const sellCore = biasDir === -1 && scoreS >= params.minScore && freshBear && sldOkSell
  const buyQmEv = qmTEvent && scoreB >= params.qmMinScore && qmSldOkBuy
  const sellQmEv = qmBEvent && scoreS >= params.qmMinScore && qmSldOkSell

  let signal: SignalEvent | null = null
  const buySig = (buyCore || buyQmEv) && coolOkFinal
  const sellSig = !buySig && (sellCore || sellQmEv) && coolOkFinal

  if (buySig) {
    const isQM = buyQmEv && !buyCore
    const sl = isQM ? qmSlBuy : candSlBuy
    const R = close - sl
    signal = {
      dir: 1,
      entry: close,
      sl,
      tp1: close + R * params.tp1m,
      tp2: close + R * params.tp2m,
      tp3: close + R * params.tp3m,
      score: scoreB,
      factors: fB,
      isQM,
      kind: isQM ? 'QM' : 'CORE',
    }
  } else if (sellSig) {
    const isQM = sellQmEv && !sellCore
    const sl = isQM ? qmSlSell : candSlSell
    const R = sl - close
    signal = {
      dir: -1,
      entry: close,
      sl,
      tp1: close - R * params.tp1m,
      tp2: close - R * params.tp2m,
      tp3: close - R * params.tp3m,
      score: scoreS,
      factors: fS,
      isQM,
      kind: isQM ? 'QM' : 'CORE',
    }
  }

  // TF alignment display
  const align = (d: number) => (biasDir !== 0 && d === biasDir ? '✓' : d === 0 ? '·' : '✗')
  const tfAlign = `4H${align(st4h.dir)} 1H${align(st1h.dir)} 30m${align(st30.dir)} 15m${align(st15.dir)}`

  return {
    symbol,
    barT: c.t,
    price: close,
    bias: { dir: biasDir, conf: biasConf, reason: biasReason, struct: biasStruct, draw: biasDir === 1 ? (!isNaN(sibiAbovePwh) ? 'SIBI ' + sibiAbovePwh.toFixed(2) : !isNaN(pwh) ? 'PWH ' + pwh.toFixed(2) : '—') : biasDir === -1 ? (!isNaN(bisiBelowPwl) ? 'BISI ' + bisiBelowPwl.toFixed(2) : !isNaN(pwl) ? 'PWL ' + pwl.toFixed(2) : '—') : '—' },
    scores: { buy: scoreB, sell: scoreS },
    factors: { buy: fB, sell: fS },
    levels: { pwh, pwl, pdh, pdl, eq },
    qm: { status: qmStatus, bullActive: qmBullActive, bearActive: qmBearActive, bullEvent: qmTEvent, bearEvent: qmBEvent, slBuy: isNaN(qmSlBuy) ? null : qmSlBuy, slSell: isNaN(qmSlSell) ? null : qmSlSell },
    signal,
    tfAlign,
    zones: { bull: unmitigatedBull, bear: unmitigatedBear },
    atr: aNow,
    source: input.source,
  }
}

export const FACTOR_LABELS = [
  'HTF Trend 4H',
  'MTF Structure',
  'Fresh CHoCH/MSS',
  'Liquidity Sweep',
  'Premium/Discount',
  'FVG/VI Zone',
  'Volume Displacement',
  'Displacement Candle',
]
