import { NextResponse } from 'next/server'
import { ensureBoot } from '@/lib/agents/orchestrator'
import { getSettings, getOrchState } from '@/lib/agents/state'
import { db } from '@/lib/db'
import { getLastPrice } from '@/lib/mexc/market-data'
import { closePosition } from '@/lib/agents/orchestrator'

export const dynamic = 'force-dynamic'

export async function GET() {
  await ensureBoot()
  const st = getOrchState()
  const positions = await db.position.findMany({ where: { status: 'OPEN' }, orderBy: { openedAt: 'desc' } })

  const withPnl = await Promise.all(
    positions.map(async (p) => {
      let price = st.scanRows.find((r) => r.symbol === p.symbol)?.price ?? 0
      if (!price) {
        price = await getLastPrice(p.symbol).catch(() => p.entryPrice)
      }
      const dir = p.side
      const unrealized = (price - p.entryPrice) * p.remainCoin * dir
      const pnlPct = p.margin > 0 ? ((unrealized + p.pnl) / p.margin) * 100 : 0
      const roe = p.margin > 0 ? (unrealized / (p.notional / p.leverage)) * 100 : 0
      return { ...p, currentPrice: price, unrealized, pnlPct, roe }
    })
  )

  return NextResponse.json({ positions: withPnl })
}

export async function POST(request: Request) {
  await ensureBoot()
  try {
    const body = (await request.json()) as { positionId?: string }
    if (!body.positionId) return NextResponse.json({ ok: false, message: 'positionId wajib' }, { status: 400 })
    const pos = await db.position.findUnique({ where: { id: body.positionId } })
    if (!pos || pos.status !== 'OPEN') return NextResponse.json({ ok: false, message: 'Posisi tidak ditemukan' }, { status: 404 })
    const st = getOrchState()
    const price = st.scanRows.find((r) => r.symbol === pos.symbol)?.price ?? (await getLastPrice(pos.symbol).catch(() => pos.entryPrice))
    await closePosition(pos.id, price, 'MANUAL')
    return NextResponse.json({ ok: true, message: `Posisi ${pos.symbol} ditutup manual` })
  } catch (e) {
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : 'Gagal' }, { status: 500 })
  }
}
