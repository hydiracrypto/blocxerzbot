'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Turtle, Waves, Rocket, Landmark, Activity, Shield, Users } from 'lucide-react'
import type { EngineState, MasterId } from '@/lib/engine-types'
import { fmtUsd, fmtPct } from '@/lib/engine-types'
import { cn } from '@/lib/utils'

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  turtle: Turtle,
  waves: Waves,
  rocket: Rocket,
  landmark: Landmark,
  activity: Activity,
  shield: Shield,
}

const ACCENT: Record<MasterId, string> = {
  turtle: 'bg-amber-500/10 text-amber-400 ring-amber-500/30',
  seykota: 'bg-sky-500/10 text-sky-400 ring-sky-500/30',
  schwartz: 'bg-fuchsia-500/10 text-fuchsia-400 ring-fuchsia-500/30',
  ptj: 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/30',
  bollinger: 'bg-violet-500/10 text-violet-400 ring-violet-500/30',
  risk: 'bg-rose-500/10 text-rose-400 ring-rose-500/30',
}

export function MastersPanel({ state }: { state: EngineState }) {
  return (
    <Card className="border-white/10 bg-white/[0.02] p-0">
      <CardHeader className="flex flex-row items-center justify-between p-4 pb-2">
        <CardTitle className="flex items-center gap-2 text-[13px] font-bold text-zinc-100">
          <Users className="h-4 w-4 text-emerald-400" /> Master Strategi
        </CardTitle>
        <span className="font-mono text-[10px] text-zinc-600">trader legendaris dunia</span>
      </CardHeader>
      <CardContent className="max-h-[420px] space-y-2 overflow-y-auto p-3 pt-0 [scrollbar-width:thin]">
        {state.masters.map((m) => {
          const Icon = ICONS[m.icon] ?? Activity
          const hot = m.heat > 0.25
          return (
            <div
              key={m.id}
              className={cn(
                'rounded-xl border border-white/5 bg-black/30 p-2.5 transition-colors',
                hot && 'border-white/15 bg-black/45',
              )}
            >
              <div className="flex items-center gap-2.5">
                <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1', ACCENT[m.id])}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-[12.5px] font-bold text-zinc-100">{m.trader}</p>
                    {m.id === 'risk' ? (
                      <Badge variant="outline" className="h-4 border-rose-500/40 px-1 text-[9px] text-rose-300">
                        GUARD
                      </Badge>
                    ) : null}
                    {m.openPositions > 0 && (
                      <Badge className="h-4 bg-emerald-500/15 px-1 text-[9px] text-emerald-300 hover:bg-emerald-500/15">
                        {m.openPositions} posisi
                      </Badge>
                    )}
                    <span className={cn('ml-auto h-1.5 w-1.5 shrink-0 rounded-full', hot ? 'animate-pulse bg-emerald-400' : 'bg-zinc-700')} />
                  </div>
                  <p className="truncate text-[10.5px] text-zinc-500">
                    <span className="text-zinc-400">{m.name}</span> · {m.role}
                  </p>
                </div>
              </div>
              {m.id !== 'risk' ? (
                <div className="mt-1.5 grid grid-cols-4 gap-1 border-t border-white/5 pt-1.5 text-center font-mono text-[10px]">
                  <div>
                    <p className="text-zinc-600">trade</p>
                    <p className="font-bold text-zinc-300">{m.trades}</p>
                  </div>
                  <div>
                    <p className="text-zinc-600">win</p>
                    <p className={cn('font-bold', m.winRate >= 50 ? 'text-emerald-400' : 'text-zinc-300')}>
                      {m.trades ? `${m.winRate.toFixed(0)}%` : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-zinc-600">PnL</p>
                    <p className={cn('font-bold', m.pnlUsd > 0 ? 'text-emerald-400' : m.pnlUsd < 0 ? 'text-rose-400' : 'text-zinc-400')}>
                      {m.pnlUsd === 0 ? '—' : fmtUsd(m.pnlUsd, true)}
                    </p>
                  </div>
                  <div>
                    <p className="text-zinc-600">keputusan</p>
                    <p className="font-bold text-zinc-300">{m.decisions}</p>
                  </div>
                </div>
              ) : (
                <div className="mt-1.5 border-t border-white/5 pt-1.5">
                  <p className={cn('truncate font-mono text-[10px]', state.risk.entriesBlocked ? 'text-amber-400' : 'text-zinc-500')}>
                    {state.risk.entriesBlocked ? state.risk.blockReason : `Risiko ≤${m.role.split('≤')[1] ?? '2%'}/trade · loss harian ${state.risk.dailyPnlPct.toFixed(2)}%`}
                  </p>
                </div>
              )}
              <p className={cn('mt-1 truncate font-mono text-[10px]', hot ? 'text-zinc-300' : 'text-zinc-600')}>
                ▸ {m.lastAction}
              </p>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
