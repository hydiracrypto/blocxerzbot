'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Wallet, TrendingUp, CalendarDays, Target, Scale, Activity, AlertTriangle, CheckCircle2 } from 'lucide-react'
import type { EngineState } from '@/lib/engine-types'
import { fmtUsd, fmtPct } from '@/lib/engine-types'
import { cn } from '@/lib/utils'

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = 'neutral',
  pulse = false,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  sub?: React.ReactNode
  tone?: 'neutral' | 'good' | 'bad' | 'warn'
  pulse?: boolean
}) {
  const toneCls = {
    neutral: 'text-zinc-100',
    good: 'text-emerald-400',
    bad: 'text-rose-400',
    warn: 'text-amber-400',
  }[tone]
  const iconCls = {
    neutral: 'bg-white/5 text-zinc-400 ring-white/10',
    good: 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/30',
    bad: 'bg-rose-500/10 text-rose-400 ring-rose-500/30',
    warn: 'bg-amber-500/10 text-amber-400 ring-amber-500/30',
  }[tone]
  return (
    <Card className="border-white/10 bg-white/[0.02] p-0">
      <CardContent className="flex items-center gap-3 p-3.5">
        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1', iconCls)}>
          <Icon className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[10.5px] font-medium uppercase tracking-wider text-zinc-500">{label}</p>
          <p className={cn('truncate font-mono text-[15px] font-bold tabular-nums', toneCls, pulse && 'animate-pulse')}>{value}</p>
          {sub && <p className="truncate text-[10.5px] text-zinc-500">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

export function KpiCards({ state }: { state: EngineState }) {
  const a = state.account
  const s = state.stats
  const r = state.risk
  const isLive = a.mode === 'LIVE'

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
      <StatCard
        icon={Wallet}
        label={isLive ? 'Ekuitas (Saldo Bursa)' : 'Ekuitas Paper'}
        value={fmtUsd(a.equity)}
        sub={isLive && a.liveBalanceUsd !== null ? `USDT bebas ${fmtUsd(a.liveBalanceUsd)}` : `awal ${fmtUsd(a.startingEquity)}`}
      />
      <StatCard
        icon={TrendingUp}
        label="PnL Total"
        value={fmtUsd(a.pnl, true)}
        tone={a.pnl >= 0 ? 'good' : 'bad'}
        sub={fmtPct(a.pnlPct, true)}
      />
      <StatCard
        icon={CalendarDays}
        label="PnL Harian"
        value={fmtUsd(r.dailyPnlUsd, true)}
        tone={r.dailyPnlUsd >= 0 ? 'good' : 'bad'}
        sub={
          r.entriesBlocked ? (
            <span className="flex items-center gap-1 text-amber-400">
              <AlertTriangle className="h-3 w-3" /> entry ditahan
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-emerald-500" /> batas -{r.dailyLossLimitPct}%
            </span>
          )
        }
      />
      <StatCard
        icon={Target}
        label="Win Rate"
        value={`${s.winRate.toFixed(1)}%`}
        sub={`${s.wins}W / ${s.losses}L · ${s.trades} trade`}
      />
      <StatCard
        icon={Scale}
        label="Profit Factor"
        value={s.profitFactor >= 99 ? '∞' : s.profitFactor.toFixed(2)}
        tone={s.profitFactor >= 1.5 ? 'good' : s.profitFactor >= 1 ? 'neutral' : 'bad'}
        sub={`ekspektasi ${fmtPct(s.expectancyPct, true)}/trade`}
      />
      <StatCard
        icon={Activity}
        label="Maks Drawdown"
        value={fmtPct(-a.maxDrawdownPct)}
        tone={a.maxDrawdownPct > 10 ? 'warn' : 'neutral'}
        sub={`eksposur ${fmtPct(r.openExposurePct)} · ${r.openPositions}/${r.maxOpenPositions} posisi`}
      />
    </div>
  )
}
