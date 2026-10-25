import { NextResponse } from 'next/server'
import { ensureBoot } from '@/lib/agents/orchestrator'
import { getSettings, saveSettings, type BotSettings } from '@/lib/agents/state'
import { validateKeys, getAccountAssets } from '@/lib/mexc/trader'

export const dynamic = 'force-dynamic'

function mask(k: string): string {
  if (!k) return ''
  if (k.length <= 8) return '••••'
  return k.slice(0, 4) + '••••••••' + k.slice(-4)
}

export async function GET() {
  await ensureBoot()
  const s = await getSettings()
  return NextResponse.json({
    ...s,
    apiKey: mask(s.apiKey),
    apiSecret: s.apiSecret ? '••••••••' : '',
    hasKeys: validateKeys({ apiKey: s.apiKey, secret: s.apiSecret }),
  })
}

export async function POST(request: Request) {
  await ensureBoot()
  try {
    const body = (await request.json()) as Record<string, unknown>
    const patch: Partial<BotSettings> = {}

    if (body.mode === 'LIVE' || body.mode === 'PAPER') patch.mode = body.mode
    if (typeof body.apiKey === 'string' && !body.apiKey.includes('••')) patch.apiKey = body.apiKey.trim()
    if (typeof body.apiSecret === 'string' && !body.apiSecret.includes('••')) patch.apiSecret = body.apiSecret.trim()
    for (const k of ['riskPct', 'leverage', 'maxPositions', 'maxWatch', 'minVolUsd', 'minScore', 'qmMinScore', 'feePct', 'maxDailyLossPct', 'paperEquity'] as const) {
      if (body[k] !== undefined && !isNaN(Number(body[k]))) {
        patch[k] = Number(body[k])
      }
    }
    if (body.tpMode === 'LADDER' || body.tpMode === 'TP3_FULL') patch.tpMode = body.tpMode
    if (typeof body.allowFlip === 'boolean') patch.allowFlip = body.allowFlip
    if (typeof body.autoRun === 'boolean') patch.autoRun = body.autoRun

    // Batas aman
    if (patch.riskPct !== undefined) patch.riskPct = Math.min(Math.max(patch.riskPct, 0.1), 10)
    if (patch.leverage !== undefined) patch.leverage = Math.min(Math.max(patch.leverage, 1), 125)
    if (patch.maxPositions !== undefined) patch.maxPositions = Math.min(Math.max(patch.maxPositions, 1), 20)
    if (patch.maxWatch !== undefined) patch.maxWatch = Math.min(Math.max(patch.maxWatch, 3), 30)
    if (patch.paperEquity !== undefined) patch.paperEquity = Math.min(Math.max(patch.paperEquity, 10), 10_000_000)

    await saveSettings(patch)
    const s = await getSettings()

    let accountCheck: { ok: boolean; message: string } | null = null
    if (patch.apiKey !== undefined || patch.apiSecret !== undefined) {
      if (validateKeys({ apiKey: s.apiKey, secret: s.apiSecret })) {
        try {
          await getAccountAssets({ apiKey: s.apiKey, secret: s.apiSecret })
          accountCheck = { ok: true, message: 'API key MEXC valid & terhubung' }
        } catch (e) {
          accountCheck = { ok: false, message: `Koneksi gagal: ${e instanceof Error ? e.message : e}` }
        }
      }
    }

    return NextResponse.json({ ok: true, settings: { ...s, apiKey: mask(s.apiKey), apiSecret: s.apiSecret ? '••••••••' : '', hasKeys: validateKeys({ apiKey: s.apiKey, secret: s.apiSecret }) }, accountCheck })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Gagal simpan' }, { status: 400 })
  }
}
