// ═══════════════════════════════════════════════════════════════════════
// MARKET DATA LAYER — MEXC Futures (utama) + fallback MEXC Spot / Binance
// Semua sumber = pasar sungguhan (real market data)
// ═══════════════════════════════════════════════════════════════════════

export interface Candle {
  t: number // open time ms
  o: number
  h: number
  l: number
  c: number
  v: number // base volume
  q?: number // quote volume
}

export interface TickerInfo {
  symbol: string // format MEXC futures: BTC_USDT
  lastPrice: number
  changeRate: number // 24h percent (0.0123 = 1.23%)
  quoteVolume: number // 24h quote volume USDT
  high24h?: number
  low24h?: number
}

export interface UniverseItem {
  symbol: string // BTC_USDT
  base: string // BTC
  quote: string // USDT
  maxLever: number
  contractSize: number
  priceScale: number
}

export type SourceId = 'MEXC_FUTURES' | 'MEXC_SPOT' | 'BINANCE_FUTURES'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const FUT_BASE = 'https://contract.mexc.com'
const SPOT_BASE = 'https://api.mexc.com'
const BIN_FUT = 'https://fapi.binance.com'

async function jget(url: string, timeoutMs = 12000): Promise<unknown> {
  const ctrl = new AbortController()
  const tm = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: ctrl.signal,
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(tm)
  }
}

// ── Timeframe helpers ────────────────────────────────────────────────────
export type TF = '15m' | '30m' | '1h' | '4h' | '1d' | '1w'

export const TF_MS: Record<TF, number> = {
  '15m': 900_000,
  '30m': 1_800_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
  '1w': 604_800_000,
}

const TF_FUT: Record<TF, string> = {
  '15m': 'Min15',
  '30m': 'Min30',
  '1h': 'Min60',
  '4h': 'Hour4',
  '1d': 'Day1',
  '1w': 'Week1',
}

const TF_SPOT: Record<TF, string> = {
  '15m': '15m',
  '30m': '30m',
  '1h': '60m',
  '4h': '4h',
  '1d': '1d',
  '1w': '1W',
}

const TF_BIN: Record<TF, string> = {
  '15m': '15m',
  '30m': '30m',
  '1h': '1h',
  '4h': '4h',
  '1d': '1d',
  '1w': '1w',
}

export const futToSpot = (sym: string) => sym.replace('_', '')
export const spotToFut = (sym: string) => sym.replace(/(USDT|USDC)$/, '_' + '$1').replace(/USDT_USDT$/, '_USDT')

// ── Cache ────────────────────────────────────────────────────────────────
interface CacheEntry {
  ts: number
  data: unknown
}
const g = globalThis as unknown as Record<string, Map<string, CacheEntry>>
if (!g.__mdCache) g.__mdCache = new Map()
const cache = g.__mdCache

function cacheGet<T>(key: string, ttlMs: number): T | null {
  const e = cache.get(key)
  if (e && Date.now() - e.ts < ttlMs) return e.data as T
  return null
}
function cacheSet(key: string, data: unknown) {
  cache.set(key, { ts: Date.now(), data })
}

// ═══════════════════════════════════════════════════════════════════════
// PUBLIC MARKET DATA (no auth needed)
// ═══════════════════════════════════════════════════════════════════════

let sourceHealth: Record<SourceId, { ok: boolean; lastFail: number; lastOk: number; failCount: number }> = {
  MEXC_FUTURES: { ok: true, lastFail: 0, lastOk: 0, failCount: 0 },
  MEXC_SPOT: { ok: true, lastFail: 0, lastOk: 0, failCount: 0 },
  BINANCE_FUTURES: { ok: true, lastFail: 0, lastOk: 0, failCount: 0 },
}

export function getSourceHealth() {
  return sourceHealth
}

function markFail(s: SourceId) {
  const h = sourceHealth[s]
  h.failCount++
  h.lastFail = Date.now()
  if (h.failCount >= 2) h.ok = false
}
function markOk(s: SourceId) {
  const h = sourceHealth[s]
  h.ok = true
  h.failCount = 0
  h.lastOk = Date.now()
}

// ── Klines ───────────────────────────────────────────────────────────────
async function klinesFut(symbol: string, tf: TF, limit: number): Promise<Candle[]> {
  const end = Date.now()
  const start = end - TF_MS[tf] * (limit + 2)
  const url = `${FUT_BASE}/api/v1/contract/kline/${symbol}?interval=${TF_FUT[tf]}&start=${start}&end=${end}`
  const j = (await jget(url)) as { success?: boolean; data?: { time: number[]; open: number[]; high: number[]; low: number[]; close: number[]; vol: number[]; amount?: number[] } }
  const d = j?.data
  if (!d || !Array.isArray(d.time)) throw new Error('fut kline bad shape')
  const out: Candle[] = []
  for (let i = 0; i < d.time.length; i++) {
    out.push({ t: d.time[i], o: d.open[i], h: d.high[i], l: d.low[i], c: d.close[i], v: d.vol[i], q: d.amount?.[i] })
  }
  return out
}

async function klinesSpot(symbol: string, tf: TF, limit: number): Promise<Candle[]> {
  const url = `${SPOT_BASE}/api/v3/klines?symbol=${futToSpot(symbol)}&interval=${TF_SPOT[tf]}&limit=${Math.min(limit, 1000)}`
  const j = (await jget(url)) as unknown[][]
  if (!Array.isArray(j)) throw new Error('spot kline bad shape')
  return j.map((r) => ({ t: Number(r[0]), o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5], q: +r[7] }))
}

async function klinesBinance(symbol: string, tf: TF, limit: number): Promise<Candle[]> {
  const url = `${BIN_FUT}/fapi/v1/klines?symbol=${futToSpot(symbol)}&interval=${TF_BIN[tf]}&limit=${Math.min(limit, 1500)}`
  const j = (await jget(url)) as unknown[][]
  if (!Array.isArray(j)) throw new Error('bin kline bad shape')
  return j.map((r) => ({ t: Number(r[0]), o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5], q: +r[7] }))
}

export interface KlineResult {
  candles: Candle[]
  source: SourceId
  cached: boolean
}

export async function getKlines(symbol: string, tf: TF, limit: number): Promise<KlineResult> {
  const key = `kl:${symbol}:${tf}:${limit}`
  const ttl = tf === '1w' ? 3600_000 : tf === '1d' ? 600_000 : tf === '4h' ? 300_000 : tf === '1h' ? 120_000 : tf === '30m' ? 90_000 : 55_000
  const hit = cacheGet<Candle[]>(key, ttl)
  if (hit) return { candles: hit, source: cache.get(`kls:${symbol}:${tf}:${limit}`)?.data as SourceId ?? 'MEXC_FUTURES', cached: true }

  const providers: Array<[SourceId, () => Promise<Candle[]>]> = [
    ['MEXC_FUTURES', () => klinesFut(symbol, tf, limit)],
    ['MEXC_SPOT', () => klinesSpot(symbol, tf, limit)],
    ['BINANCE_FUTURES', () => klinesBinance(symbol, tf, limit)],
  ]
  for (const [src, fn] of providers) {
    if (!sourceHealth[src].ok && Date.now() - sourceHealth[src].lastFail < 120_000) continue
    try {
      const candles = await fn()
      if (candles.length === 0) throw new Error('empty')
      markOk(src)
      cacheSet(key, candles)
      cacheSet(`kls:${symbol}:${tf}:${limit}`, src)
      return { candles, source: src, cached: false }
    } catch {
      markFail(src)
    }
  }
  throw new Error(`Semua sumber data gagal untuk ${symbol} ${tf}`)
}

// ── Universe (daftar semua aset futures) ─────────────────────────────────
export async function getUniverse(): Promise<{ items: UniverseItem[]; source: SourceId }> {
  const hit = cacheGet<{ items: UniverseItem[]; source: SourceId }>('universe', 900_000)
  if (hit) return hit

  // 1) MEXC Futures contract list
  try {
    const j = (await jget(`${FUT_BASE}/api/v1/contract/detail`, 15000)) as { data?: Array<Record<string, unknown>> }
    if (j?.data && Array.isArray(j.data)) {
      const items: UniverseItem[] = j.data
        .filter((c) => {
          const sym = String(c.symbol ?? '')
          return sym.endsWith('_USDT') && c.isDeleverageStage !== true && c.state === 0 && c.isHidden !== 1
        })
        .map((c) => ({
          symbol: String(c.symbol),
          base: String(c.baseCoin ?? c.symbol.split('_')[0]),
          quote: 'USDT',
          maxLever: Number(c.maxLever ?? 50),
          contractSize: Number(c.contractSize ?? 1),
          priceScale: Number(c.priceScale ?? 4),
        }))
      if (items.length > 0) {
        const out = { items, source: 'MEXC_FUTURES' as SourceId }
        cacheSet('universe', out)
        markOk('MEXC_FUTURES')
        return out
      }
    }
    throw new Error('bad universe')
  } catch {
    markFail('MEXC_FUTURES')
  }

  // 2) MEXC Spot exchangeInfo (aset MEXC sungguhan)
  try {
    const j = (await jget(`${SPOT_BASE}/api/v3/exchangeInfo`, 15000)) as { symbols?: Array<Record<string, unknown>> }
    if (j?.symbols && Array.isArray(j.symbols)) {
      const bad = /(UP|DOWN|3L|3S|5L|5S)$/
      const items: UniverseItem[] = j.symbols
        .filter((s) => s.status === 'TRADING' || s.status === 'ENABLED')
        .filter((s) => s.quoteAsset === 'USDT' && !bad.test(String(s.baseAsset)))
        .map((s) => ({
          symbol: `${s.baseAsset}_USDT`,
          base: String(s.baseAsset),
          quote: 'USDT',
          maxLever: 50,
          contractSize: 1,
          priceScale: Number(s.baseAssetPrecision ?? 4),
        }))
      if (items.length > 0) {
        const out = { items, source: 'MEXC_SPOT' as SourceId }
        cacheSet('universe', out)
        return out
      }
    }
    throw new Error('bad spot universe')
  } catch {
    markFail('MEXC_SPOT')
  }

  // 3) Binance Futures exchangeInfo (fallback terakhir)
  const j = (await jget(`${BIN_FUT}/fapi/v1/exchangeInfo`, 15000)) as { symbols?: Array<Record<string, unknown>> }
  const items: UniverseItem[] = (j?.symbols ?? [])
    .filter((s) => s.contractType === 'PERPETUAL' && s.quoteAsset === 'USDT' && s.status === 'TRADING')
    .map((s) => ({
      symbol: `${s.baseAsset}_USDT`,
      base: String(s.baseAsset),
      quote: 'USDT',
      maxLever: 50,
      contractSize: 1,
      priceScale: 4,
    }))
  markOk('BINANCE_FUTURES')
  const out = { items, source: 'BINANCE_FUTURES' as SourceId }
  cacheSet('universe', out)
  return out
}

// ── All tickers (24h stats untuk scanner & volume radar) ─────────────────
export async function getAllTickers(): Promise<{ map: Map<string, TickerInfo>; source: SourceId }> {
  const hit = cacheGet<{ map: Map<string, TickerInfo>; source: SourceId }>('tickers', 20_000)
  if (hit) return hit

  // 1) MEXC Futures tickers
  try {
    const j = (await jget(`${FUT_BASE}/api/v1/contract/ticker`, 15000)) as { data?: Array<Record<string, unknown>> }
    if (j?.data && Array.isArray(j.data)) {
      const map = new Map<string, TickerInfo>()
      for (const t of j.data) {
        const sym = String(t.symbol ?? '')
        if (!sym.endsWith('_USDT')) continue
        map.set(sym, {
          symbol: sym,
          lastPrice: Number(t.lastPrice ?? 0),
          changeRate: Number(t.riseFallRate ?? 0),
          quoteVolume: Number(t.quoteVolume ?? 0),
          high24h: Number(t.high24h ?? 0),
          low24h: Number(t.low24h ?? 0),
        })
      }
      if (map.size > 0) {
        const out = { map, source: 'MEXC_FUTURES' as SourceId }
        cacheSet('tickers', out)
        markOk('MEXC_FUTURES')
        return out
      }
    }
    throw new Error('bad tickers')
  } catch {
    markFail('MEXC_FUTURES')
  }

  // 2) MEXC Spot ticker/24hr
  try {
    const j = (await jget(`${SPOT_BASE}/api/v3/ticker/24hr`, 15000)) as Array<Record<string, unknown>>
    if (Array.isArray(j)) {
      const map = new Map<string, TickerInfo>()
      for (const t of j) {
        const sym = String(t.symbol ?? '')
        if (!sym.endsWith('USDT') || sym.includes('_')) continue
        map.set(spotToFut(sym), {
          symbol: spotToFut(sym),
          lastPrice: Number(t.lastPrice ?? 0),
          changeRate: Number(t.priceChangePercent ?? 0) / 100,
          quoteVolume: Number(t.quoteVolume ?? 0),
          high24h: Number(t.highPrice ?? 0),
          low24h: Number(t.lowPrice ?? 0),
        })
      }
      if (map.size > 0) {
        const out = { map, source: 'MEXC_SPOT' as SourceId }
        cacheSet('tickers', out)
        return out
      }
    }
    throw new Error('bad spot tickers')
  } catch {
    markFail('MEXC_SPOT')
  }

  // 3) Binance Futures 24hr
  const j = (await jget(`${BIN_FUT}/fapi/v1/ticker/24hr`, 15000)) as Array<Record<string, unknown>>
  const map = new Map<string, TickerInfo>()
  for (const t of j) {
    const sym = String(t.symbol ?? '')
    if (!sym.endsWith('USDT')) continue
    map.set(spotToFut(sym), {
      symbol: spotToFut(sym),
      lastPrice: Number(t.lastPrice ?? 0),
      changeRate: Number(t.priceChangePercent ?? 0) / 100,
      quoteVolume: Number(t.quoteVolume ?? 0),
      high24h: Number(t.highPrice ?? 0),
      low24h: Number(t.lowPrice ?? 0),
    })
  }
  markOk('BINANCE_FUTURES')
  const out = { map, source: 'BINANCE_FUTURES' as SourceId }
  cacheSet('tickers', out)
  return out
}

// ── Last price (ringan, per symbol, untuk monitor posisi) ────────────────
const priceCache = new Map<string, { p: number; ts: number }>()
export async function getLastPrice(symbol: string): Promise<number> {
  const c = priceCache.get(symbol)
  if (c && Date.now() - c.ts < 8000) return c.p
  const tickers = await getAllTickers()
  const t = tickers.map.get(symbol)
  if (t && t.lastPrice > 0) {
    priceCache.set(symbol, { p: t.lastPrice, ts: Date.now() })
    return t.lastPrice
  }
  const k = await getKlines(symbol, '15m', 3)
  const last = k.candles[k.candles.length - 1]
  priceCache.set(symbol, { p: last.c, ts: Date.now() })
  return last.c
}
