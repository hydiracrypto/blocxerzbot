'use client'

// ═══════════════════════════════════════════════════════════════════════
// 6 AGENT CARDS — status otonom real-time
// ═══════════════════════════════════════════════════════════════════════
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, Bot, CheckCircle2, Loader2, Radar, ScanLine, Scale, ShieldCheck, TrendingUp, Zap } from 'lucide-react'
import { timeAgo, type AgentStatus } from './base'

const AGENT_ICONS: Record<string, typeof Bot> = {
  A1: ScanLine,
  A2: Radar,
  A3: TrendingUp,
  A4: Scale,
  A5: Zap,
  A6: ShieldCheck,
}

export function AgentGrid({ agents }: { agents: AgentStatus[] }) {
  return (
    <section aria-label="Agent otonom" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {agents.map((a, i) => {
        const Icon = AGENT_ICONS[a.id] ?? Bot
        const isError = a.status === 'ERROR'
        const isActive = a.status === 'ACTIVE'
        return (
          <div
            key={a.id}
            className={`relative overflow-hidden rounded-xl border p-3 transition-colors ${
              isError ? 'border-red-500/40 bg-red-500/5' : 'border-white/10 bg-white/[0.03] hover:border-yellow-500/30'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`flex h-7 w-7 items-center justify-center rounded-md ${isError ? 'bg-red-500/15' : 'bg-yellow-500/10 ring-1 ring-yellow-500/30'}`}>
                  <Icon className={`h-4 w-4 ${isError ? 'text-red-400' : 'text-yellow-400'}`} />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-bold text-zinc-100">AGENT {i + 1}</div>
                  <div className="truncate text-[9px] text-zinc-500" title={a.name}>
                    {a.name}
                  </div>
                </div>
              </div>
            </div>

            <p className="mt-2 line-clamp-2 min-h-[26px] text-[10px] leading-relaxed text-zinc-400" title={a.lastAction}>
              {a.lastAction}
            </p>

            <div className="mt-2 flex items-center justify-between gap-2 border-t border-white/5 pt-2 text-[9px] font-mono text-zinc-500">
              <span className="flex shrink-0 items-center gap-1">
                {isError ? (
                  <AlertTriangle className="h-3 w-3 text-red-400" />
                ) : isActive ? (
                  <Loader2 className="h-3 w-3 animate-spin text-yellow-400" />
                ) : (
                  <CheckCircle2 className="h-3 w-3 text-zinc-500" />
                )}
                <span className={isError ? 'text-red-400' : isActive ? 'text-yellow-400' : 'text-zinc-500'}>{a.status}</span>
              </span>
              <span className="min-w-0 truncate text-right" title={`${a.ticks} tick · ${timeAgo(a.lastTickAt)}`}>
                {a.ticks} tick · {timeAgo(a.lastTickAt)}
              </span>
            </div>

            {a.errors > 0 && (
              <Badge className="absolute right-2 top-2 border-0 bg-red-500/15 text-[8px] text-red-400">{a.errors} err</Badge>
            )}
          </div>
        )
      })}
    </section>
  )
}
