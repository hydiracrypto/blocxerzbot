// ============================================================
// APEX-5 · Real-Market Autonomous Trading Engine — shared types
// Dipakai bersama oleh mini-service engine & dashboard client
// Pasar sungguhan: Binance Spot (data real-time)
// ============================================================

export type MasterId = 'turtle' | 'seykota' | 'schwartz' | 'ptj' | 'bollinger' | 'risk'

export type BotStatus = 'RUNNING' | 'PAUSED'

export type TradeMode = 'PAPER' | 'LIVE'

export type LogLevel = 'info' | 'success' | 'warn' | 'danger' | 'trade'

export type PairDecision = 'WAIT' | 'WATCH' | 'SIGNAL' | 'HOLD' | 'SKIP' | 'ENTER' | 'EXIT'

export type MarketWsStatus = 'CONNECTED' | 'RECONNECTING' | 'ERROR'

export interface MasterView {
  id: MasterId
  name: string // 'Turtle System'
  trader: string // 'Richard Dennis'
  icon: string
  role: string
  status: string
  lastAction: string
  lastActionTs: number
  decisions: number
  heat: number // 0..1 aktivitas terakhir (pulse)
  trades: number
  wins: number
  winRate: number
  pnlUsd: number
  openPositions: number
}

export interface ActivityItem {
  id: string
  ts: number
  agent: MasterId
  level: LogLevel
  msg: string
}

export interface EquityPoint {
  t: number
  e: number
}

export interface MarketSymbol {
  id: string // 'BTCUSDT'
  base: string // 'BTC'
  price: number
  change24hPct: number
  high24h: number
  low24h: number
  vol24hUsd: number
  emaTrend: 'UP' | 'DOWN' | 'FLAT'
  rsi14: number
  atrPct: number
  decision: PairDecision
  reason: string
  sparkline: number[] // ~40 harga terakhir (mini chart)
  mastersActive: MasterId[] // master yang punya posisi terbuka di simbol ini
}

export interface PositionView {
  id: string
  symbol: string
  base: string
  strategy: MasterId
  strategyName: string
  sizeUsd: number
  qty: number
  entryPrice: number
  markPrice: number
  stopPrice: number
  takeProfitPrice: number
  pnlPct: number
  pnlUsd: number
  peakPnlPct: number
  mode: TradeMode
  openedAt: number
  ageMin: number
  thesis: string
}

export interface TradeView {
  id: string
  symbol: string
  strategy: MasterId
  strategyName: string
  sizeUsd: number
  entryPrice: number
  exitPrice: number
  pnlUsd: number
  pnlPct: number
  feeUsd: number
  reason: string
  win: boolean
  mode: TradeMode
  entryTime: number
  exitTime: number
  holdMin: number
}

export interface AccountView {
  equity: number
  cash: number
  startingEquity: number
  pnl: number
  pnlPct: number
  peakEquity: number
  maxDrawdownPct: number
  exposureUsd: number
  mode: TradeMode
  liveConnected: boolean
  liveBalanceUsd: number | null
}

export interface StatsView {
  trades: number
  wins: number
  losses: number
  winRate: number
  profitFactor: number
  expectancyPct: number
  avgWinPct: number
  avgLossPct: number
  bestTradePct: number
  worstTradePct: number
  streak: number
  bestStreak: number
  feesUsd: number
}

export interface CandleView {
  t: number
  o: number
  h: number
  l: number
  c: number
  v: number
}

export interface RiskView {
  dailyPnlUsd: number
  dailyPnlPct: number
  dailyLossLimitPct: number
  entriesBlocked: boolean
  blockReason: string
  maxOpenPositions: number
  riskPerTradePct: number
  openPositions: number
  openExposurePct: number
}

export interface SettingsView {
  mode: TradeMode
  apiKeyMasked: string
  hasApiSecret: boolean
  testnet: boolean
  riskPerTradePct: number
  maxOpenPositions: number
  dailyLossLimitPct: number
  startingEquity: number
  allowedSymbols: string[]
}

export interface EngineState {
  status: BotStatus
  tick: number
  startedAt: number
  engineVersion: string
  marketName: string // 'BINANCE SPOT'
  marketWs: MarketWsStatus
  lastMarketTick: number
  focusSymbol: string
  candles: CandleView[] // candle 1m real untuk simbol fokus
  ema8Series: number[]
  ema21Series: number[]
  account: AccountView
  stats: StatsView
  risk: RiskView
  equityCurve: EquityPoint[]
  masters: MasterView[]
  activity: ActivityItem[]
  symbols: MarketSymbol[]
  positions: PositionView[]
  trades: TradeView[]
  settings: SettingsView
}

export type ControlAction =
  | { action: 'start' }
  | { action: 'pause' }
  | { action: 'reset' }
  | { action: 'focus'; symbol: string }
  | { action: 'settings'; settings: Record<string, unknown> }

// ---- formatters (dipakai client; aman dipakai di server untuk konsistensi) ----

export function fmtUsd(v: number, signed = false): string {
  const sign = signed ? (v > 0 ? '+' : v < 0 ? '-' : '') : v < 0 ? '-' : ''
  const a = Math.abs(v)
  if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(2)}M`
  if (a >= 10_000) return `${sign}$${a.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
  return `${sign}$${a.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function fmtPct(v: number, signed = false): string {
  const sign = signed && v > 0 ? '+' : ''
  const a = Math.abs(v)
  return `${sign}${a.toFixed(a < 10 ? 2 : 1)}%`
}

export function fmtPrice(v: number): string {
  if (v >= 1000) return `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
  if (v >= 1) return `$${v.toFixed(2)}`
  if (v >= 0.01) return `$${v.toFixed(4)}`
  if (v >= 0.0001) return `$${v.toFixed(6)}`
  return `$${v.toExponential(2)}`
}
