// ═══════════════════════════════════════════════════════════════════════
// BOT STATE & SETTINGS — persist di SQLite, status agent di memory
// ═══════════════════════════════════════════════════════════════════════
import { db } from '@/lib/db'
import type { SourceId } from '@/lib/mexc/market-data'
import type { StrategyResult } from '@/lib/strategy/blocxerz'

export interface BotSettings {
  mode: 'PAPER' | 'LIVE'
  apiKey: string
  apiSecret: string
  riskPct: number // % equity per trade
  leverage: number
  maxPositions: number
  maxWatch: number // jumlah pair aktif dipantau
  minVolUsd: number // filter volume 24h minimum
  minScore: number
  qmMinScore: number
  tpMode: 'LADDER' | 'TP3_FULL'
  feePct: number
  allowFlip: boolean
  maxDailyLossPct: number
  autoRun: boolean
  paperEquity: number
}

export const DEFAULT_SETTINGS: BotSettings = {
  mode: 'PAPER',
  apiKey: '',
  apiSecret: '',
  riskPct: 1,
  leverage: 10,
  maxPositions: 5,
  maxWatch: 10,
  minVolUsd: 3_000_000,
  minScore: 7,
  qmMinScore: 6,
  tpMode: 'LADDER',
  feePct: 0.02,
  allowFlip: true,
  maxDailyLossPct: 15,
  autoRun: true,
  paperEquity: 1000,
}

export async function getSettings(): Promise<BotSettings> {
  const rows = await db.setting.findMany()
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  const s = { ...DEFAULT_SETTINGS }
  if (map.mode === 'LIVE' || map.mode === 'PAPER') s.mode = map.mode
  if (map.apiKey !== undefined) s.apiKey = map.apiKey
  if (map.apiSecret !== undefined) s.apiSecret = map.apiSecret
  for (const k of ['riskPct', 'leverage', 'maxPositions', 'maxWatch', 'minVolUsd', 'minScore', 'qmMinScore', 'feePct', 'maxDailyLossPct', 'paperEquity'] as const) {
    if (map[k] !== undefined && !isNaN(Number(map[k]))) s[k] = Number(map[k])
  }
  if (map.tpMode === 'LADDER' || map.tpMode === 'TP3_FULL') s.tpMode = map.tpMode
  if (map.allowFlip !== undefined) s.allowFlip = map.allowFlip === 'true'
  if (map.autoRun !== undefined) s.autoRun = map.autoRun === 'true'
  return s
}

export async function saveSettings(patch: Partial<BotSettings>): Promise<void> {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined)
  for (const [k, v] of entries) {
    await db.setting.upsert({
      where: { key: k },
      update: { value: String(v) },
      create: { key: k, value: String(v) },
    })
  }
}

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
  source: SourceId
  watched: boolean
}

export interface RadarRow {
  symbol: string
  price: number
  changeRate: number
  quoteVolume: number
  volSpike: number // rasio vs vol SMA20 pada bar 15m terakhir
  score: number
}

export interface OrchestratorState {
  running: boolean
  cycles: number
  startedAt: number | null
  lastTickAt: string | null
  marketSource: SourceId
  watchlist: string[]
  scanRows: ScanRow[]
  radarRows: RadarRow[]
  results: Map<string, StrategyResult>
  agents: AgentStatus[]
  timer: ReturnType<typeof setInterval> | null
  busy: boolean
  dailyGuardTriggered: boolean
  dailyGuardDate: string
  processing: Set<string>
  bootstrapped: boolean
  codeVersion: string
}

const g = globalThis as unknown as Record<string, unknown>

function mkAgent(id: string, name: string, role: string): AgentStatus {
  return { id, name, role, status: 'IDLE', ticks: 0, lastAction: 'Menunggu…', lastTickAt: null, errors: 0 }
}

export function getOrchState(): OrchestratorState {
  if (!g.__orch) {
    g.__orch = {
      running: false,
      cycles: 0,
      startedAt: null,
      lastTickAt: null,
      marketSource: 'MEXC_FUTURES',
      watchlist: [],
      scanRows: [],
      radarRows: [],
      results: new Map(),
      agents: [
        mkAgent('A1', 'Pair Scanner', 'Memindai semua aset futures MEXC, filter likuiditas, bangun watchlist'),
        mkAgent('A2', 'Volume Radar', 'Deteksi lonjakan volume & momentum di watchlist'),
        mkAgent('A3', 'Strategy Engine', 'BLOCXERZ v3.0: FVG/QM/Structure/Bias + skor konfluensi 8 faktor'),
        mkAgent('A4', 'Position Sizer', 'Hitung ukuran posisi berbasis risiko & leverage'),
        mkAgent('A5', 'Executor', 'Eksekusi order LONG/SHORT ke MEXC Futures'),
        mkAgent('A6', 'Risk Monitor', 'Supervisi TP/SL 24/7, breakeven, guard drawdown'),
      ],
      timer: null,
      busy: false,
      dailyGuardTriggered: false,
      dailyGuardDate: '',
      processing: new Set(),
      bootstrapped: false,
      codeVersion: '',
    } as OrchestratorState
  }
  return g.__orch as OrchestratorState
}
