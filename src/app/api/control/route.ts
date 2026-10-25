import { NextResponse } from 'next/server'
import { ensureBoot, startBot, stopBot, resetPaper, botLog } from '@/lib/agents/orchestrator'
import { getOrchState, getSettings } from '@/lib/agents/state'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Demo trade: memverifikasi jalur Sizer→Executor→Monitor dgn sinyal sintetis
// berbasis level strategi terkini (entry=harga, SL=0.6%, TP 1R/2R/3R)
async function demoTrade() {
  const st = getOrchState()
  const s = await getSettings()
  const sym = st.watchlist.find((w) => w === 'BTC_USDT') ?? st.watchlist[0]
  if (!sym) return { ok: false, message: 'Watchlist belum siap' }

  const existing = await db.position.findFirst({ where: { symbol: sym, status: 'OPEN' } })
  if (existing) return { ok: false, message: `${sym} sudah punya posisi terbuka` }

  const res = st.results.get(sym)
  const price = res?.price ?? (st.scanRows.find((r) => r.symbol === sym)?.price ?? 0)
  if (!price) return { ok: false, message: 'Harga belum tersedia' }

  const dir = res?.bias.dir === -1 ? -1 : 1
  const slDist = price * 0.006
  const entry = price
  const sl = dir === 1 ? entry - slDist : entry + slDist
  const R = slDist
  const sig = {
    dir: dir as 1 | -1,
    entry,
    sl,
    tp1: dir === 1 ? entry + R * 1 : entry - R * 1,
    tp2: dir === 1 ? entry + R * 2 : entry - R * 2,
    tp3: dir === 1 ? entry + R * 3 : entry - R * 3,
    score: res ? Math.max(res.scores.buy, res.scores.sell) : 7,
    factors: res ? (dir === 1 ? res.factors.buy : res.factors.sell) : [1, 1, 1, 1, 1, 1, 0, 0],
    isQM: false,
    kind: 'CORE' as const,
  }

  // Agent 4 — sizing
  const equity = await db.botState.findUnique({ where: { id: 'main' } }).then((b) => (b?.paperEquity ?? s.paperEquity))
  const riskUsd = equity * (s.riskPct / 100)
  const qtyCoin = riskUsd / slDist
  const notional = qtyCoin * entry
  const margin = notional / s.leverage

  // Agent 5 — eksekusi paper
  await db.position.create({
    data: {
      symbol: sym,
      side: dir,
      qtyCoin,
      remainCoin: qtyCoin,
      entryPrice: entry,
      sl: sig.sl,
      tp1: sig.tp1,
      tp2: sig.tp2,
      tp3: sig.tp3,
      leverage: s.leverage,
      margin,
      riskUsd,
      notional,
      score: sig.score,
      isQM: false,
      mode: s.mode,
    },
  })
  await botLog('A5', 'trade', `DEMO ${dir === 1 ? 'LONG' : 'SHORT'} ${sym} · qty ${qtyCoin.toFixed(6)} @ ${entry.toFixed(2)} · SL ${sig.sl.toFixed(2)} · memverifikasi jalur eksekusi`)
  return { ok: true, message: `Demo ${dir === 1 ? 'LONG' : 'SHORT'} ${sym} dibuka @ ${entry.toFixed(2)} — Agent 6 kini memonitor TP/SL` }
}

export async function POST(request: Request) {
  await ensureBoot()
  try {
    const body = (await request.json()) as { action?: string }
    const st = getOrchState()

    switch (body.action) {
      case 'start':
        startBot()
        return NextResponse.json({ ok: true, running: true, message: '6 Agent Otonom aktif' })
      case 'stop':
        stopBot()
        return NextResponse.json({ ok: true, running: false, message: 'Bot dihentikan' })
      case 'reset-paper':
        await resetPaper()
        return NextResponse.json({ ok: true, message: 'Paper trading direset' })
      case 'demo-trade': {
        const r = await demoTrade()
        return NextResponse.json(r)
      }
      default:
        return NextResponse.json({ ok: false, message: 'Aksi tidak dikenal' }, { status: 400 })
    }
  } catch (e) {
    await botLog('SYS', 'error', `Control error: ${e instanceof Error ? e.message : e}`)
    return NextResponse.json({ ok: false, message: 'Terjadi kesalahan' }, { status: 500 })
  }
}
