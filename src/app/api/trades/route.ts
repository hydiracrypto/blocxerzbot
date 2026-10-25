import { NextResponse } from 'next/server'
import { ensureBoot } from '@/lib/agents/orchestrator'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  await ensureBoot()
  const trades = await db.trade.findMany({ orderBy: { closedAt: 'desc' }, take: 60 })

  const agg = await db.trade.aggregate({ _count: { id: true }, _sum: { pnl: true } })
  const wins = await db.trade.count({ where: { pnl: { gt: 0 } } })
  const losses = await db.trade.count({ where: { pnl: { lte: 0 } } })
  const best = await db.trade.aggregate({ _max: { pnl: true } })
  const worst = await db.trade.aggregate({ _min: { pnl: true } })

  const total = agg._count.id
  const winRate = total > 0 ? (wins / total) * 100 : 0

  return NextResponse.json({
    trades,
    stats: {
      total,
      wins,
      losses,
      winRate,
      totalPnl: agg._sum.pnl ?? 0,
      bestPnl: best._max.pnl ?? 0,
      worstPnl: worst._min.pnl ?? 0,
    },
  })
}
