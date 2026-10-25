// ============================================================
// APEX-5 · Binance Real Market Data Client
// REST: klines historis (1m) + 24hr ticker
// WS  : combined stream (kline_1m + miniTicker) real-time
// Ini adalah koneksi PASAR SUNGGUHAN — bukan simulasi.
// ============================================================

export interface Candle {
  t: number // open time ms
  o: number
  h: number
  l: number
  c: number
  v: number // base volume
  q: number // quote volume (USDT)
  closed: boolean
}

export interface Ticker24h {
  price: number
  change24hPct: number
  high24h: number
  low24h: number
  vol24hUsd: number
}

const REST_BASE = 'https://api.binance.com'
const WS_BASE = 'wss://stream.binance.com:9443'

export type WsStatus = 'CONNECTED' | 'RECONNECTING' | 'ERROR'

export class BinanceMarket {
  readonly symbols: string[]
  candles = new Map<string, Candle[]>()
  tickers = new Map<string, Ticker24h>()
  prices = new Map<string, number>()
  sparkline = new Map<string, number[]>()
  wsStatus: WsStatus = 'RECONNECTING'
  lastMsgTs = 0
  connectedAt = 0

  private ws: WebSocket | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private retryDelay = 2000
  private onCandleCloseCb: ((symbol: string, candle: Candle) => void) | null = null
  private onPriceCb: ((symbol: string, price: number) => void) | null = null

  constructor(symbols: string[]) {
    this.symbols = symbols
  }

  onCandleClose(cb: (symbol: string, candle: Candle) => void) {
    this.onCandleCloseCb = cb
  }
  onPrice(cb: (symbol: string, price: number) => void) {
    this.onPriceCb = cb
  }

  price(symbol: string): number {
    return this.prices.get(symbol) ?? 0
  }

  getClosed(symbol: string): Candle[] {
    return this.candles.get(symbol) ?? []
  }

  /** Muat data historis real (REST) lalu sambungkan stream WS */
  async init(): Promise<void> {
    const results = await Promise.allSettled(
      this.symbols.map(async (s) => {
        const [kres, tres] = await Promise.all([
          fetch(`${REST_BASE}/api/v3/klines?symbol=${s}&interval=1m&limit=300`, {
            signal: AbortSignal.timeout(15000),
          }),
          fetch(`${REST_BASE}/api/v3/ticker/24hr?symbol=${s}`, {
            signal: AbortSignal.timeout(15000),
          }),
        ])
        if (!kres.ok || !tres.ok) throw new Error(`REST gagal utk ${s}`)
        const kl = (await kres.json()) as (string | number)[][]
        const t = (await tres.json()) as Record<string, string>
        const cs: Candle[] = kl.map((r) => ({
          t: Number(r[0]),
          o: Number(r[1]),
          h: Number(r[2]),
          l: Number(r[3]),
          c: Number(r[4]),
          v: Number(r[5]),
          q: Number(r[7]),
          closed: true,
        }))
        // buang candle terakhir (belum close) — akan diperbarui WS
        cs.pop()
        this.candles.set(s, cs)
        this.tickers.set(s, {
          price: Number(t.lastPrice),
          change24hPct: Number(t.priceChangePercent),
          high24h: Number(t.highPrice),
          low24h: Number(t.lowPrice),
          vol24hUsd: Number(t.quoteVolume),
        })
        this.prices.set(s, Number(t.lastPrice))
        this.sparkline.set(
          s,
          cs.slice(-40).map((c) => c.c),
        )
      }),
    )
    const ok = results.filter((r) => r.status === 'fulfilled').length
    console.log(`[binance] historis dimuat utk ${ok}/${this.symbols.length} simbol`)
    if (ok === 0) throw new Error('Semua permintaan REST gagal — cek koneksi jaringan')
    this.connectWs()
  }

  /** Buka ulang koneksi WS dengan backoff otomatis */
  connectWs() {
    if (this.ws) {
      try {
        this.ws.close()
      } catch {
        /* noop */
      }
    }
    this.wsStatus = 'RECONNECTING'
    const streams = this.symbols
      .flatMap((s) => [`${s.toLowerCase()}@kline_1m`, `${s.toLowerCase()}@miniTicker`])
      .join('/')
    let ws: WebSocket
    try {
      ws = new WebSocket(`${WS_BASE}/stream?streams=${streams}`)
    } catch {
      this.scheduleReconnect()
      return
    }
    this.ws = ws

    ws.onopen = () => {
      this.wsStatus = 'CONNECTED'
      this.connectedAt = Date.now()
      this.retryDelay = 2000
      console.log('[binance] WS stream terhubung — data pasar real-time aktif')
    }
    ws.onmessage = (ev) => {
      this.lastMsgTs = Date.now()
      try {
        const msg = JSON.parse(ev.data as string) as { stream: string; data: Record<string, unknown> }
        const d = msg.data
        if (d.e === 'kline') {
          this.handleKline(d)
        } else if (d.e === '24hrMiniTicker') {
          this.handleMiniTicker(d)
        }
      } catch {
        /* abaikan frame rusak */
      }
    }
    ws.onerror = () => {
      this.wsStatus = 'ERROR'
    }
    ws.onclose = () => {
      if (this.wsStatus !== 'ERROR') this.wsStatus = 'RECONNECTING'
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.retryDelay = Math.min(this.retryDelay * 1.5, 30000)
      console.log(`[binance] reconnect WS dalam ${Math.round(this.retryDelay / 1000)}s…`)
      this.connectWs()
    }, this.retryDelay)
  }

  private handleKline(d: Record<string, unknown>) {
    const k = d.k as Record<string, unknown>
    const symbol = d.s as string
    const candle: Candle = {
      t: Number(k.t),
      o: Number(k.o),
      h: Number(k.h),
      l: Number(k.l),
      c: Number(k.c),
      v: Number(k.v),
      q: Number(k.q),
      closed: Boolean(k.x),
    }
    const arr = this.candles.get(symbol)
    if (!arr) return
    const last = arr[arr.length - 1]
    if (last && last.t === candle.t) {
      arr[arr.length - 1] = candle
    } else if (!last || candle.t > last.t) {
      arr.push(candle)
      if (arr.length > 500) arr.shift()
      if (candle.closed) this.onCandleCloseCb?.(symbol, candle)
    }
    this.setPrice(symbol, candle.c)
  }

  private handleMiniTicker(d: Record<string, unknown>) {
    const symbol = d.s as string
    this.tickers.set(symbol, {
      price: Number(d.c),
      change24hPct: Number(((Number(d.c) - Number(d.o)) / Number(d.o)) * 100),
      high24h: Number(d.h),
      low24h: Number(d.l),
      vol24hUsd: Number(d.q),
    })
    this.setPrice(symbol, Number(d.c))
  }

  private setPrice(symbol: string, price: number) {
    if (!price || !Number.isFinite(price)) return
    const prev = this.prices.get(symbol)
    this.prices.set(symbol, price)
    if (price !== prev) {
      const sp = this.sparkline.get(symbol)
      if (sp) {
        sp.push(price)
        if (sp.length > 40) sp.shift()
      }
      this.onPriceCb?.(symbol, price)
    }
  }
}

// ================= LIVE ORDER EXECUTION (Binance Spot API) =================

export interface LiveOrderResult {
  ok: boolean
  executedQty: number
  cummulativeQuoteQty: number
  avgPrice: number
  orderId: number
  error?: string
}

export interface ExchangeFilters {
  stepSize: number
  minQty: number
  minNotional: number
}

export class BinanceLive {
  private apiKey = ''
  private apiSecret = ''
  private testnet = false
  private filters = new Map<string, ExchangeFilters>()
  private filtersLoaded = false

  configure(apiKey: string, apiSecret: string, testnet: boolean) {
    this.apiKey = apiKey
    this.apiSecret = apiSecret
    this.testnet = testnet
    this.filtersLoaded = false
  }

  get configured(): boolean {
    return this.apiKey.length > 0 && this.apiSecret.length > 0
  }

  private get base(): string {
    return this.testnet ? 'https://testnet.binance.vision' : 'https://api.binance.com'
  }

  private async signedQuery(path: string, params: Record<string, string | number>): Promise<Record<string, unknown>> {
    const { createHmac } = await import('node:crypto')
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) qs.set(k, String(v))
    qs.set('timestamp', String(Date.now()))
    qs.set('recvWindow', '10000')
    const sig = createHmac('sha256', this.apiSecret).update(qs.toString()).digest('hex')
    qs.set('signature', sig)
    const res = await fetch(`${this.base}${path}?${qs.toString()}`, {
      headers: { 'X-MBX-APIKEY': this.apiKey },
      signal: AbortSignal.timeout(12000),
    })
    const body = (await res.json()) as Record<string, unknown>
    if (!res.ok) throw new Error(String(body.msg ?? `HTTP ${res.status}`))
    return body
  }

  /** Muat aturan LOT_SIZE / NOTIONAL per simbol (sekali per konfigurasi) */
  async loadFilters(symbols: string[]): Promise<void> {
    if (this.filtersLoaded) return
    try {
      const res = await fetch(`${this.base}/api/v3/exchangeInfo?symbols=${encodeURIComponent(JSON.stringify(symbols))}`, {
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) return
      const info = (await res.json()) as { symbols: { symbol: string; filters: Record<string, string>[] }[] }
      for (const s of info.symbols) {
        const lot = s.filters.find((f) => f.filterType === 'LOT_SIZE')
        const nota = s.filters.find((f) => f.filterType === 'NOTIONAL') ?? s.filters.find((f) => f.filterType === 'MIN_NOTIONAL')
        if (lot) {
          this.filters.set(s.symbol, {
            stepSize: Number(lot.stepSize ?? '0.00000001'),
            minQty: Number(lot.minQty ?? '0'),
            minNotional: Number(nota?.minNotional ?? nota?.notional ?? '10'),
          })
        }
      }
      this.filtersLoaded = true
      console.log(`[binance-live] filters dimuat utk ${this.filters.size} simbol`)
    } catch (e) {
      console.error('[binance-live] gagal memuat exchangeInfo', e)
    }
  }

  /** Bulatkan qty sesuai stepSize bursa */
  roundQty(symbol: string, qty: number): number {
    const f = this.filters.get(symbol)
    if (!f) return Number(qty.toFixed(6))
    const steps = Math.floor(qty / f.stepSize)
    const q = steps * f.stepSize
    return Number(q.toFixed(8))
  }

  minNotional(symbol: string): number {
    return this.filters.get(symbol)?.minNotional ?? 10
  }

  /** Saldo USDT (free + locked) */
  async usdtBalance(): Promise<number | null> {
    try {
      const acc = await this.signedQuery('/api/v3/account', {})
      const bal = (acc.balances as { asset: string; free: string; locked: string }[] | undefined)?.find((b) => b.asset === 'USDT')
      if (!bal) return null
      return Number(bal.free) + Number(bal.locked)
    } catch {
      return null
    }
  }

  /** Kirim market order BUY (pakai quoteOrderQty = notional USDT) */
  async marketBuy(symbol: string, notionalUsd: number): Promise<LiveOrderResult> {
    try {
      const r = await this.signedQuery('/api/v3/order', {
        symbol,
        side: 'BUY',
        type: 'MARKET',
        quoteOrderQty: notionalUsd.toFixed(2),
      })
      const executedQty = Number(r.executedQty ?? 0)
      const quote = Number(r.cummulativeQuoteQty ?? 0)
      return {
        ok: true,
        executedQty,
        cummulativeQuoteQty: quote,
        avgPrice: executedQty > 0 ? quote / executedQty : 0,
        orderId: Number(r.orderId ?? 0),
      }
    } catch (e) {
      return { ok: false, executedQty: 0, cummulativeQuoteQty: 0, avgPrice: 0, orderId: 0, error: String(e instanceof Error ? e.message : e) }
    }
  }

  /** Kirim market order SELL (pakai quantity) */
  async marketSell(symbol: string, qty: number): Promise<LiveOrderResult> {
    const q = this.roundQty(symbol, qty)
    try {
      const r = await this.signedQuery('/api/v3/order', {
        symbol,
        side: 'SELL',
        type: 'MARKET',
        quantity: q,
      })
      const executedQty = Number(r.executedQty ?? 0)
      const quote = Number(r.cummulativeQuoteQty ?? 0)
      return {
        ok: true,
        executedQty,
        cummulativeQuoteQty: quote,
        avgPrice: executedQty > 0 ? quote / executedQty : 0,
        orderId: Number(r.orderId ?? 0),
      }
    } catch (e) {
      return { ok: false, executedQty: 0, cummulativeQuoteQty: 0, avgPrice: 0, orderId: 0, error: String(e instanceof Error ? e.message : e) }
    }
  }
}
