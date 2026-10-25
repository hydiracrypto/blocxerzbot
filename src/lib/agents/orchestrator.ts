// ═══════════════════════════════════════════════════════════════════════
// ORCHESTRATOR — 6 Agent Otonom bekerja 24/7
// Pair Scanner → Volume Radar → Strategy Engine → Position Sizer →
// Executor → Risk Monitor
// ═══════════════════════════════════════════════════════════════════════
import { db } from '@/lib/db'
import {
  getUniverse,
  getAllTickers,
  getKlines,
  TF_MS,
  type SourceId,
} from '@/lib/mexc/market-data'
import {
  evaluate,
  DEFAULT_PARAMS,
  type StrategyParams,
  type StrategyResult,
} from '@/lib/strategy/blocxerz'
import { getSettings, getOrchState, saveSettings, type BotSettings } from '@/lib/agents/state'
import { validateKeys, setLeverage, submitOrder, cancelAllSymbolOrders, coinToContracts, SIDE, type MexcKeys } from '@/lib/mexc/trader'

const CYCLE_MS = 20_000

function nowIso() {
  return new Date().toISOString()
}

async function log(agent: string, level: 'info' | 'warn' | 'error' | 'signal' | 'trade', message: string, meta?: unknown) {
  try {
    await db.agentLog.create({
      data: { agent, level, message, meta: meta ? JSON.stringify(meta) : null },
    })
  } catch {
    // ignore db errors pada logging
  }
}

async function touch(agentId: string, action: string, status: 'ACTIVE' | 'IDLE' | 'ERROR' = 'ACTIVE') {
  const st = getOrchState()
  const a = st.agents.find((x) => x.id === agentId)
  if (a) {
    a.ticks++
    a.lastAction = action
    a.lastTickAt = nowIso()
    a.status = status
  }
}

async function failAgent(agentId: string, err: string) {
  const st = getOrchState()
  const a = st.agents.find((x) => x.id === agentId)
  if (a) {
    a.errors++
    a.status = 'ERROR'
    a.lastAction = err.slice(0, 120)
    a.lastTickAt = nowIso()
  }
}

export async function botLog(agent: string, level: 'info' | 'warn' | 'error' | 'signal' | 'trade', message: string, meta?: unknown) {
  await log(agent, level, message, meta)
}

// ═══════════════════════════════════════════════════════════════════════
// AGENT 1 — PAIR SCANNER
// ═══════════════════════════════════════════════════════════════════════
// Stablecoin & aset non-tradeable: volume besar tapi tidak relevan untuk sinyal
const STABLE_BASES = /^(USDC|TUSD|FDUSD|DAI|BUSD|USDP|USD1|PYUSD|USDE|USDtb|EURI|EURC|AEUR|XUSD|USDS|FRAX|PAXG|XAUT|WBTC|WBETH|WSTETH|STETH)$/i

async function agent1Scanner(s: BotSettings) {
  const st = getOrchState()
  try {
    const uni = await getUniverse()
    const tk = await getAllTickers()
    st.marketSource = uni.source

    const rows = uni.items
      .map((u) => {
        const t = tk.map.get(u.symbol)
        return {
          symbol: u.symbol,
          price: t?.lastPrice ?? 0,
          changeRate: t?.changeRate ?? 0,
          quoteVolume: t?.quoteVolume ?? 0,
          source: tk.source,
        }
      })
      .filter((r) => r.price > 0 && r.quoteVolume >= s.minVolUsd && !STABLE_BASES.test(r.symbol.replace('_USDT', '')))
      .sort((a, b) => b.quoteVolume - a.quoteVolume)

    const watch = rows.slice(0, s.maxWatch).map((r) => r.symbol)
    st.watchlist = watch
    st.scanRows = rows.slice(0, 50).map((r, i) => ({ ...r, rank: i + 1, watched: watch.includes(r.symbol) }))

    await touch('A1', `Memindai ${uni.items.length} aset · watchlist top ${watch.length} · vol ≥ ${fmtUsd(s.minVolUsd)}`)
  } catch (e) {
    await failAgent('A1', e instanceof Error ? e.message : String(e))
    await log('A1', 'error', `Scanner gagal: ${e instanceof Error ? e.message : e}`)
  }
}

function fmtUsd(v: number): string {
  if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B'
  if (v >= 1e6) return (v / 1e6).toFixed(0) + 'M'
  return v.toFixed(0)
}

// ═══════════════════════════════════════════════════════════════════════
// AGENT 2 — VOLUME RADAR
// ═══════════════════════════════════════════════════════════════════════
async function agent2VolumeRadar(s: BotSettings) {
  const st = getOrchState()
  try {
    const rows: typeof st.radarRows = []
    for (const sym of st.watchlist) {
      const prev = st.results.get(sym)
      const t = st.scanRows.find((r) => r.symbol === sym)
      if (!t) continue
      let volSpike = prev ? 1 : 1
      if (prev && prev.atr > 0) {
        volSpike = (prev as StrategyResult & { volSpike?: number }).volSpike ?? 1
      }
      const radarScore = Math.min(100, Math.round((t.quoteVolume / (s.minVolUsd * 10)) * 30 + Math.abs(t.changeRate) * 800 + volSpike * 20))
      rows.push({ symbol: sym, price: t.price, changeRate: t.changeRate, quoteVolume: t.quoteVolume, volSpike, score: radarScore })
    }
    rows.sort((a, b) => b.score - a.score)
    st.radarRows = rows.slice(0, 15)
    const hot = rows.filter((r) => r.score >= 60).length
    await touch('A2', `Radar ${rows.length} pair · ${hot} momentum panas`)
  } catch (e) {
    await failAgent('A2', e instanceof Error ? e.message : String(e))
  }
}

// ═══════════════════════════════════════════════════════════════════════
// AGENT 3 — STRATEGY ENGINE (BLOCXERZ v3.0)
// ═══════════════════════════════════════════════════════════════════════
async function agent3Strategy(s: BotSettings) {
  const st = getOrchState()
  const params: StrategyParams = {
    ...DEFAULT_PARAMS,
    minScore: s.minScore,
    qmMinScore: s.qmMinScore,
    allowFlip: s.allowFlip,
  }

  let evaluated = 0
  let newBars = 0
  const signals: StrategyResult[] = []

  for (const sym of st.watchlist) {
    try {
      // 15m: 1000 bar (zona), 30m/1h: 400, 4h: 400 (EMA200), 1d: 40, 1w: 40
      const [m15, m30, h1, h4, d1, w1] = await Promise.all([
        getKlines(sym, '15m', 1000),
        getKlines(sym, '30m', 400),
        getKlines(sym, '1h', 400),
        getKlines(sym, '4h', 400),
        getKlines(sym, '1d', 40),
        getKlines(sym, '1w', 40),
      ])
      evaluated++

      const lastClosedT = m15.candles.length >= 2 ? m15.candles[m15.candles.length - 2].t : -1
      const prev = st.results.get(sym)
      if (prev && prev.barT === lastClosedT) continue // belum ada bar 15m baru yang closed
      newBars++

      // gunakan candle CLOSED saja (buang bar berjalan)
      const res = evaluate(sym, {
        m15: m15.candles.slice(0, -1),
        m30: m30.candles.slice(0, -1),
        h1: h1.candles.slice(0, -1),
        h4: h4.candles.slice(0, -1),
        d1: d1.candles,
        w1: w1.candles,
        source: m15.source,
      }, params)

      if (!res) continue
      // volSpike utk radar
      const volSpike = res.factors.buy[6] || res.factors.sell[6] ? 1.5 : 1
      ;(res as StrategyResult & { volSpike?: number }).volSpike = volSpike
      st.results.set(sym, res)

      if (res.signal) {
        signals.push(res)
        await log('A3', 'signal', `SINYAL ${res.signal.dir === 1 ? 'LONG' : 'SHORT'} ${sym} · skor ${res.signal.score}/8${res.signal.isQM ? ' · QM' : ''} · E ${res.signal.entry.toFixed(res.price >= 100 ? 2 : 5)}`, {
          dir: res.signal.dir,
          factors: res.signal.factors,
          bias: res.bias.reason,
        })
      }
    } catch (e) {
      // sumber data gagal untuk simbol ini — lanjut
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('Semua sumber')) {
        await failAgent('A3', `${sym}: data tidak tersedia`)
      }
    }
  }

  await touch('A3', `Eval ${evaluated} pair · ${newBars} bar baru · ${signals.length} sinyal`)
  return signals
}

// ═══════════════════════════════════════════════════════════════════════
// AGENT 4 — POSITION SIZER
// ═══════════════════════════════════════════════════════════════════════
interface SizedTrade {
  qtyCoin: number
  notional: number
  margin: number
  riskUsd: number
  leverage: number
  skip?: string
}

async function getEquity(s: BotSettings): Promise<number> {
  if (s.mode === 'LIVE' && validateKeys({ apiKey: s.apiKey, secret: s.apiSecret })) {
    try {
      const { getAccountAssets } = await import('@/lib/mexc/trader')
      const assets = await getAccountAssets({ apiKey: s.apiKey, secret: s.apiSecret })
      const usdt = assets.find((a) => a.currency === 'USDT')
      if (usdt) {
        const eq = Number(usdt.equilibrium ?? usdt.availableBalance ?? 0)
        if (eq > 0) return eq
      }
    } catch {
      // fallback ke paper equity
    }
  }
  const state = await db.botState.findUnique({ where: { id: 'main' } })
  const realized = await db.trade.aggregate({ _sum: { pnl: true } })
  return (state?.paperEquity ?? s.paperEquity) + (realized._sum.pnl ?? 0)
}

async function agent4Sizer(s: BotSettings, res: StrategyResult, openPositions: number): Promise<SizedTrade> {
  const sig = res.signal!
  const equity = await getEquity(s)
  const riskUsd = equity * (s.riskPct / 100)
  const slDist = Math.abs(sig.entry - sig.sl)

  if (slDist <= 0) return { qtyCoin: 0, notional: 0, margin: 0, riskUsd, leverage: s.leverage, skip: 'SL distance invalid' }

  const qtyCoin = riskUsd / slDist
  const notional = qtyCoin * sig.entry
  const minNotional = 5

  if (notional < minNotional) {
    // naikkan qty ke minimal notional bila margin memadai
    const adjQty = minNotional / sig.entry
    const adjRisk = adjQty * slDist
    if (adjRisk <= riskUsd * 3 && equity > minNotional) {
      return { qtyCoin: adjQty, notional: minNotional, margin: minNotional / s.leverage, riskUsd: adjRisk, leverage: s.leverage }
    }
    return { qtyCoin: 0, notional: 0, margin: 0, riskUsd, leverage: s.leverage, skip: `Notional < $${minNotional} (equity kecil)` }
  }

  const margin = notional / s.leverage
  if (margin > equity * 0.5) {
    return { qtyCoin: 0, notional: 0, margin: 0, riskUsd, leverage: s.leverage, skip: 'Margin > 50% equity' }
  }

  await touch('A4', `Size ${res.symbol}: qty ${qtyCoin.toFixed(6)} · notional $${notional.toFixed(1)} · risk $${riskUsd.toFixed(2)}`)
  return { qtyCoin, notional, margin, riskUsd, leverage: s.leverage }
}

// ═══════════════════════════════════════════════════════════════════════
// AGENT 5 — EXECUTOR
// ═══════════════════════════════════════════════════════════════════════
async function agent5Execute(s: BotSettings, res: StrategyResult, size: SizedTrade, openPos: { id: string; side: number } | null) {
  const st = getOrchState()
  const sig = res.signal!
  const dir = sig.dir

  // FLIP: posisi terbuka lawan arah → tutup dulu
  if (openPos && openPos.side !== dir && s.allowFlip) {
    await closePosition(openPos.id, sig.entry, 'FLIP')
  } else if (openPos) {
    return { skipped: 'Posisi sudah terbuka' }
  }

  if (size.skip) return { skipped: size.skip }

  const feeRate = s.feePct / 100
  const entryFee = size.notional * feeRate

  if (s.mode === 'LIVE' && validateKeys({ apiKey: s.apiKey, secret: s.apiSecret })) {
    const keys: MexcKeys = { apiKey: s.apiKey, secret: s.apiSecret }
    const uni = await getUniverse()
    const contract = uni.items.find((u) => u.symbol === res.symbol)
    const contractSize = contract?.contractSize ?? 1
    try {
      await setLeverage(keys, res.symbol, Math.round(s.leverage)).catch(() => undefined)
      const entryOrder = await submitOrder(keys, {
        symbol: res.symbol,
        side: dir === 1 ? SIDE.OPEN_LONG : SIDE.OPEN_SHORT,
        vol: coinToContracts(size.qtyCoin, contractSize),
        leverage: Math.round(s.leverage),
      })
      if (!entryOrder.ok) {
        await log('A5', 'error', `Order entry ${res.symbol} GAGAL: ${entryOrder.error}`)
        return { skipped: `Exchange: ${entryOrder.error}` }
      }
      // SL + TP trigger orders
      const remain = size.qtyCoin
      const q1 = s.tpMode === 'LADDER' ? remain * 0.33 : remain
      const q2 = s.tpMode === 'LADDER' ? remain * 0.33 : remain
      const q3 = s.tpMode === 'LADDER' ? remain * 0.34 : remain
      await submitOrder(keys, { symbol: res.symbol, side: dir === 1 ? SIDE.CLOSE_LONG : SIDE.CLOSE_SHORT, vol: coinToContracts(remain, contractSize), triggerPrice: sig.sl, leverage: Math.round(s.leverage) })
      await submitOrder(keys, { symbol: res.symbol, side: dir === 1 ? SIDE.CLOSE_LONG : SIDE.CLOSE_SHORT, vol: coinToContracts(q1, contractSize), triggerPrice: sig.tp1, leverage: Math.round(s.leverage) })
      await submitOrder(keys, { symbol: res.symbol, side: dir === 1 ? SIDE.CLOSE_LONG : SIDE.CLOSE_SHORT, vol: coinToContracts(q2, contractSize), triggerPrice: sig.tp2, leverage: Math.round(s.leverage) })
      await submitOrder(keys, { symbol: res.symbol, side: dir === 1 ? SIDE.CLOSE_LONG : SIDE.CLOSE_SHORT, vol: coinToContracts(q3, contractSize), triggerPrice: sig.tp3, leverage: Math.round(s.leverage) })

      await db.position.create({
        data: {
          symbol: res.symbol,
          side: dir,
          qtyCoin: size.qtyCoin,
          remainCoin: size.qtyCoin,
          entryPrice: sig.entry,
          sl: sig.sl,
          tp1: sig.tp1,
          tp2: sig.tp2,
          tp3: sig.tp3,
          leverage: s.leverage,
          margin: size.margin,
          riskUsd: size.riskUsd,
          notional: size.notional,
          score: sig.score,
          isQM: sig.isQM,
          mode: 'LIVE',
          exchangeId: entryOrder.orderId,
        },
      })
      await log('A5', 'trade', `LIVE OPEN ${dir === 1 ? 'LONG' : 'SHORT'} ${res.symbol} · ${size.qtyCoin.toFixed(6)} @ ${sig.entry} · orderId ${entryOrder.orderId}`)
      await touch('A5', `LIVE ${dir === 1 ? 'LONG' : 'SHORT'} ${res.symbol} terkirim ke MEXC`)
      st.dailyGuardTriggered = false
      return { ok: true }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await log('A5', 'error', `Eksekusi LIVE ${res.symbol} error: ${msg}`)
      return { skipped: msg }
    }
  }

  // ── PAPER EXECUTION ──
  await db.position.create({
    data: {
      symbol: res.symbol,
      side: dir,
      qtyCoin: size.qtyCoin,
      remainCoin: size.qtyCoin,
      entryPrice: sig.entry,
      sl: sig.sl,
      tp1: sig.tp1,
      tp2: sig.tp2,
      tp3: sig.tp3,
      leverage: s.leverage,
      margin: size.margin,
      riskUsd: size.riskUsd,
      notional: size.notional,
      score: sig.score,
      isQM: sig.isQM,
      mode: 'PAPER',
    },
  })
  await log('A5', 'trade', `PAPER OPEN ${dir === 1 ? 'LONG' : 'SHORT'} ${res.symbol} · qty ${size.qtyCoin.toFixed(6)} @ ${sig.entry.toFixed(sig.entry >= 100 ? 2 : 5)} · SL ${sig.sl.toFixed(sig.sl >= 100 ? 2 : 5)} · TP2 ${sig.tp2.toFixed(sig.tp2 >= 100 ? 2 : 5)}`)
  await touch('A5', `${dir === 1 ? 'LONG' : 'SHORT'} ${res.symbol} dieksekusi (${s.mode})`)
  return { ok: true }
}

// ═══════════════════════════════════════════════════════════════════════
// POSITION CLOSE HELPER (dipakai Agent 5 FLIP & Agent 6)
// ═══════════════════════════════════════════════════════════════════════
export async function closePosition(posId: string, exitPrice: number, reason: 'TP1' | 'TP2' | 'TP3' | 'SL' | 'FLIP' | 'MANUAL', closeQty?: number) {
  const s = await getSettings()
  const pos = await db.position.findUnique({ where: { id: posId } })
  if (!pos || pos.status !== 'OPEN') return

  const qty = Math.min(closeQty ?? pos.remainCoin, pos.remainCoin)
  if (qty <= 0) return

  const dir = pos.side
  const grossPnl = (exitPrice - pos.entryPrice) * qty * dir
  const feeRate = s.feePct / 100
  const fees = (qty * pos.entryPrice + qty * exitPrice) * feeRate
  const pnl = grossPnl - fees
  const pnlPct = pos.margin > 0 ? (pnl / pos.margin) * 100 : 0

  await db.trade.create({
    data: {
      positionId: pos.id,
      symbol: pos.symbol,
      side: pos.side,
      qtyCoin: qty,
      entryPrice: pos.entryPrice,
      exitPrice,
      pnl,
      pnlPct,
      reason,
      mode: pos.mode,
    },
  })

  const remain = pos.remainCoin - qty
  const fullyClosed = remain <= pos.qtyCoin * 0.001 || reason === 'SL' || reason === 'TP3' || reason === 'FLIP' || reason === 'MANUAL'

  // LIVE: kirim order penutup ke exchange
  if (pos.mode === 'LIVE' && validateKeys({ apiKey: s.apiKey, secret: s.apiSecret })) {
    const keys: MexcKeys = { apiKey: s.apiKey, secret: s.apiSecret }
    const uni = await getUniverse()
    const contract = uni.items.find((u) => u.symbol === pos.symbol)
    const contractSize = contract?.contractSize ?? 1
    try {
      await cancelAllSymbolOrders(keys, pos.symbol)
      if (fullyClosed) {
        await submitOrder(keys, {
          symbol: pos.symbol,
          side: dir === 1 ? SIDE.CLOSE_LONG : SIDE.CLOSE_SHORT,
          vol: coinToContracts(remain > 0 ? remain : pos.remainCoin, contractSize),
        })
      } else {
        await submitOrder(keys, {
          symbol: pos.symbol,
          side: dir === 1 ? SIDE.CLOSE_LONG : SIDE.CLOSE_SHORT,
          vol: coinToContracts(qty, contractSize),
        })
        // pasang ulang SL trigger utk sisa posisi
        const newSl = reason === 'TP1' ? pos.entryPrice : reason === 'TP2' ? pos.tp1 : pos.sl
        await submitOrder(keys, {
          symbol: pos.symbol,
          side: dir === 1 ? SIDE.CLOSE_LONG : SIDE.CLOSE_SHORT,
          vol: coinToContracts(remain, contractSize),
          triggerPrice: newSl,
        })
      }
    } catch (e) {
      await log('A6', 'error', `LIVE close ${pos.symbol} gagal: ${e instanceof Error ? e.message : e}`)
    }
  }

  await db.position.update({
    where: { id: pos.id },
    data: {
      remainCoin: fullyClosed ? 0 : remain,
      status: fullyClosed ? 'CLOSED' : 'OPEN',
      exitPrice: fullyClosed ? exitPrice : pos.exitPrice,
      exitReason: fullyClosed ? reason : pos.exitReason,
      pnl: pos.pnl + pnl,
      closedAt: fullyClosed ? new Date() : pos.closedAt,
      beMoved: reason === 'TP1' || pos.beMoved,
      tp1Hit: reason === 'TP1' || pos.tp1Hit,
      tp2Hit: reason === 'TP2' || pos.tp2Hit,
      sl: reason === 'TP1' && !fullyClosed ? pos.entryPrice : reason === 'TP2' && !fullyClosed ? pos.tp1 : pos.sl,
    },
  })

  await log('A6', 'trade', `CLOSE ${reason} ${pos.symbol} ${dir === 1 ? 'LONG' : 'SHORT'} · qty ${qty.toFixed(6)} @ ${exitPrice.toFixed(exitPrice >= 100 ? 2 : 5)} · PnL ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} USDT (${pnlPct.toFixed(1)}%)`)

  const st = getOrchState()
  await touch('A6', `${reason} ${pos.symbol} · PnL ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}`)
  void st
}

// ═══════════════════════════════════════════════════════════════════════
// AGENT 6 — RISK MONITOR (supervisi posisi 24/7)
// ═══════════════════════════════════════════════════════════════════════
async function agent6Monitor(s: BotSettings) {
  const st = getOrchState()
  try {
    const positions = await db.position.findMany({ where: { status: 'OPEN' } })
    if (positions.length === 0) {
      await touch('A6', 'Tidak ada posisi terbuka · supervisi aktif')
      return
    }

    // daily loss guard
    const today = new Date().toISOString().slice(0, 10)
    if (st.dailyGuardDate !== today) {
      st.dailyGuardDate = today
      st.dailyGuardTriggered = false
    }
    if (!st.dailyGuardTriggered) {
      const todays = await db.trade.findMany({ where: { closedAt: { gte: new Date(today + 'T00:00:00.000Z') } } })
      const dayPnl = todays.reduce((x, t) => x + t.pnl, 0)
      const equity = await getEquity(s)
      if (dayPnl < 0 && Math.abs(dayPnl) >= equity * (s.maxDailyLossPct / 100)) {
        st.dailyGuardTriggered = true
        await log('A6', 'warn', `GUARD: Batas loss harian ${s.maxDailyLossPct}% tercapai (−${Math.abs(dayPnl).toFixed(2)}). Posisi baru ditahan sampai besok.`)
      }
    }

    let actions = 0
    for (const pos of positions) {
      try {
        const price = await lastPriceFor(pos.symbol)
        if (!price) continue
        const dir = pos.side

        // SL check (prioritas seperti Pine: SL > TP)
        if ((dir === 1 && price <= pos.sl) || (dir === -1 && price >= pos.sl)) {
          await closePosition(pos.id, pos.sl, 'SL')
          actions++
          continue
        }
        // TP3
        if ((dir === 1 && price >= pos.tp3) || (dir === -1 && price <= pos.tp3)) {
          await closePosition(pos.id, pos.tp3, 'TP3')
          actions++
          continue
        }
        // TP2
        if (!pos.tp2Hit && ((dir === 1 && price >= pos.tp2) || (dir === -1 && price <= pos.tp2))) {
          if (s.tpMode === 'LADDER') {
            await closePosition(pos.id, pos.tp2, 'TP2', pos.qtyCoin * 0.33)
          } else {
            await db.position.update({ where: { id: pos.id }, data: { tp2Hit: true, sl: pos.tp1 } })
            await log('A6', 'info', `TP2 ${pos.symbol} tersentuh · SL digeser ke TP1`)
          }
          actions++
          continue
        }
        // TP1 → partial close + SL ke breakeven
        if (!pos.tp1Hit && ((dir === 1 && price >= pos.tp1) || (dir === -1 && price <= pos.tp1))) {
          if (s.tpMode === 'LADDER') {
            await closePosition(pos.id, pos.tp1, 'TP1', pos.qtyCoin * 0.33)
          } else {
            await db.position.update({ where: { id: pos.id }, data: { tp1Hit: true, beMoved: true, sl: pos.entryPrice } })
            await log('A6', 'info', `TP1 ${pos.symbol} tersentuh · SL digeser ke breakeven`)
          }
          actions++
        }
      } catch (e) {
        await failAgent('A6', e instanceof Error ? e.message : String(e))
      }
    }

    await touch(
      'A6',
      `Supervisi ${positions.length} posisi · ${actions} aksi risk management`
    )
  } catch (e) {
    await failAgent('A6', e instanceof Error ? e.message : String(e))
  }
}

async function lastPriceFor(symbol: string): Promise<number | null> {
  const st = getOrchState()
  const row = st.scanRows.find((r) => r.symbol === symbol)
  if (row && row.price > 0) return row.price
  try {
    const k = await getKlines(symbol, '15m', 3)
    return k.candles[k.candles.length - 1]?.c ?? null
  } catch {
    return null
  }
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN CYCLE — 6 agent bekerja berurutan setiap 20 detik
// ═══════════════════════════════════════════════════════════════════════
async function runCycle() {
  const st = getOrchState()
  if (st.busy) return
  st.busy = true
  try {
    const s = await getSettings()
    if (!st.running) {
      st.busy = false
      return
    }

    // A1 — Pair Scanner
    await agent1Scanner(s)

    // A2 — Volume Radar
    await agent2VolumeRadar(s)

    // A3 — Strategy Engine
    const signals = await agent3Strategy(s)

    // A4+A5 — Position Sizer + Executor utk sinyal baru
    if (signals.length > 0 && !st.dailyGuardTriggered) {
      const openPositions = await db.position.findMany({ where: { status: 'OPEN' } })
      for (const res of signals) {
        const openCount = openPositions.filter((p) => p.status === 'OPEN').length
        const existing = openPositions.find((p) => p.symbol === res.symbol && p.status === 'OPEN')
        if (!existing && openCount >= s.maxPositions) {
          await db.signal.create({
            data: signalRow(res, s, false, `Max ${s.maxPositions} posisi tercapai`),
          })
          await log('A5', 'warn', `Sinyal ${res.symbol} dilewati: max ${s.maxPositions} posisi`)
          continue
        }
        const size = await agent4Sizer(s, res, openCount)
        const execRes = await agent5Execute(s, res, size, existing ? { id: existing.id, side: existing.side } : null)
        const executed = 'ok' in execRes && execRes.ok
        await db.signal.create({
          data: signalRow(res, s, executed, 'skipped' in execRes && execRes.skipped ? execRes.skipped : null),
        })
      }
    } else if (signals.length > 0) {
      for (const res of signals) {
        await db.signal.create({ data: signalRow(res, s, false, 'Daily loss guard aktif') })
      }
    }

    // A6 — Risk Monitor
    await agent6Monitor(s)

    st.cycles++
    st.lastTickAt = nowIso()
    await db.botState.upsert({
      where: { id: 'main' },
      update: { cycles: st.cycles, lastTickAt: new Date(), running: st.running, dataSource: st.marketSource },
      create: { id: 'main', cycles: st.cycles, running: st.running, dataSource: st.marketSource },
    })
  } catch (e) {
    await log('SYS', 'error', `Cycle error: ${e instanceof Error ? e.message : e}`)
  } finally {
    st.busy = false
  }
}

function signalRow(res: StrategyResult, s: BotSettings, executed: boolean, skipReason: string | null) {
  const sig = res.signal!
  return {
    symbol: res.symbol,
    direction: sig.dir,
    isQM: sig.isQM,
    score: sig.score,
    factors: JSON.stringify(sig.factors),
    entry: sig.entry,
    sl: sig.sl,
    tp1: sig.tp1,
    tp2: sig.tp2,
    tp3: sig.tp3,
    riskUsd: 0,
    qtyCoin: 0,
    timeframe: '15m',
    dataSource: res.source,
    executed,
    skipReason,
  }
}

// ═══════════════════════════════════════════════════════════════════════
// BOOT / CONTROL
// ═══════════════════════════════════════════════════════════════════════
const CODE_VERSION = '2025-10-25.2'

export function startBot(): void {
  const st = getOrchState()
  if (st.running && st.timer) return
  st.running = true
  st.startedAt = st.startedAt ?? Date.now()
  if (!st.timer) {
    st.timer = setInterval(() => {
      void runCycle()
    }, CYCLE_MS)
    // jalankan cycle pertama segera
    void runCycle()
  }
  void log('SYS', 'info', 'BOT START — 6 Agent Otonom aktif 24/7 · MEXC Futures')
}

export function stopBot(): void {
  const st = getOrchState()
  st.running = false
  if (st.timer) {
    clearInterval(st.timer)
    st.timer = null
  }
  void log('SYS', 'warn', 'BOT STOP — semua agent dijeda')
}

export async function ensureBoot(): Promise<void> {
  const st = getOrchState()
  try {
    const s = await getSettings()

    // Hot-reload: bila kode orchestrator berubah, ganti timer lama dgn siklus baru
    if (st.codeVersion !== CODE_VERSION) {
      if (st.timer) {
        clearInterval(st.timer)
        st.timer = null
      }
      const wasRunning = st.running || s.autoRun
      st.codeVersion = CODE_VERSION
      if (wasRunning) startBot()
      if (st.bootstrapped) return
    }

    if (st.bootstrapped) return
    st.bootstrapped = true
    const state = await db.botState.upsert({
      where: { id: 'main' },
      update: {},
      create: { id: 'main', paperEquity: s.paperEquity, running: false },
    })
    st.cycles = state.cycles
    if (s.autoRun && !st.running) {
      startBot()
    }
  } catch (e) {
    await log('SYS', 'error', `Boot error: ${e instanceof Error ? e.message : e}`)
  }
}

export async function resetPaper(): Promise<void> {
  await saveSettings({ paperEquity: 1000 })
  await db.trade.deleteMany({ where: { mode: 'PAPER' } })
  await db.position.deleteMany({ where: { mode: 'PAPER' } })
  await log('SYS', 'info', 'Paper trading direset: equity kembali ke 1000 USDT')
}
