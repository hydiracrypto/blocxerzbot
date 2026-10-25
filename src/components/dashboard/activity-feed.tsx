'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollText } from 'lucide-react'
import type { ActivityItem, EngineState, LogLevel, MasterId } from '@/lib/engine-types'
import { cn } from '@/lib/utils'

const AGENT_LABEL: Record<MasterId, string> = {
  turtle: 'TURTLE',
  seykota: 'SEYKOTA',
  schwartz: 'SCHWARTZ',
  ptj: 'PTJ',
  bollinger: 'BOLLINGER',
  risk: 'RISK',
}

const AGENT_COLOR: Record<MasterId, string> = {
  turtle: 'text-amber-400/90',
  seykota: 'text-sky-400/90',
  schwartz: 'text-fuchsia-400/90',
  ptj: 'text-emerald-400/90',
  bollinger: 'text-violet-400/90',
  risk: 'text-rose-400/90',
}

const LEVEL_STYLE: Record<LogLevel, string> = {
  info: 'text-zinc-300',
  success: 'text-emerald-300',
  warn: 'text-amber-300',
  danger: 'text-rose-300',
  trade: 'text-zinc-100',
}

function relTime(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  return `${Math.floor(s / 3600)}j`
}

export function ActivityFeed({ state }: { state: EngineState }) {
  const items: ActivityItem[] = state.activity
  return (
    <Card className="border-white/10 bg-white/[0.02] p-0">
      <CardHeader className="flex flex-row items-center justify-between p-4 pb-2">
        <CardTitle className="flex items-center gap-2 text-[13px] font-bold text-zinc-100">
          <ScrollText className="h-4 w-4 text-emerald-400" /> Jurnal Keputusan
        </CardTitle>
        <span className="font-mono text-[10px] text-zinc-600">terbaru di atas</span>
      </CardHeader>
      <CardContent className="max-h-[420px] space-y-1 overflow-y-auto p-3 pt-0 [scrollbar-width:thin]">
        {items.length === 0 && <p className="py-8 text-center text-[11px] text-zinc-600">Menunggu aktivitas engine…</p>}
        {items.map((it) => (
          <div key={it.id} className="flex items-start gap-2 rounded-lg bg-black/25 px-2.5 py-1.5">
            <span className={cn('mt-0.5 w-[72px] shrink-0 font-mono text-[9.5px] font-bold tracking-wide', AGENT_COLOR[it.agent])}>
              {AGENT_LABEL[it.agent]}
            </span>
            <p className={cn('min-w-0 flex-1 break-words font-mono text-[10.5px] leading-relaxed', LEVEL_STYLE[it.level])}>{it.msg}</p>
            <span className="mt-0.5 shrink-0 font-mono text-[9px] text-zinc-600">{relTime(it.ts)}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
