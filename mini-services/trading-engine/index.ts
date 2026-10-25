// ============================================================
// NEXUS-6 · Autonomous Trading Engine (paper trading)
// 6 agent: Scanner → Volume Radar → Rug Guard → Position Sizer
//          → Executor → Journal
// Socket.io di port 3003 · emit 'state' tiap tick · terima 'control'
// ============================================================
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import {
  Pair, makePair, tickPair, computeRugScore, rnd, irnd, chance, clamp,
} from './market'
import type {
  ActivityItem, AgentId, AgentView, ControlAction, EngineState, LogLevel, PositionView, TradeView, WatchPair,
} from '../../src/lib/engine-types'

const PORT = 3003
const TICK_MS = 1000
const START_EQUITY = 14.82 // penghormatan untuk tweet: "$14.82 → $7,643"
const MAX_OPEN = 4
const MAX_PAIRS = 26

const AGENT_META: { id: AgentId; name: string; icon: string; role: string }[] = [
  { id: 'scanner', name: 'Pair Scanner', icon: 'radar', role: 'Memindai listing baru di 6 chain' },
  { id: 'volume', name: 'Volume Radar', icon: 'zap', role: 'Deteksi lonjakan volume (z-score)' },
  { id: 'rug', name: 'Rug Guard', icon: 'shield', role: 'Audit honeypot, LP lock, holder' },
  { id: 'sizer', name: 'Position Sizer', icon: 'scale', role: 'Sizing berbasis risiko & Kelly' },
  { id: 'executor', name: 'Executor', icon: 'crosshair', role: 'Entry/exit dengan slippage nyata' },
  { id: 'journal', name: 'Journal', icon: 'notebook', role: 'Mencatat setiap keputusan + alasan' },
]

interface Position {
  id: string
  pairId: string
  symbol: string
  chain: string
  origSize: number
  sizeUsd: number
  entryPrice: number
  slippagePct: number
  stopPct: number
  tp1Pct: number
  peakPnlPct: number
  partialTaken: boolean
  realizedPnlUsd: number
  openedTick: number
  thesis: string
}

interface Stats {
  trades: number
  wins: number
  losses: number
  grossWin: number
  grossLoss: number
  sumPnlPct: number
  sumWinPct: number
  sumLossPct: number
  sumSlip: number
  best: number
  worst: number
  streak: number
  bestStreak: number
  rejectedRugs: number
  lastMilestone: number
}

interface State {
  status: 'RUNNING' | 'PAUSED'
  speed: number
  tick: number
  startedAt: number
  cash: number
  equity: number
  peakEquity: number
  maxDD: number
  pairs: Pair[]
  positions: Position[]
  trades: TradeView[]
  activity: ActivityItem[]
  rugQueue: Pair[]
  approved: { pair: Pair; score: number; confidence: number }[]
  agents: Record<AgentId, { status: string; lastAction: string; lastActionTick: number; decisions: number; heat: number }>
  stats: Stats
}

let S: State

// ---------- logging ----------
let logSeq = 0
function log(agent: AgentId, level: LogLevel, msg: string) {
  const item: ActivityItem = {
    id: `${Date.now()}-${logSeq++}`,
    ts: Date.now(),
    tick: S.tick,
    agent,
    level,
    msg,
  }
  S.activity.push(item)
  if (S.activity.length > 90) S.activity.splice(0, S.activity.length - 90)
}

function setAgent(id: AgentId, status: string, action: string) {
  const a = S.agents[id]
  a.status = status
  a.lastAction = action
  a.lastActionTick = S.tick
  a.decisions++
  a.heat = 1
}

function markInteresting(p: Pair) {
  p.lastInterestingTick = S.tick
}

// ---------- init ----------
function initState() {
  S = {
    status: 'RUNNING',
    speed: 1,
    tick: 0,
    startedAt: Date.now(),
    cash: START_EQUITY,
    equity: START_EQUITY,
    peakEquity: START_EQUITY,
    maxDD: 0,
    pairs: [],
    positions: [],
    trades: [],
    activity: [],
    rugQueue: [],
    approved: [],
    agents: Object.fromEntries(
      AGENT_META.map((m) => [m.id, { status: 'Siap', lastAction: 'Inisialisasi sistem', lastActionTick: 0, decisions: 0, heat: 0 }]),
    ) as State['agents'],
    stats: {
      trades: 0, wins: 0, losses: 0, grossWin: 0, grossLoss: 0, sumPnlPct: 0,
      sumWinPct: 0, sumLossPct: 0, sumSlip: 0, best: 0, worst: 0, streak: 0,
      bestStreak: 0, rejectedRugs: 0, lastMilestone: 1,
    },
  }
  logSeq = 0
  // pasar awal
  for (let i = 0; i < 14; i++) {
    const p = makePair(0)
    p.age = irnd(6, 40)
    for (let k = 0; k < 10; k++) p.volHist.push(p.liquidity * rnd(0.015, 0.05))
    p.rugScore = computeRugScore(p).score
    S.pairs.push(p)
  }
  // warmup pasar tanpa log
  for (let t = 1; t <= 24; t++) S.pairs.forEach((p) => tickPair(p, t))
  S.pairs.forEach((p) => { p.rugScore = computeRugScore(p).score })
  S.tick = 0
  log('scanner', 'info', `Sesi dimulai — modal awal $${START_EQUITY.toFixed(2)} · memindai ${S.pairs.length} pair aktif di 6 chain`)
  log('journal', 'info', 'Journal aktif — setiap keputusan agent dicatat beserta alasannya')
}

// ---------- pipeline steps ----------
function scannerStep() {
  const active = S.pairs.filter((p) => p.status !== 'dead')
  if (S.pairs.length < MAX_PAIRS && chance(0.34)) {
    const p = makePair(S.tick)
    p.rugScore = computeRugScore(p).score
    S.pairs.push(p)
    markInteresting(p)
    setAgent('scanner', 'Memindai', `Listing baru: ${p.symbol}/${p.chain}`)
    log('scanner', 'info', `LISTING BARU ${p.symbol}/${p.chain} · liq $${(p.liquidity / 1000).toFixed(1)}k · holder ${p.holders} · umur ${p.age} tick`)
  } else {
    setAgent('scanner', 'Memindai', `${active.length} pair aktif dipantau`)
  }
  if (S.tick % 14 === 7) {
    const hot = S.pairs.filter((p) => p.phase === 'spike' || p.phase === 'pump').length
    log('scanner', 'info', `Scan selesai — ${active.length} pair aktif · ${hot} sedang panas · ${S.pairs.filter((p) => p.status === 'dead').length} mati`)
  }
  // prune dead (maks 2 per tick)
  let pruned = 0
  S.pairs = S.pairs.filter((p) => {
    if (p.status === 'dead' && p.phase === 'dead' && p.phaseT > 4 && pruned < 2) { pruned++; usedAck(p); return false }
    return true
  })
}

const usedAck = (_: Pair) => { /* noop — pair dikembalikan ke pool nama */ }

function volumeStep() {
  let flagged = 0
  for (const p of S.pairs) {
    if (flagged >= 2) break
    if (p.status !== 'watch' || p.queued || p.phase === 'dead' || p.phase === 'rug') continue
    if (p.liquidity < 15000) continue
    if (p.z >= 2.2 && (p.phase === 'spike' || p.phase === 'pump')) {
      p.queued = true
      p.decision = 'ANALYZING'
      p.reason = `Volume spike +${p.spikePct.toFixed(0)}% (z=${p.z.toFixed(1)}) — audit keamanan`
      S.rugQueue.push(p)
      flagged++
      markInteresting(p)
      setAgent('volume', 'Memantau', `Spike ${p.symbol} +${p.spikePct.toFixed(0)}%`)
      log('volume', 'warn', `VOLUME SPIKE ${p.symbol}/${p.chain} +${p.spikePct.toFixed(0)}% (z=${p.z.toFixed(1)}) — kirim ke Rug Guard`)
    }
  }
  if (flagged === 0) setAgent('volume', 'Memantau', `Baseline normal · z maks ${(Math.max(0, ...S.pairs.map((p) => p.z))).toFixed(1)}`)
}

function rugStep() {
  let processed = 0
  while (S.rugQueue.length && processed < 2) {
    const p = S.rugQueue.shift()!
    p.queued = false
    processed++
    const res = computeRugScore(p)
    p.rugScore = res.score
    if (p.honeypot) {
      p.status = 'rejected'
      p.decision = 'REJECT'
      p.reason = 'Honeypot terdeteksi — sell diblokir kontrak'
      S.stats.rejectedRugs++
      markInteresting(p)
      setAgent('rug', 'Mengaudit', `REJECT ${p.symbol} (honeypot)`)
      log('rug', 'danger', `REJECT ${p.symbol}/${p.chain} — honeypot! Kontrak memblokir sell · skor ${res.score}/100`)
      continue
    }
    if (res.score >= 55) {
      p.status = 'rejected'
      p.decision = 'REJECT'
      const fails = res.notes.filter((n) => !n.pass).map((n) => n.label).slice(0, 2).join(' · ')
      p.reason = `Skor risiko ${res.score}/100 — ${fails}`
      S.stats.rejectedRugs++
      markInteresting(p)
      setAgent('rug', 'Mengaudit', `REJECT ${p.symbol} (${res.score}/100)`)
      log('rug', 'danger', `REJECT ${p.symbol}/${p.chain} — skor risiko ${res.score}/100 · ${fails}`)
      continue
    }
    const confidence = clamp((58 - res.score) / 58, 0.25, 0.95)
    p.decision = 'WAIT'
    p.reason = `Lolos audit (skor ${res.score}/100) — menunggu sizing`
    S.approved.push({ pair: p, score: res.score, confidence })
    markInteresting(p)
    setAgent('rug', 'Mengaudit', `PASS ${p.symbol} (${res.score}/100)`)
    const ok = res.notes.filter((n) => n.pass).map((n) => n.label).slice(0, 3).join(' · ')
    log('rug', 'success', `PASS ${p.symbol}/${p.chain} — skor ${res.score}/100 · ${ok}`)
  }
  if (processed === 0 && S.rugQueue.length === 0) setAgent('rug', 'Standby', 'Tidak ada antrean audit')
}

function sizerStep() {
  while (S.approved.length) {
    if (S.positions.length >= MAX_OPEN) {
      const next = S.approved[0]
      setAgent('sizer', 'Menghitung', `Slot penuh ${S.positions.length}/${MAX_OPEN}`)
      log('sizer', 'warn', `Slot penuh (${S.positions.length}/${MAX_OPEN}) — ${next.pair.symbol} ditunda`)
      next.pair.reason = 'Slot posisi penuh — ditunda'
      break
    }
    const { pair: p, score, confidence } = S.approved.shift()!
    if (p.phase !== 'spike' && p.phase !== 'pump') {
      p.decision = 'SKIP'
      p.reason = 'Momentum sudah lewat sebelum sizing selesai'
      markInteresting(p)
      log('sizer', 'warn', `SKIP ${p.symbol} — momentum habis sebelum eksekusi (fase ${p.phase})`)
      continue
    }
    const riskPct = clamp(1.2 + confidence * 2.8 + (p.phase === 'pump' ? 0.4 : 0), 1.2, 4.4)
    const stopPct = rnd(8, 11.5)
    const riskUsd = S.equity * (riskPct / 100)
    let notional = riskUsd / (stopPct / 100)
    notional = Math.min(notional, S.equity * 0.35, S.cash * 0.92)
    if (notional < 3 || S.cash < 3) {
      p.decision = 'SKIP'
      p.reason = `Ukuran $${notional.toFixed(2)} di bawah minimum eksekusi`
      markInteresting(p)
      log('sizer', 'warn', `SKIP ${p.symbol} — ukuran $${notional.toFixed(2)} terlalu kecil (risiko dibatasi)`)
      continue
    }
    setAgent('sizer', 'Menghitung', `Size ${p.symbol} $${notional.toFixed(2)}`)
    log('sizer', 'info', `SIZE ${p.symbol}/${p.chain} — risiko ${riskPct.toFixed(1)}% ($${riskUsd.toFixed(2)}) · notional $${notional.toFixed(2)} · SL -${stopPct.toFixed(1)}% · TP1 +16% · skor ${score}/100`)
    executeEntry(p, notional, stopPct)
  }
  if (!S.approved.length && !S.rugQueue.length && chance(0.25)) {
    setAgent('sizer', 'Standby', `Kas $${S.cash.toFixed(2)} · ${S.positions.length}/${MAX_OPEN} slot`)
  }
}

// ---------- executor ----------
function slipFor(p: Pair): number {
  return clamp(0.12 + (25000 / p.liquidity) * rnd(0.25, 0.7) + (p.phase === 'pump' ? 0.25 : 0), 0.1, 2.4)
}

function executeEntry(p: Pair, notional: number, stopPct: number) {
  const slip = slipFor(p)
  const entry = p.price * (1 + slip / 100)
  const pos: Position = {
    id: Math.random().toString(36).slice(2, 10),
    pairId: p.id,
    symbol: p.symbol,
    chain: p.chain,
    origSize: notional,
    sizeUsd: notional,
    entryPrice: entry,
    slippagePct: slip,
    stopPct,
    tp1Pct: 16,
    peakPnlPct: 0,
    partialTaken: false,
    realizedPnlUsd: 0,
    openedTick: S.tick,
    thesis: `Vol spike +${p.spikePct.toFixed(0)}% (z=${p.z.toFixed(1)}) · liq $${(p.liquidity / 1000).toFixed(0)}k · rug ${p.rugScore}/100 · fase ${p.phase}`,
  }
  S.cash -= notional
  S.positions.push(pos)
  p.status = 'held'
  p.decision = 'ENTER'
  p.reason = `Posisi terbuka $${notional.toFixed(2)} @ slip ${slip.toFixed(2)}%`
  markInteresting(p)
  setAgent('executor', 'Mengeksekusi', `LONG ${p.symbol} $${notional.toFixed(2)}`)
  log('executor', 'trade', `ENTER LONG ${p.symbol}/${p.chain} — $${notional.toFixed(2)} @ ${fmtPrice(entry)} (slip ${slip.toFixed(2)}%) · SL -${stopPct.toFixed(1)}% · TP1 +16%`)
}

function fmtPrice(v: number): string {
  if (v >= 1) return `$${v.toFixed(2)}`
  if (v >= 0.01) return `$${v.toFixed(4)}`
  if (v >= 0.0001) return `$${v.toFixed(6)}`
  return `$${v.toExponential(2)}`
}

function closePosition(pos: Position, pair: Pair | undefined, pnlPct: number, reason: string, extraSlip = 0) {
  const exitSlip = clamp(slipFactor(pair) + extraSlip, 0.1, 8)
  const proceeds = pos.sizeUsd * (1 + pnlPct / 100)
  S.cash += Math.max(proceeds, 0)
  const totalPnlUsd = pos.realizedPnlUsd + (proceeds - pos.sizeUsd)
  const totalPnlPct = (totalPnlUsd / pos.origSize) * 100
  const trade: TradeView = {
    id: pos.id,
    symbol: pos.symbol,
    chain: pos.chain,
    sizeUsd: pos.origSize,
    entryPrice: pos.entryPrice,
    exitPrice: pos.entryPrice * (1 + pnlPct / 100) * (1 - exitSlip / 100),
    slippagePct: pos.slippagePct,
    pnlUsd: totalPnlUsd,
    pnlPct: totalPnlPct,
    reason,
    win: totalPnlUsd > 0,
    openedTick: pos.openedTick,
    closedTick: S.tick,
    holdTicks: S.tick - pos.openedTick,
  }
  S.trades.push(trade)
  if (S.trades.length > 60) S.trades.shift()
  S.positions = S.positions.filter((x) => x.id !== pos.id)
  if (pair) {
    pair.status = 'watch'
    pair.decision = 'WAIT'
    pair.reason = `Ditutup ${trade.pnlPct >= 0 ? '+' : ''}${trade.pnlPct.toFixed(1)}% — ${reason}`
    markInteresting(pair)
  }
  journalClose(trade)
  setAgent('executor', 'Mengeksekusi', `CLOSE ${pos.symbol} ${totalPnlPct >= 0 ? '+' : ''}${totalPnlPct.toFixed(1)}%`)
  log('executor', 'trade', `EXIT LONG ${pos.symbol}/${pair?.chain ?? pos.chain} — ${totalPnlPct >= 0 ? '+' : ''}${totalPnlPct.toFixed(1)}% (${totalPnlUsd >= 0 ? '+' : '-'}$${Math.abs(totalPnlUsd).toFixed(2)}) @ ${fmtPrice(trade.exitPrice)} · ${reason} · slip exit ${exitSlip.toFixed(2)}% · ${trade.holdTicks} tick`)
}

function slipFactor(pair: Pair | undefined): number {
  if (!pair) return rnd(0.4, 1.2)
  return clamp(0.12 + (25000 / pair.liquidity) * rnd(0.3, 0.8), 0.1, 6)
}

function executorStep() {
  for (const pos of [...S.positions]) {
    const pair = S.pairs.find((p) => p.id === pos.pairId)
    const mark = pair ? pair.price : pos.entryPrice
    const pnlPct = (mark / pos.entryPrice - 1) * 100
    pos.peakPnlPct = Math.max(pos.peakPnlPct, pnlPct)

    // 1) RUG DETECTED — exit darurat dengan slippage ekstra
    if (pair && pair.phase === 'rug') {
      log('executor', 'danger', `RUG DETECTED ${pos.symbol}/${pair.chain} — harga anjlok, eksekusi exit darurat!`)
      closePosition(pos, pair, pnlPct * (1 - rnd(0.02, 0.07)), 'RUG EXIT — exit darurat', rnd(1.5, 5))
      continue
    }
    // 2) Stop loss
    if (pnlPct <= -pos.stopPct) {
      closePosition(pos, pair, pnlPct, 'STOP LOSS')
      continue
    }
    // 3) Target 2 (pump parabolik)
    if (pnlPct >= 55) {
      closePosition(pos, pair, pnlPct, 'TARGET 2 — pump parabolik')
      continue
    }
    // 4) Trailing stop setelah TP1
    if (pos.partialTaken && pnlPct <= pos.peakPnlPct - 8) {
      closePosition(pos, pair, pnlPct, 'TRAILING STOP')
      continue
    }
    // 5) Sinyal melemah (dump)
    if (pair && pair.phase === 'dump' && S.tick - pos.openedTick > 2) {
      closePosition(pos, pair, pnlPct, pnlPct > 4 ? 'SINYAL MELEMAH — profit diamankan' : 'SINYAL DUMP — cut loss dini')
      continue
    }
    // 6) TP1 — jual 50%, stop ke breakeven
    if (!pos.partialTaken && pnlPct >= pos.tp1Pct) {
      const half = pos.sizeUsd * 0.5
      const proceeds = half * (1 + pnlPct / 100)
      S.cash += proceeds
      pos.realizedPnlUsd += proceeds - half
      pos.sizeUsd *= 0.5
      pos.partialTaken = true
      pos.stopPct = 0 // stop ke breakeven
      markInteresting(pair!)
      log('executor', 'success', `TP1 ${pos.symbol} — jual 50% di +${pnlPct.toFixed(1)}% (+$${(proceeds - half).toFixed(2)}) · stop dinaikkan ke breakeven`)
      setAgent('executor', 'Mengelola', `TP1 ${pos.symbol} +${pnlPct.toFixed(0)}%`)
      continue
    }
    // 7) Breakeven stop (setelah TP1)
    if (pos.partialTaken && pnlPct <= 0.2) {
      closePosition(pos, pair, pnlPct, 'BREAKEVEN STOP')
      continue
    }
    // 8) Time stop
    if (S.tick - pos.openedTick > 42 && pnlPct < 3) {
      closePosition(pos, pair, pnlPct, 'TIME STOP — momentum habis')
      continue
    }
    setAgent('executor', 'Mengelola', `${pos.symbol} ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%`)
  }
  if (!S.positions.length && chance(0.18)) {
    log('executor', 'info', `Menunggu setup valid — ${S.pairs.filter((p) => p.status === 'watch').length} pair diamati · slot ${S.positions.length}/${MAX_OPEN}`)
  }
}

// ---------- journal ----------
function journalClose(trade: TradeView) {
  const st = S.stats
  st.trades++
  st.sumPnlPct += trade.pnlPct
  st.sumSlip += trade.slippagePct
  if (trade.win) {
    st.wins++
    st.grossWin += trade.pnlUsd
    st.sumWinPct += trade.pnlPct
    st.streak = st.streak >= 0 ? st.streak + 1 : 1
  } else {
    st.losses++
    st.grossLoss += Math.abs(trade.pnlUsd)
    st.sumLossPct += trade.pnlPct
    st.streak = st.streak <= 0 ? st.streak - 1 : -1
  }
  st.bestStreak = Math.max(st.bestStreak, st.streak)
  st.best = Math.max(st.best, trade.pnlPct)
  st.worst = Math.min(st.worst, trade.pnlPct)

  setAgent('journal', 'Mencatat', `Trade #${st.trades} ${trade.win ? 'WIN' : 'LOSS'} ${trade.symbol}`)
  log('journal', trade.win ? 'success' : 'warn', `JOURNAL #${st.trades} ${trade.symbol} — ${trade.win ? 'WIN' : 'LOSS'} ${trade.pnlPct >= 0 ? '+' : ''}${trade.pnlPct.toFixed(1)}% · alasan exit: ${trade.reason} · hold ${trade.holdTicks} tick`)

  if (st.trades % 20 === 0) {
    const wr = (st.wins / st.trades) * 100
    const pf = st.grossLoss > 0 ? st.grossWin / st.grossLoss : 99
    log('journal', 'info', `SESSION REVIEW — ${st.trades} trade · win rate ${wr.toFixed(1)}% · profit factor ${pf.toFixed(2)} · ekspektasi ${(st.sumPnlPct / st.trades).toFixed(2)}%/trade`)
  }

  const mult = S.equity / START_EQUITY
  if (mult >= st.lastMilestone * 2) {
    st.lastMilestone *= 2
    log('journal', 'success', `MILESTONE — ekuitas ${st.lastMilestone}x modal awal ($${S.equity.toFixed(2)}) · sistem tetap 24/7`)
  }
}

// ---------- market & account ----------
function marketTick() {
  for (const p of S.pairs) {
    tickPair(p, S.tick)
    if ((p.phase === 'spike' || p.phase === 'pump' || p.phase === 'rug' || p.decision === 'REJECT') && Math.abs(p.changePct) > 2) markInteresting(p)
  }
}

function accountTick() {
  let exposure = 0
  for (const pos of S.positions) {
    const pair = S.pairs.find((p) => p.id === pos.pairId)
    const mark = pair ? pair.price : pos.entryPrice
    const pnlPct = (mark / pos.entryPrice - 1) * 100
    exposure += pos.sizeUsd * (1 + pnlPct / 100)
  }
  S.equity = S.cash + exposure
  S.peakEquity = Math.max(S.peakEquity, S.equity)
  const dd = S.peakEquity > 0 ? ((S.peakEquity - S.equity) / S.peakEquity) * 100 : 0
  S.maxDD = Math.max(S.maxDD, dd)
  // decay heat agent
  for (const id of Object.keys(S.agents) as AgentId[]) S.agents[id].heat *= 0.9
}

// ---------- serialize (JANGAN bocorkan field hidden) ----------
function buildWatchlist(): WatchPair[] {
  const sorted = [...S.pairs]
    .filter((p) => p.phase !== 'dead')
    .sort((a, b) => {
      const rank = (p: Pair) => (p.status === 'held' ? 3 : 0) + (p.decision === 'REJECT' || p.decision === 'ANALYZING' ? 2 : 0) + (Math.abs(p.changePct) > 3 ? 1 : 0)
      return rank(b) - rank(a) || b.lastInterestingTick - a.lastInterestingTick || b.z - a.z
    })
    .slice(0, 9)
  return sorted.map((p) => ({
    id: p.id,
    symbol: p.symbol,
    chain: p.chain,
    price: p.price,
    changePct: p.changePct,
    spikePct: p.spikePct,
    z: p.z,
    liquidity: p.liquidity,
    vol24h: p.vol24h,
    age: p.age,
    rugScore: p.rugScore,
    rugChecks: {
      lpLocked: p.lpLocked,
      honeypot: p.honeypot,
      renounced: p.renounced,
      mintDisabled: p.mintDisabled,
      top10Pct: p.top10,
      holders: p.holders,
    },
    decision: p.decision,
    reason: p.reason,
    phase: p.phase,
  }))
}

function serialize(): EngineState {
  const st = S.stats
  const winRate = st.trades > 0 ? (st.wins / st.trades) * 100 : 0
  const pf = st.grossLoss > 0 ? Math.min(st.grossWin / st.grossLoss, 99) : st.grossWin > 0 ? 99 : 0
  const exposure = S.positions.reduce((acc, pos) => {
    const pair = S.pairs.find((p) => p.id === pos.pairId)
    const mark = pair ? pair.price : pos.entryPrice
    return acc + pos.sizeUsd * (1 + ((mark / pos.entryPrice - 1) * 100) / 100)
  }, 0)
  const positions: PositionView[] = S.positions.map((pos) => {
    const pair = S.pairs.find((p) => p.id === pos.pairId)
    const mark = pair ? pair.price : pos.entryPrice
    const pnlPct = (mark / pos.entryPrice - 1) * 100
    return {
      id: pos.id,
      symbol: pos.symbol,
      chain: pos.chain,
      sizeUsd: pos.sizeUsd,
      entryPrice: pos.entryPrice,
      markPrice: mark,
      slippagePct: pos.slippagePct,
      pnlPct,
      pnlUsd: pos.sizeUsd * (pnlPct / 100),
      stopPct: pos.stopPct,
      tp1Pct: pos.tp1Pct,
      peakPnlPct: pos.peakPnlPct,
      partialTaken: pos.partialTaken,
      age: S.tick - pos.openedTick,
      thesis: pos.thesis,
    }
  })
  return {
    status: S.status,
    speed: S.speed,
    tick: S.tick,
    startedAt: S.startedAt,
    engineVersion: 'NEXUS-6 v1.4.2',
    account: {
      equity: S.equity,
      cash: S.cash,
      startingEquity: START_EQUITY,
      pnl: S.equity - START_EQUITY,
      pnlPct: ((S.equity - START_EQUITY) / START_EQUITY) * 100,
      peakEquity: S.peakEquity,
      maxDrawdownPct: S.maxDD,
      exposureUsd: exposure,
    },
    stats: {
      trades: st.trades,
      wins: st.wins,
      losses: st.losses,
      winRate,
      profitFactor: pf,
      expectancyPct: st.trades > 0 ? st.sumPnlPct / st.trades : 0,
      avgWinPct: st.wins > 0 ? st.sumWinPct / st.wins : 0,
      avgLossPct: st.losses > 0 ? st.sumLossPct / st.losses : 0,
      avgSlippagePct: st.trades > 0 ? st.sumSlip / st.trades : 0,
      bestTradePct: st.best,
      worstTradePct: st.worst,
      streak: st.streak,
      bestStreak: st.bestStreak,
      rejectedRugs: st.rejectedRugs,
    },
    equityCurve: equityCurveView(),
    agents: AGENT_META.map((m) => ({
      id: m.id,
      name: m.name,
      icon: m.icon,
      role: m.role,
      status: S.agents[m.id].status,
      lastAction: S.agents[m.id].lastAction,
      lastActionTick: S.agents[m.id].lastActionTick,
      decisions: S.agents[m.id].decisions,
      heat: S.agents[m.id].heat,
    })),
    activity: S.activity.slice(-60).reverse(),
    watchlist: buildWatchlist(),
    positions,
    trades: [...S.trades].reverse().slice(0, 40),
  }
}

let curve: { t: number; e: number }[] = []
function equityCurveView(): { t: number; e: number }[] {
  curve.push({ t: S.tick, e: S.equity })
  if (curve.length > 700) curve = curve.filter((_, i) => i % 2 === 0)
  return curve
}

// ---------- loop ----------
function tickEngine() {
  S.tick++
  marketTick()
  scannerStep()
  volumeStep()
  rugStep()
  sizerStep()
  executorStep()
  accountTick()
  journalIdle()
  io.emit('state', serialize())
}

function journalIdle() {
  if (S.tick % 30 === 15 && S.stats.trades > 0) {
    const st = S.stats
    const wr = (st.wins / st.trades) * 100
    setAgent('journal', 'Mencatat', `${st.trades} trade · WR ${wr.toFixed(0)}%`)
    log('journal', 'info', `Keputusan tervalidasi — ${st.trades} trade ditutup, ${S.positions.length} aktif, ${st.rejectedRugs} rug dicegah`)
  }
}

let timer: ReturnType<typeof setTimeout> | null = null
function schedule() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    try {
      if (S.status === 'RUNNING') tickEngine()
    } catch (e) {
      console.error('[engine] tick error', e)
    }
    schedule()
  }, TICK_MS / S.speed)
}

// ---------- socket server ----------
const httpServer = createServer()
const io = new Server(httpServer, {
  path: '/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
})

initState()
// warmup curve agar chart tidak kosong saat pertama dibuka
for (let i = 0; i < 3; i++) {
  marketTick()
  equityCurveView()
}

io.on('connection', (socket) => {
  socket.emit('state', serialize())
  socket.on('hello', () => socket.emit('state', serialize()))
  socket.on('control', (cmd: ControlAction) => {
    if (!cmd || typeof cmd.action !== 'string') return
    switch (cmd.action) {
      case 'start':
        S.status = 'RUNNING'
        log('journal', 'info', 'RESUME — bot kembali berjalan 24/7')
        break
      case 'pause':
        S.status = 'PAUSED'
        log('journal', 'warn', 'PAUSE — semua agent ditahan, posisi tetap dipantau')
        break
      case 'reset':
        initState()
        curve = []
        break
      case 'speed':
        if (cmd.value === 1 || cmd.value === 2 || cmd.value === 4) {
          S.speed = cmd.value
          log('journal', 'info', `Kecepatan simulasi diubah ke ${cmd.value}x`)
        }
        break
    }
    io.emit('state', serialize())
  })
  socket.on('error', (e) => console.error('[engine] socket error', e))
})

httpServer.listen(PORT, () => {
  console.log(`[NEXUS-6] trading engine listening on :${PORT}`)
  schedule()
})

process.on('SIGTERM', () => { httpServer.close(() => process.exit(0)) })
process.on('SIGINT', () => { httpServer.close(() => process.exit(0)) })
