// ============================================================
// NEXUS-6 · Autonomous Trading Desk — shared types
// Dipakai bersama oleh mini-service engine & dashboard client
// ============================================================

export type AgentId = 'scanner' | 'volume' | 'rug' | 'sizer' | 'executor' | 'journal'

export type BotStatus = 'RUNNING' | 'PAUSED'

export type LogLevel = 'info' | 'success' | 'warn' | 'danger' | 'trade'

export type PairDecision = 'WAIT' | 'ANALYZING' | 'SKIP' | 'REJECT' | 'ENTER' | 'HOLD'

export interface AgentView {
  id: AgentId
  name: string
  icon: string
  role: string
  status: string
  lastAction: string
  lastActionTick: number
  decisions: number
  heat: number // 0..1 aktivitas terakhir (untuk pulse)
}

export interface ActivityItem {
  id: string
  ts: number
  tick: number
  agent: AgentId
  level: LogLevel
  msg: string
}

export interface EquityPoint {
  t: number
  e: number
}

export interface RugChecks {
  lpLocked: boolean
  honeypot: boolean
  renounced: boolean
  mintDisabled: boolean
  top10Pct: number
  holders: number
}

export interface WatchPair {
  id: string
  symbol: string
  chain: string
  price: number
  changePct: number // perubahan harga tick terakhir %
  spikePct: number // lonjakan volume %
  z: number // z-score volume
  liquidity: number
  vol24h: number
  age: number
  rugScore: number | null
  rugChecks: RugChecks
  decision: PairDecision
  reason: string
  phase: string
}

export interface PositionView {
  id: string
  symbol: string
  chain: string
  sizeUsd: number
  entryPrice: number
  markPrice: number
  slippagePct: number
  pnlPct: number
  pnlUsd: number
  stopPct: number
  tp1Pct: number
  peakPnlPct: number
  partialTaken: boolean
  age: number
  thesis: string
}

export interface TradeView {
  id: string
  symbol: string
  chain: string
  sizeUsd: number
  entryPrice: number
  exitPrice: number
  slippagePct: number
  pnlUsd: number
  pnlPct: number
  reason: string
  win: boolean
  openedTick: number
  closedTick: number
  holdTicks: number
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
  avgSlippagePct: number
  bestTradePct: number
  worstTradePct: number
  streak: number
  bestStreak: number
  rejectedRugs: number
}

export interface EngineState {
  status: BotStatus
  speed: number
  tick: number
  startedAt: number
  engineVersion: string
  account: AccountView
  stats: StatsView
  equityCurve: EquityPoint[]
  agents: AgentView[]
  activity: ActivityItem[]
  watchlist: WatchPair[]
  positions: PositionView[]
  trades: TradeView[]
}

export type ControlAction =
  | { action: 'start' }
  | { action: 'pause' }
  | { action: 'reset' }
  | { action: 'speed'; value: number }

// ---- formatters (dipakai client; aman dipakai di server untuk konsistensi) ----

export function fmtUsd(v: number, signed = false): string {
  const sign = signed ? (v > 0 ? '+' : v < 0 ? '-' : '') : v < 0 ? '-' : ''
  const a = Math.abs(v)
  if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(2)}M`
  if (a >= 10_000) return `${sign}$${a.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
  if (a >= 1000) return `${sign}$${a.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  return `${sign}$${a.toFixed(2)}`
}

export function fmtPct(v: number, signed = false): string {
  const sign = signed && v > 0 ? '+' : ''
  const a = Math.abs(v)
  if (a >= 1000) return `${sign}${a.toLocaleString('en-US', { maximumFractionDigits: 0 })}%`
  return `${sign}${a.toFixed(a < 10 ? 2 : 1)}%`
}

export function fmtPrice(v: number): string {
  if (v >= 1) return `$${v.toFixed(2)}`
  if (v >= 0.01) return `$${v.toFixed(4)}`
  if (v >= 0.0001) return `$${v.toFixed(6)}`
  return `$${v.toExponential(2)}`
}
