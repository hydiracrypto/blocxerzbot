// ============================================================
// APEX-5 · Technical Indicators
// SMA, EMA, RSI, MACD, ATR, Bollinger, Donchian — array-based
// Dipakai oleh 5 strategi master trader
// ============================================================

import type { Candle } from './binance'

export function sma(values: number[], period: number): number[] {
  const out: number[] = []
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= period) sum -= values[i - period]
    out.push(i >= period - 1 ? sum / period : NaN)
  }
  return out
}

export function ema(values: number[], period: number): number[] {
  const out: number[] = []
  const k = 2 / (period + 1)
  let prev = NaN
  for (let i = 0; i < values.length; i++) {
    if (i === period - 1) {
      let sum = 0
      for (let j = 0; j < period; j++) sum += values[j]
      prev = sum / period
    } else if (i >= period) {
      prev = values[i] * k + prev * (1 - k)
    }
    out.push(prev)
  }
  return out
}

export function rsi(values: number[], period = 14): number[] {
  const out: number[] = new Array(values.length).fill(NaN)
  let avgGain = 0
  let avgLoss = 0
  for (let i = 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1]
    const gain = Math.max(diff, 0)
    const loss = Math.max(-diff, 0)
    if (i <= period) {
      avgGain += gain / period
      avgLoss += loss / period
      if (i === period) {
        out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
      }
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period
      avgLoss = (avgLoss * (period - 1) + loss) / period
      out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
    }
  }
  return out
}

export interface MacdResult {
  macd: number[]
  signal: number[]
  hist: number[]
}

export function macd(values: number[], fast = 12, slow = 26, sig = 9): MacdResult {
  const emaFast = ema(values, fast)
  const emaSlow = ema(values, slow)
  const macdLine = values.map((_, i) => (Number.isFinite(emaFast[i]) && Number.isFinite(emaSlow[i]) ? emaFast[i] - emaSlow[i] : NaN))
  const valid = macdLine.map((v) => (Number.isFinite(v) ? v : 0))
  const signalLine = ema(valid, sig)
  const hist = macdLine.map((v, i) => (Number.isFinite(v) && Number.isFinite(signalLine[i]) ? v - signalLine[i] : NaN))
  return { macd: macdLine, signal: signalLine, hist }
}

/** ATR (Wilder). Butuh period+1 candle untuk nilai pertama. */
export function atr(candles: Candle[], period = 14): number[] {
  const out: number[] = new Array(candles.length).fill(NaN)
  if (candles.length < period + 1) return out
  const trs: number[] = [0]
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i]
    const pc = candles[i - 1].c
    trs.push(Math.max(c.h - c.l, Math.abs(c.h - pc), Math.abs(c.l - pc)))
  }
  let prev = 0
  for (let i = 1; i <= period; i++) prev += trs[i]
  prev /= period
  out[period] = prev
  for (let i = period + 1; i < candles.length; i++) {
    prev = (prev * (period - 1) + trs[i]) / period
    out[i] = prev
  }
  return out
}

export interface BollingerResult {
  upper: number[]
  middle: number[]
  lower: number[]
}

export function bollinger(values: number[], period = 20, mult = 2): BollingerResult {
  const middle = sma(values, period)
  const upper: number[] = []
  const lower: number[] = []
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1 || !Number.isFinite(middle[i])) {
      upper.push(NaN)
      lower.push(NaN)
      continue
    }
    let variance = 0
    for (let j = i - period + 1; j <= i; j++) variance += (values[j] - middle[i]) ** 2
    const sd = Math.sqrt(variance / period)
    upper.push(middle[i] + mult * sd)
    lower.push(middle[i] - mult * sd)
  }
  return { upper, middle, lower }
}

/** Highest high / lowest low dari N candle sebelum index i (exclude candle i). */
export function highestHigh(candles: Candle[], i: number, lookback: number): number {
  let hi = -Infinity
  for (let j = Math.max(0, i - lookback); j < i; j++) hi = Math.max(hi, candles[j].h)
  return hi
}

export function lowestLow(candles: Candle[], i: number, lookback: number): number {
  let lo = Infinity
  for (let j = Math.max(0, i - lookback); j < i; j++) lo = Math.min(lo, candles[j].l)
  return lo
}

export function last<T>(arr: T[], offsetFromEnd = 0): T | undefined {
  const idx = arr.length - 1 - offsetFromEnd
  return idx >= 0 ? arr[idx] : undefined
}
