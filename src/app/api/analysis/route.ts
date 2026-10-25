import { NextResponse } from 'next/server'
import { ensureBoot } from '@/lib/agents/orchestrator'
import { getOrchState } from '@/lib/agents/state'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  await ensureBoot()
  const st = getOrchState()

  const analyses = Array.from(st.results.values())
    .filter((r) => st.watchlist.includes(r.symbol))
    .map((r) => ({
    symbol: r.symbol,
    price: r.price,
    barT: r.barT,
    biasDir: r.bias.dir,
    biasConf: r.bias.conf,
    biasReason: r.bias.reason,
    biasStruct: r.bias.struct,
    biasDraw: r.bias.draw,
    scoreBuy: r.scores.buy,
    scoreSell: r.scores.sell,
    factorsBuy: r.factors.buy,
    factorsSell: r.factors.sell,
    levels: r.levels,
    qm: r.qm.status,
    qmBullActive: r.qm.bullActive,
    qmBearActive: r.qm.bearActive,
    tfAlign: r.tfAlign,
    zones: r.zones,
    atr: r.atr,
    source: r.source,
    signal: r.signal,
  }))

  analyses.sort((a, b) => Math.max(b.scoreBuy, b.scoreSell) - Math.max(a.scoreBuy, a.scoreSell))

  const recentSignals = await db.signal.findMany({ orderBy: { createdAt: 'desc' }, take: 30 })

  return NextResponse.json({ analyses, recentSignals })
}
