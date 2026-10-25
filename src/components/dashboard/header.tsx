'use client'

import { Button } from '@/components/ui/button'
import { Play, Pause, RotateCcw, Settings, TrendingUp, Wifi, WifiOff, Radio, ShieldAlert } from 'lucide-react'
import type { EngineState } from '@/lib/engine-types'
import { fmtUsd, fmtPct } from '@/lib/engine-types'
import { cn } from '@/lib/utils'

interface HeaderProps {
  state: EngineState | null
  connected: boolean
  onControl: (action: 'start' | 'pause' | 'reset', value?: number) => void
  onOpenSettings: () => void
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

export function Header({ state, connected, onControl, onOpenSettings }: HeaderProps) {
  const running = state?.status === 'RUNNING'
  const ws = state?.marketWs
  const isLive = state?.settings.mode === 'LIVE'
  const blocked = state?.risk.entriesBlocked

  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-zinc-950/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5 sm:px-5">
        <div className="flex items-center gap-2.5">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/40">
            <TrendingUp className="h-5 w-5 text-emerald-400" strokeWidth={2.4} />
            <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5">
              {running && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              )}
              <span className={cn('relative inline-flex h-2.5 w-2.5 rounded-full', running ? 'bg-emerald-400' : 'bg-amber-400')} />
            </span>
          </div>
          <div className="leading-tight">
            <h1 className="text-[15px] font-bold tracking-tight text-zinc-50">
              APEX-5 <span className="font-mono text-[11px] font-medium text-emerald-400">REAL MARKET DESK</span>
            </h1>
            <p className="text-[11px] text-zinc-500">
              Pasar sungguhan Binance Spot · 5 master strategi dunia + Risk Manager
            </p>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* koneksi pasar real */}
          <div
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-mono text-[11px] font-bold tracking-wider ring-1',
              ws === 'CONNECTED'
                ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/40'
                : 'bg-rose-500/10 text-rose-400 ring-rose-500/40',
            )}
          >
            <Radio className="h-3.5 w-3.5" />
            {ws === 'CONNECTED' ? 'BINANCE LIVE' : 'PASAR PUTUS'}
          </div>

          {/* mode eksekusi */}
          <div
            className={cn(
              'rounded-lg px-2.5 py-1.5 font-mono text-[11px] font-bold tracking-wider ring-1',
              isLive ? 'bg-fuchsia-500/10 text-fuchsia-300 ring-fuchsia-500/40' : 'bg-sky-500/10 text-sky-300 ring-sky-500/40',
            )}
          >
            MODE {isLive ? 'LIVE' : 'PAPER'}
          </div>

          {/* status risk */}
          {blocked && (
            <div className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5 font-mono text-[11px] font-bold text-amber-300 ring-1 ring-amber-500/40">
              <ShieldAlert className="h-3.5 w-3.5" /> ENTRY DITAHAN
            </div>
          )}

          <div
            className={cn(
              'rounded-lg px-2.5 py-1.5 font-mono text-[11px] font-bold tracking-wider ring-1',
              running ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/40' : 'bg-amber-500/10 text-amber-400 ring-amber-500/40',
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
            <Button
              size="sm"
              variant="outline"
              onClick={onOpenSettings}
              className="h-8 border-white/15 bg-white/[0.03] px-3 text-zinc-300 hover:bg-white/10 hover:text-zinc-100"
            >
              <Settings className="mr-1 h-3.5 w-3.5" /> Pengaturan
            </Button>
          </div>

          <div className="hidden items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 font-mono text-[11px] text-zinc-400 xl:flex">
            <span className="flex items-center gap-1.5">
              {connected ? <Wifi className="h-3.5 w-3.5 text-emerald-400" /> : <WifiOff className="h-3.5 w-3.5 text-rose-400" />}
              {connected ? 'ENGINE' : 'PUTUS'}
            </span>
            <span className="text-zinc-600">|</span>
            <span>{state ? state.engineVersion.split(' ')[0] : '—'}</span>
            <span className="text-zinc-600">|</span>
            <span>uptime {state ? elapsedLabel(state.startedAt) : '—'}</span>
          </div>
        </div>
      </div>

      {state && (
        <div className="border-t border-white/5 bg-black/30">
          <div className="mx-auto flex max-w-[1600px] items-center gap-2 overflow-x-auto px-3 py-1 font-mono text-[10.5px] text-zinc-500 sm:px-5">
            <span className="shrink-0 text-emerald-500/80">REAL MARKET</span>
            <span>·</span>
            <span className="shrink-0">ekuitas {fmtUsd(state.account.equity)}</span>
            <span>·</span>
            <span className={cn('shrink-0', state.account.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
              PnL {fmtUsd(state.account.pnl, true)} ({fmtPct(state.account.pnlPct, true)})
            </span>
            <span>·</span>
            <span className="shrink-0">kas {fmtUsd(state.account.cash)}</span>
            <span>·</span>
            <span className="shrink-0">terpapar {fmtUsd(state.account.exposureUsd)}</span>
            <span>·</span>
            <span className="shrink-0">
              posisi {state.positions.length}/{state.settings.maxOpenPositions}
            </span>
            <span>·</span>
            <span className="shrink-0">PnL harian {fmtPct(state.risk.dailyPnlPct, true)}</span>
            <span>·</span>
            <span className="shrink-0 text-zinc-600">
              {state.symbols.map((s) => s.base).join(' · ')}
            </span>
          </div>
        </div>
      )}
    </header>
  )
}
