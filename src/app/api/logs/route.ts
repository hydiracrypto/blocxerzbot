import { NextResponse } from 'next/server'
import { ensureBoot } from '@/lib/agents/orchestrator'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  await ensureBoot()
  const url = new URL(request.url)
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 80), 200)
  const level = url.searchParams.get('level')

  const logs = await db.agentLog.findMany({
    where: level && level !== 'all' ? { level } : {},
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  return NextResponse.json({ logs })
}
