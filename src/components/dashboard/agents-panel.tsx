'use client'

import type { EngineState } from '@/lib/engine-types'
import { Radar, Zap, ShieldAlert, Scale, Crosshair, NotebookPen } from 'lucide-react'
import { cn } from '@/lib/utils'

const ICONS: Record<string, React.ReactNode> = {
  radar: <Radar className="h-4 w-4" />,
  zap: <Zap className="h-4 w-4" />,
  shield: <ShieldAlert className="h-4 w-4" />,
  scale: <Scale className="h-4 w-4" />,
  crosshair: <Crosshair className="h-4 w-4" />,
  notebook: <NotebookPen className="h-4 w-4" />,
}

export function AgentsPanel({ state }: { state: EngineState }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-zinc-200">Pipeline Agent</h2>
        <span className="font-mono text-[11px] text-zinc-500">{state.agents.length} agent · otonom</span>
      </div>
      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1">
        {state.agents.map((a, i) => (
          <li key={a.id} className="relative">
            <div className="flex items-center gap-3 rounded-lg border border-white/5 bg-black/30 px-3 py-2.5">
              <div
                className={cn(
                  'relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 transition-colors',
                  a.heat > 0.25
                    ? 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/40'
                    : 'bg-white/5 text-zinc-500 ring-white/10',
                )}
              >
                {ICONS[a.icon] ?? <Radar className="h-4 w-4" />}
                {a.heat > 0.25 && (
                  <span className="absolute -right-1 -top-1 flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[12.5px] font-semibold text-zinc-200">
                    <span className="mr-1.5 font-mono text-[10px] text-zinc-600">0{i + 1}</span>
                    {a.name}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-zinc-600">{a.decisions} keputusan</span>
                </div>
                <p className="truncate text-[11px] text-zinc-500">
                  <span className="text-emerald-500/90">{a.status}</span>
                  {a.lastAction ? ` — ${a.lastAction}` : ''}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
