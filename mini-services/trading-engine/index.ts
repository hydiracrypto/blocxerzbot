// ============================================================
// APEX-5 · Real-Market Autonomous Trading Engine v2.0
// Pasar sungguhan: Binance Spot (REST + WebSocket real-time)
// 5 Master Strategi (trader legendaris dunia) + Risk Manager
// Eksekusi: PAPER (default) atau LIVE via Binance API keys
// Socket.io :3003 · emit 'state' tiap detik · terima 'control'
// ============================================================
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { BinanceLive, BinanceMarket, type Candle } from './binance'
import { atr, ema, rsi as rsiCalc } from './indicators'
import { MASTERS, MASTER_BY_ID, type MarketCtx, type StrategyPosition } from './strategies'
import { store } from './store'
import type {
  ActivityItem, ControlAction, EngineState, LogLevel, MarketSymbol, MasterId, MasterView,
  PairDecision, PositionView, SettingsView, StatsView, TradeMode, TradeView,
} from '../../src/lib/engine-types'

const PORT = 3003
const TICK_MS = 1000
const ENGINE_VERSION = 'APEX-5 v2.0.0-realmarket'

const ALL_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT', 'DOTUSDT']
const BASE_MAP = Object.fromEntries(ALL_SYMBOLS.map((s) => [s, s.replace('USDT', '')]))
const STRAT_NAME = Object.fromEntries(MASTERS.map((m) => [m.id, m.name])) as Record<string, string>
const TAKER_FEE = 0.001 // 0.1% per sisi

interface Defaults {
  mode: TradeMode
  apiKey: string
  apiSecret: string
  testnet: boolean
  riskPerTradePct: number
  maxOpenPositions: number
  dailyLossLimitPct: number
  startingEquity: number
}

interface Position {
  id: string
  symbol: string
  strategy: MasterId
  qty: number
  sizeUsd: number // notional awal
  entryPrice: number
  stopPrice: number
  tpPrice: number
  peakPrice: number
  feeEntryUsd: number
  mode: TradeMode
  openedAt: number
  thesis: string
}

interface MasterStat {
  decisions: number
  status: string
  lastAction: string
  lastActionTs: number
  heat: number
}

let settings: Defaults = {
  mode: 'PAPER',
  apiKey: '',
  apiSecret: '',
  testnet: true,
  riskPerTradePct: 2,
  maxOpenPositions: 5,
  dailyLossLimitPct: 6,
  startingEquity: 1000,
}

const market = new BinanceMarket(ALL_SYMBOLS)
const live = new BinanceLive()

let S_status: 'RUNNING' | 'PAUSED' = 'RUNNING'
let tick = 0
let cash = settings.startingEquity
let equity = settings.startingEquity
let peakEquity = settings.startingEquity
let maxDD = 0
let positions: Position[] = []
let trades: TradeView[] = []
let stats: StatsView = freshStats()
let activity: ActivityItem[] = []
let equityCurve: { t: number; e: number }[] = []
let masterStats = new Map<MasterId, MasterStat>()
let atrMap = new Map<string, number>()
let decisionMap = new Map<string, { decision: PairDecision; reason: string; ts: number }>()
let lastExitAt = new Map<string, number>() // symbol|master → ts
let focusSymbol = 'BTCUSDT'
let liveConnected = false
let liveBalanceUsd: number | null = null
let dayStartEquity = settings.startingEquity
let dayKey = dayString()
let startedAt = Date.now()
let entriesBlocked = false
let blockReason = ''
let liveOrderBusy = false

function freshStats(): StatsView {
  return {
    trades: 0, wins: 0, losses: 0, winRate: 0, profitFactor: 0, expectancyPct: 0,
    avgWinPct: 0, avgLossPct: 0, bestTradePct: 0, worstTradePct: 0, streak: 0, bestStreak: 0, feesUsd: 0,
  }
}

// ---------- logging ----------
let logSeq = 0
function log(agent: MasterId, level: LogLevel, msg: string) {
  activity.push({ id: `${Date.now()}-${logSeq++}`, ts: Date.now(), agent, level, msg })
  if (activity.length > 140) activity.splice(0, activity.length - 140)
}

function setMaster(id: MasterId, status: string, action: string) {
  const m = masterStats.get(id)
  if (!m) return
  m.status = status
  m.lastAction = action
  m.lastActionTs = Date.now()
  m.decisions++
  m.heat = 1
}

function dayString(): string {
  return new Date().toISOString().slice(0, 10)
}

// ---------- indicator context ----------
function ctxFor(symbol: string): MarketCtx | null {
  const cs = market.getClosed(symbol)
  if (cs.length < 30) return null
  const a = atr(cs, 14)
  const atrVal = a[a.length - 1]
  atrMap.set(symbol, Number.isFinite(atrVal) ? atrVal : 0)
  return {
    symbol,
    candles: cs,
    livePrice: market.price(symbol),
    atr14: Number.isFinite(atrVal) ? atrVal : 0,
    equity,
  }
}

// ---------- risk manager (global) ----------
const risk = {
  refreshDaily() {
    const today = dayString()
    if (today !== dayKey) {
      dayKey = today
      dayStartEquity = equity
      if (entriesBlocked && blockReason.includes('Daily loss limit')) {
        entriesBlocked = false
        blockReason = ''
        log('risk', 'info', 'Hari baru — blokir entry harian dicabut, sistem kembali penuh')
      }
    }
  },
  dailyPnlUsd(): number {
    return equity - dayStartEquity
  },
  dailyPnlPct(): number {
    return dayStartEquity > 0 ? ((equity - dayStartEquity) / dayStartEquity) * 100 : 0
  },
  checkEntryGate(): boolean {
    if (entriesBlocked) return false
    const dp = this.dailyPnlPct()
    if (dp <= -settings.dailyLossLimitPct) {
      entriesBlocked = true
      blockReason = `Daily loss limit ${settings.dailyLossLimitPct}% tercapai (${dp.toFixed(2)}%) — entry baru diblokir (aturan PTJ: pertahankan modal)`
      log('risk', 'danger', `🛡️ RISK GUARD — ${blockReason}`)
      setMaster('risk', 'Menahan', 'Blokir entry — loss harian')
      return false
    }
    if (equity <= settings.startingEquity * 0.6) {
      entriesBlocked = true
      blockReason = 'Ekuitas jatuh 40% dari modal awal — auto-pause untuk investigasi'
      log('risk', 'danger', '🛡️ RISK GUARD — ekuitas -40%, sistem dibekukan sementara')
      S_status = 'PAUSED'
      return false
    }
    return true
  },
  approve(symbol: string, master: MasterId, notional: number): { ok: boolean; why: string } {
    if (positions.length >= settings.maxOpenPositions) return { ok: false, why: `slot penuh ${positions.length}/${settings.maxOpenPositions}` }
    if (positions.some((p) => p.symbol === symbol && p.strategy === master)) return { ok: false, why: 'posisi master di simbol ini sudah ada' }
    const perSymbol = positions.filter((p) => p.symbol === symbol).length
    if (perSymbol >= 2) return { ok: false, why: 'maks 2 posisi per simbol' }
    if (notional < 11) return { ok: false, why: `notional $${notional.toFixed(2)} di bawah minimum bursa $10` }
    if (mode() === 'PAPER' && notional > cash * 0.95) return { ok: false, why: 'kas tidak cukup' }
    if (notional > equity * 0.25) return { ok: false, why: 'notional > 25% ekuitas (konsentrasi)' }
    return { ok: true, why: 'disetujui' }
  },
}

function mode(): TradeMode {
  return settings.mode
}

// ---------- execution ----------
async function openPosition(sig: { master: MasterId; stopDist: number; takeProfitDist: number; riskPct: number; reason: string }, symbol: string) {
  const m = MASTER_BY_ID.get(sig.master)!
  const price = market.price(symbol)
  if (!price || price <= 0) return
  const gate = risk.checkEntryGate()
  if (!gate) return
  const riskPct = Math.min(sig.riskPct, settings.riskPerTradePct)
  const riskUsd = equity * (riskPct / 100)
  let notional = riskUsd / (sig.stopDist / price)
  notional = Math.min(notional, equity * 0.25, mode() === 'PAPER' ? cash * 0.95 : notional)
  const minNota = mode() === 'LIVE' ? live.minNotional(symbol) : 11
  if (notional < minNota) {
    setMaster('risk', 'Menahan', `${symbol} ukuran <$${minNota.toFixed(0)}`)
    return
  }
  const approval = risk.approve(symbol, sig.master, notional)
  if (!approval.ok) {
    setMaster(sig.master, 'Sinyal', `${symbol} ditunda — ${approval.why}`)
    log(sig.master, 'warn', `SINYAL ${symbol} ditolak Risk Manager — ${approval.why} · ${sig.reason.split('—')[0]}`)
    decisionMap.set(symbol, { decision: 'SIGNAL', reason: `Sinyal ditunda: ${approval.why}`, ts: Date.now() })
    return
  }

  setMaster('risk', 'Mengawasi', `Approve ${symbol} ${m.trader} — risiko ${riskPct.toFixed(1)}%`)
  log('risk', 'info', `APPROVAL ${symbol} · ${m.trader} · notional $${notional.toFixed(2)} · risiko ${riskPct.toFixed(1)}% ($${riskUsd.toFixed(2)}) · SL -${((sig.stopDist / price) * 100).toFixed(2)}% · TP +${((sig.takeProfitDist / price) * 100).toFixed(2)}%`)

  const isLive = mode() === 'LIVE' && live.configured
  let entryPrice = price
  let qty = notional / price
  let feeEntry = notional * TAKER_FEE

  if (isLive) {
    if (liveOrderBusy) return
    liveOrderBusy = true
    try {
      const r = await live.marketBuy(symbol, notional)
      if (!r.ok || r.executedQty <= 0) {
        log(sig.master, 'danger', `LIVE BUY ${symbol} GAGAL — ${r.error ?? 'qty 0'} · sinyal dibatalkan`)
        setMaster('risk', 'Error', 'LIVE BUY gagal')
        liveOrderBusy = false
        return
      }
      entryPrice = r.avgPrice
      qty = r.executedQty
      feeEntry = r.cummulativeQuoteQty * TAKER_FEE
      log('risk', 'success', `LIVE BUY terisi ${symbol} — qty ${qty.toPrecision(6)} @ avg $${r.avgPrice.toPrecision(8)} · order #${r.orderId}`)
    } finally {
      liveOrderBusy = false
    }
  } else {
    const slip = 0.0002 + Math.random() * 0.0004 // 0.02–0.06% (buku likuid)
    entryPrice = price * (1 + slip)
    qty = notional / entryPrice
  }

  const pos: Position = {
    id: `${symbol}-${sig.master}-${Date.now().toString(36)}`,
    symbol,
    strategy: sig.master,
    qty,
    sizeUsd: qty * entryPrice,
    entryPrice,
    stopPrice: entryPrice - sig.stopDist,
    tpPrice: entryPrice + sig.takeProfitDist,
    peakPrice: entryPrice,
    feeEntryUsd: feeEntry,
    mode: isLive ? 'LIVE' : 'PAPER',
    openedAt: Date.now(),
    thesis: sig.reason,
  }
  positions.push(pos)
  if (!isLive) cash -= pos.sizeUsd + feeEntry

  setMaster(sig.master, 'Posisi', `LONG ${symbol} @ $${entryPrice.toPrecision(8)}`)
  log(sig.master, 'trade', `ENTER LONG ${symbol} — $${(qty * entryPrice).toFixed(2)} @ $${entryPrice.toPrecision(8)} · SL $${pos.stopPrice.toPrecision(8)} · TP $${pos.tpPrice.toPrecision(8)} · ${m.name} (${m.trader})`)
  log('risk', 'success', `Posisi terbuka ${positions.length}/${settings.maxOpenPositions} · eksposur $${positions.reduce((a, p) => a + p.qty * market.price(p.symbol), 0).toFixed(2)}`)
  decisionMap.set(symbol, { decision: 'ENTER', reason: `Posisi ${m.trader} dibuka`, ts: Date.now() })

  void store.insertTrade({
    id: pos.id,
    symbol,
    strategy: sig.master,
    sizeUsd: pos.sizeUsd,
    qty,
    entryPrice,
    feeUsd: feeEntry,
    reason: sig.reason.slice(0, 250),
    status: 'OPEN',
    mode: pos.mode,
    entryTime: pos.openedAt,
    meta: JSON.stringify({ stopPrice: pos.stopPrice, tpPrice: pos.tpPrice, peakPrice: pos.peakPrice, thesis: pos.thesis }),
  })
}

async function closePosition(pos: Position, exitPrice: number, reason: string, extraFeeUsd = 0) {
  const m = MASTER_BY_ID.get(pos.strategy)!
  const isLive = pos.mode === 'LIVE'
  let feeExit = pos.qty * exitPrice * TAKER_FEE + extraFeeUsd

  if (isLive) {
    if (liveOrderBusy) return
    liveOrderBusy = true
    try {
      const r = await live.marketSell(pos.symbol, pos.qty)
      if (!r.ok || r.executedQty <= 0) {
        log(pos.strategy, 'danger', `LIVE SELL ${pos.symbol} GAGAL — ${r.error ?? 'qty 0'} · akan dicoba ulang tick berikutnya`)
        liveOrderBusy = false
        return
      }
      exitPrice = r.avgPrice
      feeExit = r.cummulativeQuoteQty * TAKER_FEE
      log('risk', 'success', `LIVE SELL terisi ${pos.symbol} — qty ${r.executedQty.toPrecision(6)} @ avg $${r.avgPrice.toPrecision(8)} · order #${r.orderId}`)
    } finally {
      liveOrderBusy = false
    }
  }

  const grossPnl = pos.qty * (exitPrice - pos.entryPrice)
  const pnlUsd = grossPnl - pos.feeEntryUsd - feeExit
  const pnlPct = (pnlUsd / pos.sizeUsd) * 100
  if (!isLive) cash += pos.qty * exitPrice - feeExit

  positions = positions.filter((p) => p.id !== pos.id)
  lastExitAt.set(`${pos.symbol}|${pos.strategy}`, Date.now())

  const trade: TradeView = {
    id: pos.id,
    symbol: pos.symbol,
    strategy: pos.strategy,
    strategyName: STRAT_NAME[pos.strategy] ?? pos.strategy,
    sizeUsd: pos.sizeUsd,
    entryPrice: pos.entryPrice,
    exitPrice,
    pnlUsd,
    pnlPct,
    feeUsd: pos.feeEntryUsd + feeExit,
    reason,
    win: pnlUsd > 0,
    mode: pos.mode,
    entryTime: pos.openedAt,
    exitTime: Date.now(),
    holdMin: Math.round((Date.now() - pos.openedAt) / 60000),
  }
  trades.unshift(trade)
  if (trades.length > 80) trades.pop()
  updateStats(trade)

  const winTag = trade.win ? 'WIN' : 'LOSS'
  setMaster(pos.strategy, trade.win ? 'Profit' : 'Cut', `${winTag} ${pos.symbol} ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%`)
  log(pos.strategy, trade.win ? 'success' : 'warn', `EXIT LONG ${pos.symbol} ${winTag} ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}% (${pnlUsd >= 0 ? '+' : '-'}$${Math.abs(pnlUsd).toFixed(2)}) @ $${exitPrice.toPrecision(8)} · ${reason} · hold ${trade.holdMin}m`)
  decisionMap.set(pos.symbol, { decision: 'EXIT', reason: `${winTag} ${pnlPct.toFixed(1)}% — ${reason}`, ts: Date.now() })

  void store.closeTrade(pos.id, {
    exitPrice,
    pnlUsd,
    pnlPct,
    feeUsd: trade.feeUsd,
    reason,
    exitTime: trade.exitTime,
  })
}

function updateStats(t: TradeView) {
  stats.trades++
  stats.feesUsd += t.feeUsd
  if (t.win) {
    stats.wins++
    stats.streak = stats.streak >= 0 ? stats.streak + 1 : 1
  } else {
    stats.losses++
    stats.streak = stats.streak <= 0 ? stats.streak - 1 : -1
  }
  stats.bestStreak = Math.max(stats.bestStreak, stats.streak)
  stats.winRate = (stats.wins / stats.trades) * 100
  stats.bestTradePct = Math.max(stats.bestTradePct, t.pnlPct)
  stats.worstTradePct = Math.min(stats.worstTradePct, t.pnlPct)
  const gw = trades.filter((x) => x.win).reduce((a, x) => a + x.pnlUsd, 0)
  const gl = Math.abs(trades.filter((x) => !x.win).reduce((a, x) => a + x.pnlUsd, 0))
  stats.profitFactor = gl > 0 ? gw / gl : gw > 0 ? 99 : 0
  const allPct = trades.map((x) => x.pnlPct)
  stats.expectancyPct = allPct.length ? allPct.reduce((a, b) => a + b, 0) / allPct.length : 0
  const wPct = trades.filter((x) => x.win).map((x) => x.pnlPct)
  const lPct = trades.filter((x) => !x.win).map((x) => x.pnlPct)
  stats.avgWinPct = wPct.length ? wPct.reduce((a, b) => a + b, 0) / wPct.length : 0
  stats.avgLossPct = lPct.length ? lPct.reduce((a, b) => a + b, 0) / lPct.length : 0
}

// ---------- market event handlers ----------
async function onCandleClose(symbol: string, _candle: Candle) {
  if (S_status !== 'RUNNING') return
  const ctx = ctxFor(symbol)
  if (!ctx) return

  // 1) strategy-managed exits (di candle close, disiplin master)
  for (const pos of [...positions]) {
    if (pos.symbol !== symbol) continue
    const m = MASTER_BY_ID.get(pos.strategy)
    if (!m) continue
    const sp: StrategyPosition = {
      entryPrice: pos.entryPrice,
      peakPrice: pos.peakPrice,
      openedAt: pos.openedAt,
      meta: {},
    }
    const ex = m.manageExit(sp, ctx)
    if (ex) {
      await closePosition(pos, ctx.livePrice, ex.reason)
      continue
    }
  }

  // 2) master entries
  for (const m of MASTERS) {
    const key = `${symbol}|${m.id}`
    const lastExit = lastExitAt.get(key)
    if (lastExit && Date.now() - lastExit < 10 * 60 * 1000) continue
    const hasOpen = positions.some((p) => p.symbol === symbol && p.strategy === m.id)
    if (hasOpen) continue
    const sig = m.entry(ctx)
    if (sig) {
      setMaster(m.id, 'Sinyal', `${symbol} ${m.name} — entry!`)
      decisionMap.set(symbol, { decision: 'SIGNAL', reason: `${m.trader}: ${sig.reason.split('—')[0]}`, ts: Date.now() })
      log(m.id, 'info', `SINYAL ${symbol} — ${sig.reason}`)
      await openPosition(sig, symbol)
      break // satu entry per candle per simbol
    }
  }
}

function onPrice(symbol: string, price: number) {
  // tick-level: stop / tp / trailing — selalu aktif (juga saat pause)
  for (const pos of [...positions]) {
    if (pos.symbol !== symbol) continue
    pos.peakPrice = Math.max(pos.peakPrice, price)
    if (price <= pos.stopPrice) {
      void closePosition(pos, price, `STOP LOSS @ $${price.toPrecision(8)} — disiplin risiko`)
      continue
    }
    if (price >= pos.tpPrice) {
      void closePosition(pos, price, `TAKE PROFIT @ $${price.toPrecision(8)} — target tercapai`)
      continue
    }
    const m = MASTER_BY_ID.get(pos.strategy)
    const ctx: MarketCtx = {
      symbol,
      candles: market.getClosed(symbol),
      livePrice: price,
      atr14: atrMap.get(symbol) ?? 0,
      equity,
    }
    if (m?.manageTick && ctx.atr14 > 0) {
      const sp: StrategyPosition = { entryPrice: pos.entryPrice, peakPrice: pos.peakPrice, openedAt: pos.openedAt, meta: {} }
      const ex = m.manageTick(sp, ctx)
      if (ex) void closePosition(pos, price, ex.reason)
    }
  }
}

// ---------- account ----------
function computeEquity(): number {
  const exposure = positions.reduce((a, p) => a + p.qty * (market.price(p.symbol) || p.entryPrice), 0)
  if (mode() === 'LIVE' && live.configured && liveBalanceUsd !== null) return liveBalanceUsd + exposure
  return cash + exposure
}

function accountTick() {
  risk.refreshDaily()
  equity = computeEquity()
  peakEquity = Math.max(peakEquity, equity)
  const dd = peakEquity > 0 ? ((peakEquity - equity) / peakEquity) * 100 : 0
  maxDD = Math.max(maxDD, dd)
  for (const m of masterStats.values()) m.heat *= 0.94
}

// ---------- serialize ----------
function masterViews(): MasterView[] {
  const views: MasterView[] = MASTERS.map((m) => {
    const st = masterStats.get(m.id) ?? { decisions: 0, status: 'Siap', lastAction: 'Inisialisasi', lastActionTs: 0, heat: 0 }
    const myTrades = trades.filter((t) => t.strategy === m.id)
    const wins = myTrades.filter((t) => t.win).length
    return {
      id: m.id,
      name: m.name,
      trader: m.trader,
      icon: m.icon,
      role: m.role,
      status: st.status,
      lastAction: st.lastAction,
      lastActionTs: st.lastActionTs,
      decisions: st.decisions,
      heat: st.heat,
      trades: myTrades.length,
      wins,
      winRate: myTrades.length ? (wins / myTrades.length) * 100 : 0,
      pnlUsd: myTrades.reduce((a, t) => a + t.pnlUsd, 0),
      openPositions: positions.filter((p) => p.strategy === m.id).length,
    }
  })
  const r = masterStats.get('risk')!
  views.push({
    id: 'risk',
    name: 'Risk Manager',
    trader: 'Kaidah PTJ',
    icon: 'shield',
    role: `Risiko ≤ ${settings.riskPerTradePct}%/trade · maks ${settings.maxOpenPositions} posisi · loss harian ≤ ${settings.dailyLossLimitPct}%`,
    status: entriesBlocked ? 'Menahan' : 'Mengawasi',
    lastAction: r?.lastAction ?? 'Inisialisasi',
    lastActionTs: r?.lastActionTs ?? 0,
    decisions: r?.decisions ?? 0,
    heat: r?.heat ?? 0,
    trades: 0,
    wins: 0,
    winRate: 0,
    pnlUsd: 0,
    openPositions: 0,
  })
  return views
}

function symbolViews(): MarketSymbol[] {
  return ALL_SYMBOLS.map((s) => {
    const t = market.tickers.get(s)
    const price = market.price(s)
    const cs = market.getClosed(s)
    let emaTrend: 'UP' | 'DOWN' | 'FLAT' = 'FLAT'
    let rsiVal = 50
    if (cs.length > 60) {
      const closes = cs.map((c) => c.c)
      const e21 = ema(closes, 21)
      const e55 = ema(closes, 55)
      const i = closes.length - 1
      if (Number.isFinite(e21[i]) && Number.isFinite(e55[i])) {
        emaTrend = e21[i] > e55[i] * 1.0005 ? 'UP' : e21[i] < e55[i] * 0.9995 ? 'DOWN' : 'FLAT'
      }
      rsiVal = computeRsi(closes)
    }
    const atrVal = atrMap.get(s) ?? computeAtrFallback(s)
    if (!atrMap.has(s) && atrVal > 0) atrMap.set(s, atrVal)
    const dec = decisionMap.get(s)
    const age = dec ? Date.now() - dec.ts : Infinity
    let decision: PairDecision = 'WAIT'
    let reason = 'Menunggu setup'
    if (positions.some((p) => p.symbol === s)) {
      const mine = positions.filter((p) => p.symbol === s)
      decision = 'HOLD'
      reason = `${mine.length} posisi terbuka (${mine.map((p) => MASTER_BY_ID.get(p.strategy)?.trader).join(', ')})`
    } else if (dec && age < 3 * 60 * 1000) {
      decision = dec.decision
      reason = dec.reason
    } else if (emaTrend === 'UP') {
      decision = 'WATCH'
      reason = 'Tren naik — menunggu sinyal master'
    } else if (emaTrend === 'DOWN') {
      decision = 'WATCH'
      reason = 'Tren turun — menunggu peluang reversion'
    }
    const atrPct = price > 0 && atrVal > 0 ? (atrVal / price) * 100 : 0
    return {
      id: s,
      base: BASE_MAP[s],
      price,
      change24hPct: t?.change24hPct ?? 0,
      high24h: t?.high24h ?? 0,
      low24h: t?.low24h ?? 0,
      vol24hUsd: t?.vol24hUsd ?? 0,
      emaTrend,
      rsi14: rsiVal,
      atrPct,
      decision,
      reason,
      sparkline: [...(market.sparkline.get(s) ?? [])],
      mastersActive: positions.filter((p) => p.symbol === s).map((p) => p.strategy),
    }
  })
}

function computeRsi(closes: number[]): number {
  const r = rsiCalc(closes, 14)
  const v = r[r.length - 1]
  return Number.isFinite(v) ? v : 50
}

function computeAtrFallback(symbol: string): number {
  const cs = market.getClosed(symbol)
  if (cs.length < 20) return 0
  const a = atr(cs, 14)
  const v = a[a.length - 1]
  return Number.isFinite(v) ? v : 0
}

function serialize(): EngineState {
  const exposure = positions.reduce((a, p) => a + p.qty * (market.price(p.symbol) || p.entryPrice), 0)
  const positionsView: PositionView[] = positions.map((p) => {
    const mark = market.price(p.symbol) || p.entryPrice
    const pnlPct = ((mark - p.entryPrice) / p.entryPrice) * 100
    return {
      id: p.id,
      symbol: p.symbol,
      base: BASE_MAP[p.symbol],
      strategy: p.strategy,
      strategyName: STRAT_NAME[p.strategy] ?? p.strategy,
      sizeUsd: p.sizeUsd,
      qty: p.qty,
      entryPrice: p.entryPrice,
      markPrice: mark,
      stopPrice: p.stopPrice,
      takeProfitPrice: p.tpPrice,
      pnlPct,
      pnlUsd: p.qty * (mark - p.entryPrice) - p.feeEntryUsd - p.qty * mark * TAKER_FEE,
      peakPnlPct: ((p.peakPrice - p.entryPrice) / p.entryPrice) * 100,
      mode: p.mode,
      openedAt: p.openedAt,
      ageMin: Math.max(0, Math.round((Date.now() - p.openedAt) / 60000)),
      thesis: p.thesis,
    }
  })

  const cs = market.getClosed(focusSymbol)
  const viewCandles = cs.slice(-121).map((c) => ({ t: c.t, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v }))
  const closesAll = cs.map((c) => c.c)
  const e8 = ema(closesAll, 8).slice(-121).map((v) => (Number.isFinite(v) ? v : NaN))
  const e21 = ema(closesAll, 21).slice(-121).map((v) => (Number.isFinite(v) ? v : NaN))

  const settingsView: SettingsView = {
    mode: settings.mode,
    apiKeyMasked: settings.apiKey ? `${settings.apiKey.slice(0, 6)}…${settings.apiKey.slice(-4)}` : '',
    hasApiSecret: settings.apiSecret.length > 0,
    testnet: settings.testnet,
    riskPerTradePct: settings.riskPerTradePct,
    maxOpenPositions: settings.maxOpenPositions,
    dailyLossLimitPct: settings.dailyLossLimitPct,
    startingEquity: settings.startingEquity,
    allowedSymbols: ALL_SYMBOLS,
  }

  return {
    status: S_status,
    tick,
    startedAt,
    engineVersion: ENGINE_VERSION,
    marketName: 'BINANCE SPOT',
    marketWs: market.wsStatus,
    lastMarketTick: market.lastMsgTs,
    focusSymbol,
    candles: viewCandles,
    ema8Series: e8,
    ema21Series: e21,
    account: {
      equity,
      cash,
      startingEquity: settings.startingEquity,
      pnl: equity - settings.startingEquity,
      pnlPct: settings.startingEquity > 0 ? ((equity - settings.startingEquity) / settings.startingEquity) * 100 : 0,
      peakEquity,
      maxDrawdownPct: maxDD,
      exposureUsd: exposure,
      mode: settings.mode,
      liveConnected: liveConnected && live.configured,
      liveBalanceUsd,
    },
    stats,
    risk: {
      dailyPnlUsd: risk.dailyPnlUsd(),
      dailyPnlPct: risk.dailyPnlPct(),
      dailyLossLimitPct: settings.dailyLossLimitPct,
      entriesBlocked,
      blockReason,
      maxOpenPositions: settings.maxOpenPositions,
      riskPerTradePct: settings.riskPerTradePct,
      openPositions: positions.length,
      openExposurePct: equity > 0 ? (exposure / equity) * 100 : 0,
    },
    equityCurve: equityCurve.slice(-600),
    masters: masterViews(),
    activity: activity.slice(-70).reverse(),
    symbols: symbolViews(),
    positions: positionsView,
    trades: trades.slice(0, 50),
    settings: settingsView,
  }
}

// ---------- boot ----------
async function boot() {
  console.log('[apex5] booting — memuat konfigurasi & data pasar real…')

  const saved = await store.loadSettings()
  if (saved.mode === 'LIVE' || saved.mode === 'PAPER') settings.mode = saved.mode
  if (saved.apiKey) settings.apiKey = saved.apiKey
  if (saved.apiSecret) settings.apiSecret = saved.apiSecret
  if (saved.testnet !== undefined) settings.testnet = saved.testnet === 'true'
  if (saved.riskPerTradePct) settings.riskPerTradePct = Number(saved.riskPerTradePct) || 2
  if (saved.maxOpenPositions) settings.maxOpenPositions = Number(saved.maxOpenPositions) || 5
  if (saved.dailyLossLimitPct) settings.dailyLossLimitPct = Number(saved.dailyLossLimitPct) || 6
  if (saved.startingEquity) settings.startingEquity = Number(saved.startingEquity) || 1000

  for (const m of MASTERS.map((x) => x.id)) {
    masterStats.set(m, { decisions: 0, status: 'Siap', lastAction: 'Menunggu data pasar', lastActionTs: 0, heat: 0 })
  }
  masterStats.set('risk', { decisions: 0, status: 'Mengawasi', lastAction: 'Inisialisasi risk guard', lastActionTs: 0, heat: 0 })

  // pulihkan trade & equity dari DB
  const stored = await store.loadTrades()
  const now = Date.now()
  for (const t of stored) {
    if (t.status === 'OPEN') {
      positions.push({
        id: t.id,
        symbol: t.symbol,
        strategy: t.strategy as MasterId,
        qty: t.qty,
        sizeUsd: t.sizeUsd,
        entryPrice: t.entryPrice,
        stopPrice: safeMeta(t.meta, 'stopPrice', t.entryPrice * 0.98),
        tpPrice: safeMeta(t.meta, 'tpPrice', t.entryPrice * 1.04),
        peakPrice: Math.max(safeMeta(t.meta, 'peakPrice', t.entryPrice), t.entryPrice),
        feeEntryUsd: t.feeUsd,
        mode: t.mode as TradeMode,
        openedAt: t.entryTime,
        thesis: safeMetaStr(t.meta, 'thesis', 'Dipulihkan setelah restart'),
      })
    } else {
      trades.push({
        id: t.id,
        symbol: t.symbol,
        strategy: t.strategy as MasterId,
        strategyName: STRAT_NAME[t.strategy] ?? t.strategy,
        sizeUsd: t.sizeUsd,
        entryPrice: t.entryPrice,
        exitPrice: t.exitPrice ?? t.entryPrice,
        pnlUsd: t.pnlUsd ?? 0,
        pnlPct: t.pnlPct ?? 0,
        feeUsd: t.feeUsd,
        reason: t.reason,
        win: (t.pnlUsd ?? 0) > 0,
        mode: t.mode as TradeMode,
        entryTime: t.entryTime,
        exitTime: t.exitTime ?? t.entryTime,
        holdMin: Math.max(0, Math.round(((t.exitTime ?? t.entryTime) - t.entryTime) / 60000)),
      })
    }
  }
  trades.sort((a, b) => b.exitTime - a.exitTime)
  // rebuild stats dari closed trades
  stats = freshStats()
  for (const t of [...trades].reverse()) updateStats(t)
  if (stored.length) {
    log('risk', 'info', `Dipulihkan dari database: ${positions.length} posisi terbuka, ${trades.length} trade tertutup`)
  }

  const eqPts = await store.loadEquity(600)
  if (eqPts.length) {
    equityCurve = eqPts.map((p) => ({ t: p.t, e: p.equity }))
    const lastPt = eqPts[eqPts.length - 1]
    if (mode() === 'PAPER') {
      cash = lastPt.cash
      equity = lastPt.equity
      peakEquity = Math.max(...equityCurve.map((p) => p.e), settings.startingEquity)
      log('risk', 'info', `Ekuitas dipulihkan: $${equity.toFixed(2)} (kas $${cash.toFixed(2)})`)
    }
  }
  dayStartEquity = equity

  // sambungkan pasar real
  market.onCandleClose(onCandleClose)
  market.onPrice(onPrice)
  await market.init()

  // pra-hitung ATR semua simbol dari data historis (agar tampilan & sizing siap sejak detik pertama)
  for (const s of ALL_SYMBOLS) {
    const ctx = ctxFor(s)
    if (ctx) setMaster('risk', 'Siap', `Data historis ${s} siap`)
  }

  if (settings.apiKey && settings.apiSecret) {
    live.configure(settings.apiKey, settings.apiSecret, settings.testnet)
    await live.loadFilters(ALL_SYMBOLS)
    const bal = await live.usdtBalance()
    if (bal !== null) {
      liveConnected = true
      liveBalanceUsd = bal
      log('risk', 'success', `Koneksi LIVE Binance ${settings.testnet ? 'TESTNET' : 'MAINNET'} OK — saldo USDT $${bal.toFixed(2)}`)
    } else {
      log('risk', 'danger', 'API keys ada tapi autentikasi gagal — cek kembali keys di Pengaturan')
    }
  }

  cash = mode() === 'PAPER' && cash === 0 ? settings.startingEquity : cash
  log('risk', 'info', `APEX-5 aktif di pasar SUNGGUHAN Binance Spot · mode ${mode()} · 10 pair USDT · 5 master strategi + Risk Manager`)

  // sinkronisasi saldo live berkala
  setInterval(async () => {
    if (mode() === 'LIVE' && live.configured) {
      const bal = await live.usdtBalance()
      if (bal !== null) {
        liveConnected = true
        liveBalanceUsd = bal
      }
    }
  }, 60_000)

  setInterval(() => {
    equityCurve.push({ t: Date.now(), e: equity })
    if (equityCurve.length > 700) equityCurve = equityCurve.slice(-500)
    void store.addEquityPoint(Date.now(), equity, cash)
    void store.pruneEquity()
  }, 60_000)

  // laporan pemindaian berkala — tiap master menyampaikan kondisi pasar real
  let scanIdx = 0
  setInterval(() => {
    if (S_status !== 'RUNNING') return
    const symbols = ALL_SYMBOLS
    let aboveEma55 = 0
    let aboveEma200 = 0
    let nearOversold = 0
    let rsiSum = 0
    let rsiN = 0
    for (const s of symbols) {
      const cs = market.getClosed(s)
      if (cs.length < 220) continue
      const closes = cs.map((c) => c.c)
      const i = closes.length - 1
      const e55 = ema(closes, 55)[i]
      const e200 = ema(closes, 200)[i]
      if (Number.isFinite(e55) && closes[i] > e55) aboveEma55++
      if (Number.isFinite(e200) && closes[i] > e200) aboveEma200++
      const r = rsiCalc(closes, 14)[i]
      if (Number.isFinite(r)) {
        rsiSum += r
        rsiN++
        if (r < 34) nearOversold++
      }
    }
    const msgs: { id: MasterId; msg: string }[] = [
      { id: 'turtle', msg: `SCAN 10 pair — ${aboveEma55} di atas EMA55 · breakout Donchian-20 dipantau tiap candle 1m` },
      { id: 'seykota', msg: `SCAN tren — ${aboveEma55} pair kemungkinan uptrend · cross EMA8/21 dipantau` },
      { id: 'schwartz', msg: `SCAN momentum — RSI rata-rata ${rsiN ? (rsiSum / rsiN).toFixed(0) : '—'} · konfirmasi volume 1.3x siap` },
      { id: 'ptj', msg: `SCAN makro — ${aboveEma200}/10 pair di atas EMA200 · setup krusial dicatat` },
      { id: 'bollinger', msg: `SCAN reversion — ${nearOversold} pair mendekati band bawah · RSI oversold dipantau` },
    ]
    const m = msgs[scanIdx % msgs.length]
    scanIdx++
    log(m.id, 'info', m.msg)
    setMaster(m.id, 'Memindai', m.msg.split('—')[1]?.trim() ?? 'Memindai')
  }, 150_000)

}

function safeMeta(meta: string | null, key: string, fallback: number): number {
  try {
    if (!meta) return fallback
    const v = JSON.parse(meta)[key]
    return typeof v === 'number' ? v : fallback
  } catch {
    return fallback
  }
}

function safeMetaStr(meta: string | null, key: string, fallback: string): string {
  try {
    if (!meta) return fallback
    const v = JSON.parse(meta)[key]
    return typeof v === 'string' ? v : fallback
  } catch {
    return fallback
  }
}

// ---------- main loop ----------
let heartbeatAt = 0
function mainTick() {
  tick++
  accountTick()
  const now = Date.now()
  if (now - heartbeatAt > 60_000) {
    heartbeatAt = now
    const wsAge = market.lastMsgTs ? Math.round((now - market.lastMsgTs) / 1000) : -1
    log('risk', 'info', `HEARTBEAT · pasar ${market.wsStatus} (data ${wsAge >= 0 ? `${wsAge}s lalu` : 'belum ada'}) · ekuitas $${equity.toFixed(2)} · PnL harian ${risk.dailyPnlPct() >= 0 ? '+' : ''}${risk.dailyPnlPct().toFixed(2)}% · posisi ${positions.length}/${settings.maxOpenPositions}`)
  }
  io.emit('state', serialize())
}

// ---------- socket server ----------
const httpServer = createServer()
const io = new Server(httpServer, {
  path: '/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
})

io.on('connection', (socket) => {
  socket.emit('state', serialize())
  socket.on('hello', () => socket.emit('state', serialize()))
  socket.on('control', (cmd: ControlAction) => {
    if (!cmd || typeof cmd.action !== 'string') return
    switch (cmd.action) {
      case 'start':
        if (S_status === 'PAUSED') {
          S_status = 'RUNNING'
          log('risk', 'info', 'RESUME — bot kembali mengawasi & mengeksekusi pasar real')
        }
        break
      case 'pause':
        S_status = 'PAUSED'
        log('risk', 'warn', 'PAUSE — sinyal baru ditahan; posisi tetap dipantau & stop tetap aktif')
        break
      case 'reset':
        void doReset()
        break
      case 'focus':
        if (typeof cmd.symbol === 'string' && ALL_SYMBOLS.includes(cmd.symbol)) focusSymbol = cmd.symbol
        break
      case 'settings':
        void applySettings(cmd.settings as Record<string, unknown>)
        break
      case 'testTrade':
        void testTrade()
        break
      case 'testClose':
        void testClose()
        break
    }
    io.emit('state', serialize())
  })
  socket.on('error', (e) => console.error('[apex5] socket error', e))
})

async function doReset() {
  if (positions.some((p) => p.mode === 'LIVE')) {
    log('risk', 'danger', 'RESET ditolak — ada posisi LIVE terbuka. Tutup posisi manual di bursa terlebih dahulu.')
    return
  }
  await store.wipeAll()
  positions = []
  trades = []
  stats = freshStats()
  equityCurve = []
  cash = settings.startingEquity
  equity = settings.startingEquity
  peakEquity = settings.startingEquity
  maxDD = 0
  dayStartEquity = equity
  entriesBlocked = false
  blockReason = ''
  decisionMap.clear()
  lastExitAt.clear()
  liveBalanceUsd = null
  for (const m of masterStats.values()) {
    m.decisions = 0
    m.heat = 0
  }
  log('risk', 'info', `RESET — semua data sesi dihapus. Modal diatur ke $${settings.startingEquity.toFixed(2)}. Pasar real tetap tersambung.`)
}

async function applySettings(patch: Record<string, unknown>) {
  let liveReconfigure = false
  const num = (v: unknown, min: number, max: number, dflt: number) => {
    const n = Number(v)
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt
  }

  if (typeof patch.mode === 'string' && (patch.mode === 'PAPER' || patch.mode === 'LIVE')) {
    if (patch.mode === 'LIVE' && !(patch.apiKey ?? settings.apiKey) && !settings.apiKey) {
      log('risk', 'danger', 'Mode LIVE butuh API keys — atur di Pengaturan terlebih dahulu. Tetap di PAPER.')
    } else {
      settings.mode = patch.mode
      log('risk', patch.mode === 'LIVE' ? 'warn' : 'info', `MODE EKSEKUSI → ${patch.mode}${patch.mode === 'LIVE' ? ' · order nyata akan dikirim ke Binance' : ' · order disimulasikan dengan harga real'}`)
    }
  }
  if (typeof patch.apiKey === 'string') {
    if (patch.apiKey !== settings.apiKey) liveReconfigure = true
    settings.apiKey = patch.apiKey.trim()
  }
  if (typeof patch.apiSecret === 'string' && patch.apiSecret.trim().length > 0) {
    if (patch.apiSecret !== settings.apiSecret) liveReconfigure = true
    settings.apiSecret = patch.apiSecret.trim()
  }
  if (typeof patch.testnet === 'boolean') {
    if (patch.testnet !== settings.testnet) liveReconfigure = true
    settings.testnet = patch.testnet
  }
  settings.riskPerTradePct = num(patch.riskPerTradePct, 0.2, 5, settings.riskPerTradePct)
  settings.maxOpenPositions = Math.round(num(patch.maxOpenPositions, 1, 10, settings.maxOpenPositions))
  settings.dailyLossLimitPct = num(patch.dailyLossLimitPct, 1, 30, settings.dailyLossLimitPct)
  if (patch.startingEquity !== undefined && positions.length === 0) {
    settings.startingEquity = num(patch.startingEquity, 100, 1_000_000, settings.startingEquity)
    cash = settings.startingEquity
  }

  await store.saveSettings({
    mode: settings.mode,
    apiKey: settings.apiKey,
    apiSecret: settings.apiSecret,
    testnet: String(settings.testnet),
    riskPerTradePct: String(settings.riskPerTradePct),
    maxOpenPositions: String(settings.maxOpenPositions),
    dailyLossLimitPct: String(settings.dailyLossLimitPct),
    startingEquity: String(settings.startingEquity),
  })

  if (liveReconfigure && settings.apiKey && settings.apiSecret) {
    live.configure(settings.apiKey, settings.apiSecret, settings.testnet)
    await live.loadFilters(ALL_SYMBOLS)
    const bal = await live.usdtBalance()
    if (bal !== null) {
      liveConnected = true
      liveBalanceUsd = bal
      log('risk', 'success', `API Binance ${settings.testnet ? 'TESTNET' : 'MAINNET'} terverifikasi — saldo USDT $${bal.toFixed(2)}`)
    } else {
      liveConnected = false
      log('risk', 'danger', 'Verifikasi API gagal — periksa API key/secret, izin Spot trading, dan IP whitelist')
    }
  }
  log('risk', 'info', `Pengaturan disimpan — risiko ${settings.riskPerTradePct}%/trade · maks ${settings.maxOpenPositions} posisi · loss harian ${settings.dailyLossLimitPct}% · ekuitas awal $${settings.startingEquity}`)
}

const timer = setInterval(mainTick, TICK_MS)

/** UJI PIPELINE — buka satu posisi paper kecil (dipakai verifikasi internal, tidak di UI) */
async function testTrade() {
  const symbol = focusSymbol
  const a = atrMap.get(symbol) ?? 0
  const sig = {
    master: 'turtle' as MasterId,
    stopDist: Math.max(a * 2, market.price(symbol) * 0.002),
    takeProfitDist: Math.max(a * 6, market.price(symbol) * 0.006),
    riskPct: 0.5,
    reason: 'Uji pipeline eksekusi [TEST] — verifikasi entry→manajemen→exit berjalan',
  }
  log('risk', 'info', `TEST TRADE dipicu manual pada ${symbol} — memverifikasi pipeline eksekusi penuh`)
  await openPosition(sig, symbol)
}

/** UJI PIPELINE — tutup posisi paper terbaru dengan harga pasar sekarang */
async function testClose() {
  const pos = [...positions].reverse().find((p) => p.mode === 'PAPER')
  if (!pos) {
    log('risk', 'warn', 'TEST CLOSE — tidak ada posisi paper terbuka')
    return
  }
  await closePosition(pos, market.price(pos.symbol), 'Ditutup manual [TEST] — verifikasi jurnal & persistensi')
}

boot()
  .then(() => {
    httpServer.listen(PORT, () => {
      console.log(`[apex5] engine listening on :${PORT} — pasar real Binance Spot`)
    })
  })
  .catch((e) => {
    console.error('[apex5] FATAL boot error', e)
    process.exit(1)
  })

process.on('SIGTERM', () => {
  clearInterval(timer)
  httpServer.close(() => process.exit(0))
})
process.on('SIGINT', () => {
  clearInterval(timer)
  httpServer.close(() => process.exit(0))
})
