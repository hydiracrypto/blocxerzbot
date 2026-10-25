// ═══════════════════════════════════════════════════════════════════════
// SHARED TYPES + POLLING HOOKS untuk dashboard
// ═══════════════════════════════════════════════════════════════════════
'use client'

import { useEffect, useRef, useState } from 'react'

export interface AgentStatus {
  id: string
  name: string
  role: string
  status: 'ACTIVE' | 'IDLE' | 'ERROR'
  ticks: number
  lastAction: string
  lastTickAt: string | null
  errors: number
}

export interface ScanRow {
  symbol: string
  price: number
  changeRate: number
  quoteVolume: number
  rank: number
  source: string
  watched: boolean
}

export interface RadarRow {
  symbol: string
  price: number
  changeRate: number
  quoteVolume: number
  volSpike: number
  score: number
}

export interface StatusResponse {
  running: boolean
  cycles: number
  startedAt: number | null
  lastTickAt: string | null
  marketSource: string
  watchlist: string[]
  agents: AgentStatus[]
  dailyGuard: boolean
  openCount: number
  lastSignalAt: string | null
  sources: Record<string, { ok: boolean }>
  scanRows: ScanRow[]
  radarRows: RadarRow[]
}

export interface SignalRow {
  id: string
  symbol: string
  direction: number
  isQM: boolean
  score: number
  factors: string
  entry: number
  sl: number
  tp1: number
  tp2: number
  tp3: number
  dataSource: string
  executed: boolean
  skipReason: string | null
  createdAt: string
}

export interface AnalysisRow {
  symbol: string
  price: number
  barT: number
  biasDir: number
  biasConf: number
  biasReason: string
  biasStruct: string
  biasDraw: string
  scoreBuy: number
  scoreSell: number
  factorsBuy: number[]
  factorsSell: number[]
  levels: { pwh: number; pwl: number; pdh: number; pdl: number; eq: number }
  qm: string
  qmBullActive: boolean
  qmBearActive: boolean
  tfAlign: string
  zones: { bull: number; bear: number }
  atr: number
  source: string
  signal: {
    dir: number
    entry: number
    sl: number
    tp1: number
    tp2: number
    tp3: number
    score: number
    factors: number[]
    isQM: boolean
    kind: string
  } | null
}

export interface PositionRow {
  id: string
  symbol: string
  side: number
  qtyCoin: number
  remainCoin: number
  entryPrice: number
  sl: number
  tp1: number
  tp2: number
  tp3: number
  leverage: number
  margin: number
  riskUsd: number
  notional: number
  score: number
  isQM: boolean
  mode: string
  beMoved: boolean
  tp1Hit: boolean
  tp2Hit: boolean
  pnl: number
  openedAt: string
  currentPrice: number
  unrealized: number
  pnlPct: number
  roe: number
}

export interface TradeRow {
  id: string
  symbol: string
  side: number
  qtyCoin: number
  entryPrice: number
  exitPrice: number
  pnl: number
  pnlPct: number
  reason: string
  mode: string
  closedAt: string
}

export interface LogRow {
  id: string
  agent: string
  level: string
  message: string
  createdAt: string
}

export interface SettingsData {
  mode: 'PAPER' | 'LIVE'
  apiKey: string
  apiSecret: string
  riskPct: number
  leverage: number
  maxPositions: number
  maxWatch: number
  minVolUsd: number
  minScore: number
  qmMinScore: number
  tpMode: 'LADDER' | 'TP3_FULL'
  feePct: number
  allowFlip: boolean
  maxDailyLossPct: number
  autoRun: boolean
  paperEquity: number
  hasKeys: boolean
}

export function usePolling<T>(url: string, intervalMs: number, enabled = true): { data: T | null; error: string | null; refresh: () => void } {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<{ mounted: boolean; timer: ReturnType<typeof setInterval> | null }>({ mounted: false, timer: null })

  useEffect(() => {
    ref.current.mounted = true

    const fetchNow = async () => {
      try {
        const res = await fetch(url, { cache: 'no-store' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const j = (await res.json()) as T
        if (ref.current.mounted) {
          setData(j)
          setError(null)
        }
      } catch (e) {
        if (ref.current.mounted) setError(e instanceof Error ? e.message : 'error')
      }
    }

    void fetchNow()
    if (enabled && intervalMs > 0) {
      ref.current.timer = setInterval(fetchNow, intervalMs)
    }
    return () => {
      ref.current.mounted = false
      if (ref.current.timer) clearInterval(ref.current.timer)
    }
  }, [url, intervalMs, enabled])

  return { data, error, refresh: () => ref.current.mounted && void 0 }
}

// helpers format
export const fmtPrice = (v: number) => {
  if (!isFinite(v)) return '—'
  if (Math.abs(v) >= 1000) return v.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (Math.abs(v) >= 1) return v.toFixed(4)
  return v.toFixed(6)
}
export const fmtUsd = (v: number) => {
  const a = Math.abs(v)
  if (a >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B'
  if (a >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M'
  if (a >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K'
  return '$' + v.toFixed(2)
}
export const fmtPnl = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(2)
export const timeAgo = (iso: string | null) => {
  if (!iso) return '—'
  const d = Date.now() - new Date(iso).getTime()
  if (d < 5000) return 'baru saja'
  if (d < 60000) return Math.floor(d / 1000) + ' dtk lalu'
  if (d < 3600000) return Math.floor(d / 60000) + ' mnt lalu'
  return Math.floor(d / 3600000) + ' jam lalu'
}
export const clockTime = (iso: string | null) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('id-ID', { hour12: false })
}
