import { NextResponse } from 'next/server'
import { ensureBoot } from '@/lib/agents/orchestrator'
import { getOrchState } from '@/lib/agents/state'
import { getSourceHealth } from '@/lib/mexc/market-data'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  await ensureBoot()
  const st = getOrchState()
  const health = getSourceHealth()

  const openCount = await db.position.count({ where: { status: 'OPEN' } })
  const lastSignal = await db.signal.findFirst({ orderBy: { createdAt: 'desc' } })

  return NextResponse.json({
    running: st.running,
    cycles: st.cycles,
    startedAt: st.startedAt,
    lastTickAt: st.lastTickAt,
    marketSource: st.marketSource,
    watchlist: st.watchlist,
    agents: st.agents,
    dailyGuard: st.dailyGuardTriggered,
    openCount,
    lastSignalAt: lastSignal?.createdAt ?? null,
    sources: {
      MEXC_FUTURES: { ok: health.MEXC_FUTURES.ok },
      MEXC_SPOT: { ok: health.MEXC_SPOT.ok },
      BINANCE_FUTURES: { ok: health.BINANCE_FUTURES.ok },
    },
    scanRows: st.scanRows,
    radarRows: st.radarRows,
  })
}
