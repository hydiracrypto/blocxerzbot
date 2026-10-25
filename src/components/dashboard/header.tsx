'use client'

import { Button } from '@/components/ui/button'
import { Play, Pause, RotateCcw, Gauge, Hexagon, Wifi, WifiOff } from 'lucide-react'
import type { EngineState } from '@/lib/engine-types'
import { fmtUsd } from '@/lib/engine-types'
import { cn } from '@/lib/utils'

interface HeaderProps {
  state: EngineState | null
  connected: boolean
  onControl: (action: 'start' | 'pause' | 'reset' | 'speed', value?: number) => void
}

function elapsedLabel(startedAt: number): string {
  const ms = Math.max(0, Date.now() - startedAt)
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}j ${String(m).padStart(2, '0')}m`
  return `${m}m ${String(sec).padStart(2, '0')}s`
}

export function Header({ state, connected, onControl }: HeaderProps) {
  const running = state?.status === 'RUNNING'
  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-zinc-950/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5 sm:px-5">
        <div className="flex items-center gap-2.5">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/40">
            <Hexagon className="h-5 w-5 text-emerald-400" strokeWidth={2.2} />
            <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5">
              {running && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              )}
              <span className={cn('relative inline-flex h-2.5 w-2.5 rounded-full', running ? 'bg-emerald-400' : 'bg-amber-400')} />
            </span>
          </div>
          <div className="leading-tight">
            <h1 className="text-[15px] font-bold tracking-tight text-zinc-50">
              NEXUS-6 <span className="font-mono text-[11px] font-medium text-emerald-400">AUTONOMOUS DESK</span>
            </h1>
            <p className="text-[11px] text-zinc-500">
              6 agent AI trading 24/7 · <span className="font-semibold text-amber-400/90">mode simulasi (paper trading)</span>
            </p>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 font-mono text-[11px] text-zinc-400">
            <span className="flex items-center gap-1.5">
              {connected ? <Wifi className="h-3.5 w-3.5 text-emerald-400" /> : <WifiOff className="h-3.5 w-3.5 text-rose-400" />}
              {connected ? 'TERHUBUNG' : 'PUTUS'}
            </span>
            <span className="hidden text-zinc-600 sm:inline">|</span>
            <span className="hidden sm:inline">tick {state?.tick ?? 0}</span>
            <span className="hidden text-zinc-600 sm:inline">|</span>
            <span className="hidden md:inline">{state ? `${state.engineVersion}` : '—'}</span>
            <span className="hidden text-zinc-600 md:inline">|</span>
            <span className="hidden md:inline">uptime {state ? elapsedLabel(state.startedAt) : '—'}</span>
          </div>

          <div
            className={cn(
              'rounded-lg px-2.5 py-1.5 font-mono text-[11px] font-bold tracking-wider ring-1',
              running
                ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/40'
                : 'bg-amber-500/10 text-amber-400 ring-amber-500/40',
            )}
          >
            {running ? (
              <span className="mr-1 inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            ) : (
              <span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-400" />
            )}
            {running ? 'LIVE' : 'PAUSED'}
          </div>

          <div className="flex items-center gap-1.5">
            {running ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onControl('pause')}
                className="h-8 border-amber-500/40 bg-amber-500/10 px-3 text-amber-300 hover:bg-amber-500/20 hover:text-amber-200"
              >
                <Pause className="mr-1 h-3.5 w-3.5" /> Jeda
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => onControl('start')}
                className="h-8 bg-emerald-500 px-3 text-zinc-950 hover:bg-emerald-400"
              >
                <Play className="mr-1 h-3.5 w-3.5" /> Jalan
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => onControl('reset')}
              className="h-8 border-white/15 bg-white/[0.03] px-3 text-zinc-300 hover:bg-white/10 hover:text-zinc-100"
            >
              <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reset
            </Button>
            <div className="flex items-center overflow-hidden rounded-lg border border-white/15">
              {[1, 2, 4].map((sp) => (
                <button
                  key={sp}
                  onClick={() => onControl('speed', sp)}
                  aria-label={`Kecepatan ${sp}x`}
                  className={cn(
                    'flex h-8 items-center gap-1 border-l border-white/10 px-2.5 font-mono text-[11px] font-semibold transition-colors first:border-l-0',
                    state?.speed === sp
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-white/[0.03] text-zinc-500 hover:bg-white/10 hover:text-zinc-300',
                  )}
                >
                  <Gauge className="h-3 w-3" />
                  {sp}x
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      {state && (
        <div className="border-t border-white/5 bg-black/30">
          <div className="mx-auto flex max-w-[1600px] items-center gap-2 overflow-x-auto px-3 py-1 font-mono text-[10.5px] text-zinc-500 sm:px-5">
            <span className="shrink-0 text-emerald-500/80">DESK</span>
            <span>·</span>
            <span className="shrink-0">ekuitas {fmtUsd(state.account.equity)}</span>
            <span>·</span>
            <span className="shrink-0">kas {fmtUsd(state.account.cash)}</span>
            <span>·</span>
            <span className="shrink-0">terpapar {fmtUsd(state.account.exposureUsd)}</span>
            <span>·</span>
            <span className="shrink-0">posisi {state.positions.length}/4</span>
            <span>·</span>
            <span className="shrink-0">rug dicegah {state.stats.rejectedRugs}</span>
            <span>·</span>
            <span className="shrink-0 text-zinc-600">ticker: {state.watchlist.slice(0, 6).map((w) => w.symbol).join(' · ')}</span>
          </div>
        </div>
      )}
    </header>
  )
}
