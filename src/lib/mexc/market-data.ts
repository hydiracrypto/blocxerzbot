// ═══════════════════════════════════════════════════════════════════════
// MARKET DATA LAYER — 6 SUMBER PASAR SUNGGUHAN + ANTI-RATE-LIMIT
// Urutan fallback: MEXC Futures → MEXC Spot → Binance Futures →
//                  Binance Spot → Bybit (Perp) → OKX (Swap)
//
// Perbaikan HTTP 418 (IP di-ban Binance karena weight berlebih):
//  1. Throttle per-host 150ms — tidak ada lagi burst request
//  2. Ban-aware: HTTP 418/429 → sumber diistirahatkan (Retry-After dihormati)
//  3. Stale-cache rescue: bila semua sumber gagal, data terakhir dipakai
//     ulang (tetap harga pasar sungguhan) alih-alih error
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

export type SourceId =
  | 'MEXC_FUTURES'
  | 'MEXC_SPOT'
  | 'BINANCE_FUTURES'
  | 'BINANCE_SPOT'
  | 'BYBIT'
  | 'OKX'

export const ALL_SOURCES: SourceId[] = [
  'MEXC_FUTURES',
  'MEXC_SPOT',
  'BINANCE_FUTURES',
  'BINANCE_SPOT',
  'BYBIT',
  'OKX',
]

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const FUT_BASE = 'https://contract.mexc.com'
const SPOT_BASE = 'https://api.mexc.com'
const BIN_FUT = 'https://fapi.binance.com'
const BIN_SPOT = 'https://api.binance.com'
const BYBIT = 'https://api.bybit.com'
const OKX = 'https://www.okx.com'

// ── HTTP error dengan status + Retry-After ──────────────────────────────
class HttpErr extends Error {
  status: number
  retryAfter: number // detik
  constructor(status: number, url: string, retryAfter: number, body?: string) {
    super(`HTTP ${status}${body ? ' · ' + body : ''} (${url.split('?')[0]})`)
    this.status = status
    this.retryAfter = retryAfter
  }
}

// ── Throttle per-host: jarak minimal 150ms antar request ────────────────
const HOST_GAP_MS = 150
const hostNextAt = new Map<string, number>()

async function throttleHost(host: string) {
  const now = Date.now()
  const next = hostNextAt.get(host) ?? 0
  const slot = Math.max(next, now)
  hostNextAt.set(host, slot + HOST_GAP_MS)
  const wait = slot - now
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
}

async function jget(url: string, timeoutMs = 12000): Promise<unknown> {
  const host = new URL(url).host
  await throttleHost(host)
  const ctrl = new AbortController()
  const tm = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: ctrl.signal,
      cache: 'no-store',
    })
    if (!res.ok) {
      const ra = Number.parseInt(res.headers.get('retry-after') ?? '0', 10) || 0
      let body = ''
      try {
        body = (await res.text()).slice(0, 140).replace(/\s+/g, ' ')
      } catch {
        /* abaikan */
      }
      throw new HttpErr(res.status, url, ra, body || undefined)
    }
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

const TF_BYB: Record<TF, string> = {
  '15m': '15',
  '30m': '30',
  '1h': '60',
  '4h': '240',
  '1d': 'D',
  '1w': 'W',
}

const TF_OKX: Record<TF, string> = {
  '15m': '15m',
  '30m': '30m',
  '1h': '1H',
  '4h': '4H',
  '1d': '1D',
  '1w': '1W',
}

export const futToSpot = (sym: string) => sym.replace('_', '')
export const spotToFut = (sym: string) =>
  sym.replace(/(USDT|USDC)$/, '_' + '$1').replace(/USDT_USDT$/, '_USDT')
const futToOkx = (sym: string) => sym.replace('_', '-') + '-SWAP'

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
// data terakhir yg pernah sukses (tanpa TTL) — utk stale rescue
function cacheStale<T>(key: string): T | null {
  const e = cache.get(key)
  return e ? (e.data as T) : null
}

// ═══════════════════════════════════════════════════════════════════════
// HEALTH TRACKING + BAN-AWARENESS
// ═══════════════════════════════════════════════════════════════════════
interface SourceHealth {
  ok: boolean
  lastFail: number
  lastOk: number
  failCount: number
  bannedUntil: number
  banReason: string
}

const g2 = globalThis as unknown as { __mdHealth?: Record<SourceId, SourceHealth> }
if (!g2.__mdHealth) {
  g2.__mdHealth = Object.fromEntries(
    ALL_SOURCES.map((s) => [
      s,
      { ok: true, lastFail: 0, lastOk: 0, failCount: 0, bannedUntil: 0, banReason: '' },
    ])
  ) as Record<SourceId, SourceHealth>
}
const sourceHealth = g2.__mdHealth

export function getSourceHealth() {
  return sourceHealth
}

function markOk(s: SourceId) {
  const h = sourceHealth[s]
  h.ok = true
  h.failCount = 0
  h.lastOk = Date.now()
  h.bannedUntil = 0
  h.banReason = ''
}

function markFail(s: SourceId) {
  const h = sourceHealth[s]
  h.failCount++
  h.lastFail = Date.now()
  h.ok = false
  // gagal pertama: jeda pendek; gagal berulang: istirahat 2 menit (backoff)
  h.bannedUntil = Date.now() + (h.failCount >= 2 ? 120_000 : 3_000)
  if (h.failCount >= 2) h.banReason = h.banReason || 'gagal berulang'
}

function markBan(s: SourceId, ms: number, reason: string) {
  const h = sourceHealth[s]
  h.ok = false
  h.lastFail = Date.now()
  h.bannedUntil = Date.now() + ms
  h.banReason = reason
  console.warn(`[market-data] ${s} diistirahatkan ${Math.round(ms / 1000)}s · ${reason}`)
}

function isBanned(s: SourceId) {
  return Date.now() < sourceHealth[s].bannedUntil
}

// wrapper: GET satu URL atas nama satu sumber + pencatatan otomatis health
async function srcGet(source: SourceId, url: string, timeoutMs = 12000): Promise<unknown> {
  try {
    const j = await jget(url, timeoutMs)
    markOk(source)
    return j
  } catch (e) {
    if (e instanceof HttpErr) {
      if (e.status === 418)
        markBan(source, Math.max(e.retryAfter * 1000, 600_000), 'IP di-ban rate limit (HTTP 418)')
      else if (e.status === 429)
        markBan(source, Math.max(e.retryAfter * 1000, 60_000), 'rate limit (HTTP 429)')
      else if (e.status === 403 || e.status === 451)
        markBan(source, 300_000, `akses diblokir (HTTP ${e.status})`)
      else markFail(source)
    } else {
      markFail(source)
    }
    throw e
  }
}

// ═══════════════════════════════════════════════════════════════════════
// KLINE PROVIDERS (6 sumber)
// ═══════════════════════════════════════════════════════════════════════
async function klinesFut(symbol: string, tf: TF, limit: number): Promise<Candle[]> {
  const end = Date.now()
  const start = end - TF_MS[tf] * (limit + 2)
  const url = `${FUT_BASE}/api/v1/contract/kline/${symbol}?interval=${TF_FUT[tf]}&start=${start}&end=${end}`
  const j = (await srcGet('MEXC_FUTURES', url)) as {
    success?: boolean
    data?: { time: number[]; open: number[]; high: number[]; low: number[]; close: number[]; vol: number[]; amount?: number[] }
  }
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
  const j = (await srcGet('MEXC_SPOT', url)) as Array<Array<string | number>>
  if (!Array.isArray(j)) throw new Error('spot kline bad shape')
  return j.map((r) => ({ t: Number(r[0]), o: Number(r[1]), h: Number(r[2]), l: Number(r[3]), c: Number(r[4]), v: Number(r[5]), q: Number(r[7]) }))
}

async function klinesBinance(base: string, sym: string, tf: TF, limit: number): Promise<Candle[]> {
  const url = `${base}/api/klines?symbol=${sym}&interval=${TF_BIN[tf]}&limit=${Math.min(limit, 1000)}`
  const j = (await srcGet(base === BIN_FUT ? 'BINANCE_FUTURES' : 'BINANCE_SPOT', url)) as Array<
    Array<string | number>
  >
  if (!Array.isArray(j)) throw new Error('bin kline bad shape')
  return j.map((r) => ({ t: Number(r[0]), o: Number(r[1]), h: Number(r[2]), l: Number(r[3]), c: Number(r[4]), v: Number(r[5]), q: Number(r[7]) }))
}

async function klinesBybit(symbol: string, tf: TF, limit: number): Promise<Candle[]> {
  const url = `${BYBIT}/v5/market/kline?category=linear&symbol=${symbol}&interval=${TF_BYB[tf]}&limit=${Math.min(limit, 1000)}`
  const j = (await srcGet('BYBIT', url)) as { retCode?: number; result?: { list?: string[][] } }
  const rows = j?.result?.list
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('bybit kline bad shape')
  return rows
    .map((r) => ({ t: Number(r[0]), o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5], q: +r[6] }))
    .reverse() // bybit: terbaru dulu → urutkan naik
}

async function klinesOkx(symbol: string, tf: TF, limit: number): Promise<Candle[]> {
  const inst = futToOkx(symbol)
  // OKX maks 300 bar/halaman → paginasi ke belakang dgn param "after"
  const per = 300
  const need = Math.min(limit, 1200)
  const collected = new Map<number, Candle>()
  let after: number | undefined
  for (let page = 0; page < 6 && collected.size < need; page++) {
    const url = `${OKX}/api/v5/market/candles?instId=${inst}&bar=${TF_OKX[tf]}&limit=${per}${after ? `&after=${after}` : ''}`
    const j = (await srcGet('OKX', url)) as { code?: string; data?: string[][] }
    const rows = j?.data
    if (!Array.isArray(rows) || rows.length === 0) break
    for (const r of rows) {
      const t = Number(r[0])
      if (!collected.has(t))
        collected.set(t, { t, o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[6], q: +r[7] })
    }
    if (rows.length < per) break
    after = Number(rows[rows.length - 1][0])
  }
  const out = [...collected.values()].sort((a, b) => a.t - b.t)
  if (out.length === 0) throw new Error('okx kline empty')
  return out.slice(-need)
}

export interface KlineResult {
  candles: Candle[]
  source: SourceId
  cached: boolean
}

const KL_TTL: Record<TF, number> = {
  '15m': 55_000,
  '30m': 90_000,
  '1h': 120_000,
  '4h': 300_000,
  '1d': 600_000,
  '1w': 3_600_000,
}

export async function getKlines(symbol: string, tf: TF, limit: number): Promise<KlineResult> {
  const key = `kl:${symbol}:${tf}:${limit}`
  const hit = cacheGet<Candle[]>(key, KL_TTL[tf])
  if (hit) {
    return {
      candles: hit,
      source: cache.get(`kls:${symbol}:${tf}:${limit}`)?.data as SourceId ?? 'MEXC_FUTURES',
      cached: true,
    }
  }

  const spotSym = futToSpot(symbol)
  const providers: Array<[SourceId, () => Promise<Candle[]>]> = [
    ['MEXC_FUTURES', () => klinesFut(symbol, tf, limit)],
    ['MEXC_SPOT', () => klinesSpot(symbol, tf, limit)],
    ['BINANCE_FUTURES', () => klinesBinance(BIN_FUT, spotSym, tf, limit)],
    ['BINANCE_SPOT', () => klinesBinance(BIN_SPOT, spotSym, tf, limit)],
    ['BYBIT', () => klinesBybit(spotSym, tf, limit)],
    ['OKX', () => klinesOkx(symbol, tf, limit)],
  ]

  const errs: string[] = []
  for (const [src, fn] of providers) {
    if (isBanned(src)) continue
    try {
      const candles = await fn()
      if (candles.length === 0) throw new Error('empty')
      markOk(src)
      cacheSet(key, candles)
      cacheSet(`kls:${symbol}:${tf}:${limit}`, src)
      return { candles, source: src, cached: false }
    } catch (e) {
      errs.push(`${src}: ${e instanceof Error ? e.message.slice(0, 60) : 'err'}`)
    }
  }

  // STALE RESCUE — semua sumber gagal → pakai data terakhir yg pernah sukses
  const stale = cacheStale<Candle[]>(key)
  if (stale && stale.length > 0) {
    return {
      candles: stale,
      source: cache.get(`kls:${symbol}:${tf}:${limit}`)?.data as SourceId ?? 'MEXC_FUTURES',
      cached: true,
    }
  }
  throw new Error(`Semua sumber data gagal untuk ${symbol} ${tf} · ${errs.slice(-2).join(' | ')}`)
}

// ═══════════════════════════════════════════════════════════════════════
// UNIVERSE (daftar semua aset) — 6 sumber
// ═══════════════════════════════════════════════════════════════════════
const LEVERAGED = /(UP|DOWN|3L|3S|5L|5S)$/

const mkItem = (base: string): UniverseItem => ({
  symbol: `${base}_USDT`,
  base,
  quote: 'USDT',
  maxLever: 50,
  contractSize: 1,
  priceScale: 4,
})

async function universeFut(): Promise<UniverseItem[]> {
  const j = (await srcGet('MEXC_FUTURES', `${FUT_BASE}/api/v1/contract/detail`, 15000)) as {
    data?: Array<Record<string, unknown>>
  }
  if (!j?.data || !Array.isArray(j.data)) throw new Error('bad universe')
  const items = j.data
    .filter((c) => {
      const sym = String(c.symbol ?? '')
      return sym.endsWith('_USDT') && c.isDeleverageStage !== true && c.state === 0 && c.isHidden !== 1
    })
    .map((c) => {
      const sym0 = String(c.symbol ?? '')
      return {
        symbol: sym0,
        base: String(c.baseCoin ?? sym0.split('_')[0]),
        quote: 'USDT',
        maxLever: Number(c.maxLever ?? 50),
        contractSize: Number(c.contractSize ?? 1),
        priceScale: Number(c.priceScale ?? 4),
      }
    })
  if (items.length === 0) throw new Error('universe kosong')
  return items
}

async function universeMexcSpot(): Promise<UniverseItem[]> {
  const j = (await srcGet('MEXC_SPOT', `${SPOT_BASE}/api/v3/exchangeInfo`, 15000)) as {
    symbols?: Array<Record<string, unknown>>
  }
  if (!j?.symbols || !Array.isArray(j.symbols)) throw new Error('bad spot universe')
  const items = j.symbols
    .filter((s) => s.status === 'TRADING' || s.status === 'ENABLED')
    .filter((s) => s.quoteAsset === 'USDT' && !LEVERAGED.test(String(s.baseAsset)))
    .map((s) => ({
      symbol: `${s.baseAsset}_USDT`,
      base: String(s.baseAsset),
      quote: 'USDT',
      maxLever: 50,
      contractSize: 1,
      priceScale: Number(s.baseAssetPrecision ?? 4),
    }))
  if (items.length === 0) throw new Error('universe spot kosong')
  return items
}

async function universeBinance(base: string, src: SourceId): Promise<UniverseItem[]> {
  const j = (await srcGet(src, `${base}/api/exchangeInfo`, 15000)) as {
    symbols?: Array<Record<string, unknown>>
  }
  const items = (j?.symbols ?? [])
    .filter((s) => s.quoteAsset === 'USDT' && !LEVERAGED.test(String(s.baseAsset)))
    .filter((s) =>
      base === BIN_FUT
        ? s.contractType === 'PERPETUAL' && s.status === 'TRADING'
        : s.status === 'TRADING'
    )
    .map((s) => mkItem(String(s.baseAsset)))
  if (items.length === 0) throw new Error('universe binance kosong')
  return items
}

async function universeBybit(): Promise<UniverseItem[]> {
  const j = (await srcGet('BYBIT', `${BYBIT}/v5/market/tickers?category=linear`, 15000)) as {
    retCode?: number
    result?: { list?: Array<{ symbol?: string }> }
  }
  const list = j?.result?.list ?? []
  const items = list
    .map((t) => String(t.symbol ?? ''))
    .filter((s) => s.endsWith('USDT') && !LEVERAGED.test(s.replace(/USDT$/, '')))
    .map((s) => mkItem(s.replace(/USDT$/, '')))
  if (items.length === 0) throw new Error('universe bybit kosong')
  return items
}

async function universeOkx(): Promise<UniverseItem[]> {
  const j = (await srcGet('OKX', `${OKX}/api/v5/market/tickers?instType=SWAP`, 15000)) as {
    code?: string
    data?: Array<{ instId?: string }>
  }
  const list = j?.data ?? []
  const items = list
    .map((t) => String(t.instId ?? ''))
    .filter((s) => s.endsWith('-USDT-SWAP'))
    .map((s) => mkItem(s.split('-')[0]))
  if (items.length === 0) throw new Error('universe okx kosong')
  return items
}

export async function getUniverse(): Promise<{ items: UniverseItem[]; source: SourceId }> {
  const hit = cacheGet<{ items: UniverseItem[]; source: SourceId }>('universe', 900_000)
  if (hit) return hit

  const providers: Array<[SourceId, () => Promise<UniverseItem[]>]> = [
    ['MEXC_FUTURES', universeFut],
    ['MEXC_SPOT', universeMexcSpot],
    ['BINANCE_FUTURES', () => universeBinance(BIN_FUT, 'BINANCE_FUTURES')],
    ['BINANCE_SPOT', () => universeBinance(BIN_SPOT, 'BINANCE_SPOT')],
    ['BYBIT', universeBybit],
    ['OKX', universeOkx],
  ]
  for (const [src, fn] of providers) {
    if (isBanned(src)) continue
    try {
      const items = await fn()
      const out = { items, source: src }
      cacheSet('universe', out)
      return out
    } catch {
      /* lanjut ke sumber berikutnya */
    }
  }
  const stale = cacheStale<{ items: UniverseItem[]; source: SourceId }>('universe')
  if (stale) return stale
  throw new Error('Semua sumber universe gagal — periksa koneksi server')
}

// ═══════════════════════════════════════════════════════════════════════
// ALL TICKERS (24h stats) — 6 sumber
// ═══════════════════════════════════════════════════════════════════════
function mapFromRows(rows: Array<{ symbol: string; t: TickerInfo }>) {
  const map = new Map<string, TickerInfo>()
  for (const r of rows) if (!map.has(r.symbol)) map.set(r.symbol, r.t)
  return map
}

async function tickersFut(): Promise<Map<string, TickerInfo>> {
  const j = (await srcGet('MEXC_FUTURES', `${FUT_BASE}/api/v1/contract/ticker`, 15000)) as {
    data?: Array<Record<string, unknown>>
  }
  if (!j?.data || !Array.isArray(j.data)) throw new Error('bad tickers')
  const rows: Array<{ symbol: string; t: TickerInfo }> = []
  for (const t of j.data) {
    const sym = String(t.symbol ?? '')
    if (!sym.endsWith('_USDT')) continue
    rows.push({
      symbol: sym,
      t: {
        symbol: sym,
        lastPrice: Number(t.lastPrice ?? 0),
        changeRate: Number(t.riseFallRate ?? 0),
        quoteVolume: Number(t.quoteVolume ?? 0),
        high24h: Number(t.high24h ?? 0),
        low24h: Number(t.low24h ?? 0),
      },
    })
  }
  if (rows.length === 0) throw new Error('tickers kosong')
  return mapFromRows(rows)
}

async function tickersMexcSpot(): Promise<Map<string, TickerInfo>> {
  const j = (await srcGet('MEXC_SPOT', `${SPOT_BASE}/api/v3/ticker/24hr`, 15000)) as Array<
    Record<string, unknown>
  >
  if (!Array.isArray(j)) throw new Error('bad spot tickers')
  const rows: Array<{ symbol: string; t: TickerInfo }> = []
  for (const t of j) {
    const sym = String(t.symbol ?? '')
    if (!sym.endsWith('USDT') || sym.includes('_')) continue
    if (LEVERAGED.test(sym.replace(/USDT$/, ''))) continue
    rows.push({
      symbol: spotToFut(sym),
      t: {
        symbol: spotToFut(sym),
        lastPrice: Number(t.lastPrice ?? 0),
        changeRate: Number(t.priceChangePercent ?? 0) / 100,
        quoteVolume: Number(t.quoteVolume ?? 0),
        high24h: Number(t.highPrice ?? 0),
        low24h: Number(t.lowPrice ?? 0),
      },
    })
  }
  if (rows.length === 0) throw new Error('spot tickers kosong')
  return mapFromRows(rows)
}

async function tickersBinance(base: string, src: SourceId): Promise<Map<string, TickerInfo>> {
  const j = (await srcGet(src, `${base}/api/ticker/24hr`, 15000)) as Array<Record<string, unknown>>
  if (!Array.isArray(j)) throw new Error('bad bin tickers')
  const rows: Array<{ symbol: string; t: TickerInfo }> = []
  for (const t of j) {
    const sym = String(t.symbol ?? '')
    if (!sym.endsWith('USDT')) continue
    if (LEVERAGED.test(sym.replace(/USDT$/, ''))) continue
    rows.push({
      symbol: spotToFut(sym),
      t: {
        symbol: spotToFut(sym),
        lastPrice: Number(t.lastPrice ?? 0),
        changeRate: Number(t.priceChangePercent ?? 0) / 100,
        quoteVolume: Number(t.quoteVolume ?? 0),
        high24h: Number(t.highPrice ?? 0),
        low24h: Number(t.lowPrice ?? 0),
      },
    })
  }
  if (rows.length === 0) throw new Error('bin tickers kosong')
  return mapFromRows(rows)
}

async function tickersBybit(): Promise<Map<string, TickerInfo>> {
  const j = (await srcGet('BYBIT', `${BYBIT}/v5/market/tickers?category=linear`, 15000)) as {
    retCode?: number
    result?: {
      list?: Array<{
        symbol?: string
        lastPrice?: string
        price24hPcnt?: string
        turnover24h?: string
        highPrice24h?: string
        lowPrice24h?: string
      }>
    }
  }
  const list = j?.result?.list ?? []
  const rows: Array<{ symbol: string; t: TickerInfo }> = []
  for (const t of list) {
    const sym = String(t.symbol ?? '')
    if (!sym.endsWith('USDT')) continue
    const fut = spotToFut(sym)
    rows.push({
      symbol: fut,
      t: {
        symbol: fut,
        lastPrice: Number(t.lastPrice ?? 0),
        changeRate: Number(t.price24hPcnt ?? 0),
        quoteVolume: Number(t.turnover24h ?? 0),
        high24h: Number(t.highPrice24h ?? 0),
        low24h: Number(t.lowPrice24h ?? 0),
      },
    })
  }
  if (rows.length === 0) throw new Error('bybit tickers kosong')
  return mapFromRows(rows)
}

async function tickersOkx(): Promise<Map<string, TickerInfo>> {
  const j = (await srcGet('OKX', `${OKX}/api/v5/market/tickers?instType=SWAP`, 15000)) as {
    code?: string
    data?: Array<{
      instId?: string
      last?: string
      open24h?: string
      high24h?: string
      low24h?: string
      volCcy24h?: string
    }>
  }
  const list = j?.data ?? []
  const rows: Array<{ symbol: string; t: TickerInfo }> = []
  for (const t of list) {
    const inst = String(t.instId ?? '')
    if (!inst.endsWith('-USDT-SWAP')) continue
    const last = Number(t.last ?? 0)
    const open = Number(t.open24h ?? 0)
    const baseVol = Number(t.volCcy24h ?? 0)
    const fut = inst.replace('-USDT-SWAP', '_USDT')
    rows.push({
      symbol: fut,
      t: {
        symbol: fut,
        lastPrice: last,
        changeRate: open > 0 ? (last - open) / open : 0,
        quoteVolume: baseVol * last, // volCcy24h = volume base → kalikan harga
        high24h: Number(t.high24h ?? 0),
        low24h: Number(t.low24h ?? 0),
      },
    })
  }
  if (rows.length === 0) throw new Error('okx tickers kosong')
  return mapFromRows(rows)
}

export async function getAllTickers(): Promise<{ map: Map<string, TickerInfo>; source: SourceId }> {
  const hit = cacheGet<{ map: Map<string, TickerInfo>; source: SourceId }>('tickers', 20_000)
  if (hit) return hit

  const providers: Array<[SourceId, () => Promise<Map<string, TickerInfo>>]> = [
    ['MEXC_FUTURES', tickersFut],
    ['MEXC_SPOT', tickersMexcSpot],
    ['BINANCE_FUTURES', () => tickersBinance(BIN_FUT, 'BINANCE_FUTURES')],
    ['BINANCE_SPOT', () => tickersBinance(BIN_SPOT, 'BINANCE_SPOT')],
    ['BYBIT', tickersBybit],
    ['OKX', tickersOkx],
  ]
  for (const [src, fn] of providers) {
    if (isBanned(src)) continue
    try {
      const map = await fn()
      const out = { map, source: src }
      cacheSet('tickers', out)
      return out
    } catch {
      /* lanjut ke sumber berikutnya */
    }
  }
  const stale = cacheStale<{ map: Map<string, TickerInfo>; source: SourceId }>('tickers')
  if (stale) return stale
  throw new Error('Semua sumber ticker gagal — periksa koneksi server')
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
