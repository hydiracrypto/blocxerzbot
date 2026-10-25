// ═══════════════════════════════════════════════════════════════════════
// MEXC FUTURES TRADING CLIENT — API privat (HMAC-SHA256) + Paper Broker
// Eksekusi LIVE selalu ke contract.mexc.com (pasar sungguhan MEXC Futures)
// ═══════════════════════════════════════════════════════════════════════
import crypto from 'crypto'

const FUT_BASE = 'https://contract.mexc.com'

export interface MexcKeys {
  apiKey: string
  secret: string
}

// MEXC futures order side codes
export const SIDE = {
  OPEN_LONG: 1,
  CLOSE_SHORT: 2,
  OPEN_SHORT: 3,
  CLOSE_LONG: 4,
} as const

export interface OrderRequest {
  symbol: string
  side: number // 1 open long, 2 close short, 3 open short, 4 close long
  vol: number // jumlah kontrak
  price?: number // undefined = market (type 5)
  type?: number // 1 limit, 5 market
  openType?: number // 1 isolated, 2 cross
  leverage?: number
  triggerPrice?: number
  triggerType?: number // 1 ge, 2 le
  positionMode?: number // 1 hedge, 2 one-way
}

export interface OrderResult {
  ok: boolean
  orderId?: string
  error?: string
}

function sign(params: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(params).digest('hex')
}

async function signedRequest<T>(
  keys: MexcKeys,
  method: 'GET' | 'POST',
  path: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  const timestamp = Date.now().toString()
  const paramStr = JSON.stringify(params)
  const signature = sign(keys.apiKey + timestamp + paramStr, keys.secret)
  const ctrl = new AbortController()
  const tm = setTimeout(() => ctrl.abort(), 12000)
  try {
    const res = await fetch(`${FUT_BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0',
        apiKey: keys.apiKey,
        'request-time': timestamp,
        signature,
        'Content-Type-Signed': '1',
      },
      body: method === 'POST' ? paramStr : undefined,
      signal: ctrl.signal,
      cache: 'no-store',
    })
    const j = (await res.json()) as { success: boolean; code: number; msg?: string; data: T }
    if (!j.success || (j.code !== 0 && j.code !== 1000)) {
      throw new Error(j.msg || `MEXC error code ${j.code}`)
    }
    return j.data
  } finally {
    clearTimeout(tm)
  }
}

// ── Account ──────────────────────────────────────────────────────────────
export async function getAccountAssets(keys: MexcKeys) {
  return signedRequest<Array<Record<string, unknown>>>(keys, 'GET', '/api/v1/private/account/assets')
}

export async function getPositions(keys: MexcKeys, symbol?: string) {
  const path = symbol ? `/api/v1/private/position/list?symbol=${symbol}` : '/api/v1/private/position/list'
  return signedRequest<Array<Record<string, unknown>>>(keys, 'GET', path)
}

export async function getOpenOrders(keys: MexcKeys, symbol?: string) {
  const path = symbol ? `/api/v1/private/order/list/open_orders?symbol=${symbol}` : '/api/v1/private/order/list/open_orders'
  return signedRequest<Array<Record<string, unknown>>>(keys, 'GET', path)
}

export async function setLeverage(keys: MexcKeys, symbol: string, leverage: number, openType = 2, positionMode = 2) {
  return signedRequest<{ target: number }>(keys, 'POST', '/api/v1/private/position/change_leverage', {
    symbol,
    leverage,
    openType,
    positionMode,
  })
}

// ── Orders ───────────────────────────────────────────────────────────────
export async function submitOrder(keys: MexcKeys, req: OrderRequest): Promise<OrderResult> {
  try {
    const body: Record<string, unknown> = {
      symbol: req.symbol,
      vol: req.vol,
      side: req.side,
      type: req.type ?? (req.price ? 1 : 5),
      openType: req.openType ?? 2, // cross default
      positionMode: req.positionMode ?? 2, // one-way default
      leverage: req.leverage ?? 20,
    }
    if (req.price) body.price = req.price
    if (req.triggerPrice) {
      body.triggerPrice = req.triggerPrice
      body.triggerType = req.triggerType ?? (req.side === SIDE.OPEN_LONG || req.side === SIDE.CLOSE_SHORT ? 2 : 1)
      body.executeCycle = 16 // long-term valid
      body.orderType = '5' // trigger order
    }
    const data = await signedRequest<{ orderId: number | string }>(keys, 'POST', '/api/v1/private/order/submit', body)
    return { ok: true, orderId: String(data.orderId) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function cancelOrder(keys: MexcKeys, symbol: string, orderId: string): Promise<OrderResult> {
  try {
    await signedRequest(keys, 'POST', '/api/v1/private/order/cancel', { symbol, orderIds: [orderId] })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function cancelAllSymbolOrders(keys: MexcKeys, symbol: string): Promise<OrderResult> {
  try {
    await signedRequest(keys, 'POST', '/api/v1/private/order/cancel_all', { symbol })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// ── Helper: hitung vol kontrak dari qty coin ─────────────────────────────
export function coinToContracts(qtyCoin: number, contractSize: number, precision = 0): number {
  const contracts = qtyCoin / (contractSize || 1)
  const f = Math.pow(10, precision)
  return Math.max(1, Math.floor(contracts * f) / f)
}

export function validateKeys(keys: MexcKeys | null | undefined): keys is MexcKeys {
  return !!keys && typeof keys.apiKey === 'string' && keys.apiKey.length > 10 && typeof keys.secret === 'string' && keys.secret.length > 10
}
