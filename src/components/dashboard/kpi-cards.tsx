'use client'

import type { EngineState } from '@/lib/engine-types'
import { fmtUsd, fmtPct } from '@/lib/engine-types'
import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown, Target, Scale, ArrowDownWideNarrow, Waves } from 'lucide-react'

function Card({
  label,
  value,
  sub,
  icon,
  tone = 'default',
}: {
  label: string
  value: string
  sub?: string
  icon: React.ReactNode
  tone?: 'default' | 'up' | 'down' | 'accent'
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10.5px] font-medium uppercase tracking-wider text-zinc-500">{label}</span>
        <span
          className={cn(
            'flex h-6 w-6 items-center justify-center rounded-md',
            tone === 'up' && 'bg-emerald-500/10 text-emerald-400',
            tone === 'down' && 'bg-rose-500/10 text-rose-400',
            tone === 'accent' && 'bg-amber-500/10 text-amber-400',
            tone === 'default' && 'bg-white/5 text-zinc-400',
          )}
        >
          {icon}
        </span>
      </div>
      <div
        className={cn(
          'mt-1.5 font-mono text-lg font-bold leading-none tracking-tight sm:text-xl',
          tone === 'up' && 'text-emerald-400',
          tone === 'down' && 'text-rose-400',
          tone === 'accent' && 'text-amber-300',
          tone === 'default' && 'text-zinc-100',
        )}
      >
        {value}
      </div>
      {sub && <div className="mt-1 truncate text-[11px] text-zinc-500">{sub}</div>}
    </div>
  )
}

export function KpiCards({ state }: { state: EngineState }) {
  const { account, stats } = state
  const pnlUp = account.pnl >= 0
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
      <Card
        label="Ekuitas"
        value={fmtUsd(account.equity)}
        sub={`modal awal ${fmtUsd(account.startingEquity)} · kas ${fmtUsd(account.cash)}`}
        icon={<Waves className="h-3.5 w-3.5" />}
        tone="default"
      />
      <Card
        label="Total P&L"
        value={fmtPct(account.pnlPct, true)}
        sub={`${pnlUp ? '+' : '-'}${fmtUsd(Math.abs(account.pnl)).replace('$', '$')}`}
        icon={pnlUp ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
        tone={pnlUp ? 'up' : 'down'}
      />
      <Card
        label="Win Rate"
        value={stats.trades > 0 ? `${stats.winRate.toFixed(1)}%` : '—'}
        sub={`${stats.wins}W / ${stats.losses}L dari ${stats.trades} trade`}
        icon={<Target className="h-3.5 w-3.5" />}
        tone={stats.trades > 0 && stats.winRate >= 50 ? 'up' : 'default'}
      />
      <Card
        label="Profit Factor"
        value={stats.profitFactor > 0 ? stats.profitFactor.toFixed(2) : '—'}
        sub={`ekspektasi ${fmtPct(stats.expectancyPct, true)}/trade`}
        icon={<Scale className="h-3.5 w-3.5" />}
        tone="accent"
      />
      <Card
        label="Avg Slippage"
        value={stats.trades > 0 ? `${stats.avgSlippagePct.toFixed(2)}%` : '—'}
        sub={`terbaik ${fmtPct(stats.bestTradePct, true)} · terburuk ${fmtPct(stats.worstTradePct, true)}`}
        icon={<Waves className="h-3.5 w-3.5" />}
        tone="default"
      />
      <Card
        label="Max Drawdown"
        value={fmtPct(account.maxDrawdownPct)}
        sub={`puncak ${fmtUsd(account.peakEquity)} · rug dicegah ${stats.rejectedRugs}`}
        icon={<ArrowDownWideNarrow className="h-3.5 w-3.5" />}
        tone={account.maxDrawdownPct > 15 ? 'down' : 'default'}
      />
    </div>
  )
}

export function StreakBadge({ state }: { state: EngineState }) {
  const { streak } = state.stats
  if (streak === 0) return null
  const hot = streak >= 3
  const cold = streak <= -3
  if (!hot && !cold) return null
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] font-semibold ring-1',
        hot ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30' : 'bg-rose-500/10 text-rose-300 ring-rose-500/30',
      )}
    >
      {hot ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      streak {streak > 0 ? `+${streak} WIN` : `${streak} LOSS`}
    </div>
  )
}
