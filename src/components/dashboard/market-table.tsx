'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Radar, TrendingUp, TrendingDown, Minus, Crosshair } from 'lucide-react'
import type { EngineState, MarketSymbol, PairDecision } from '@/lib/engine-types'
import { fmtPrice, fmtPct, fmtUsd } from '@/lib/engine-types'
import { cn } from '@/lib/utils'

const MASTER_SHORT: Record<string, string> = {
  turtle: 'Dennis',
  seykota: 'Seykota',
  schwartz: 'Schwartz',
  ptj: 'PTJ',
  bollinger: 'Bollinger',
  risk: 'Risk',
}

function Sparkline({ data, up }: { data: number[]; up: boolean }) {
  const path = useMemo(() => {
    if (data.length < 2) return ''
    const min = Math.min(...data)
    const max = Math.max(...data)
    const range = max - min || 1
    return data
      .map((v, i) => `${(i / (data.length - 1)) * 56},${16 - ((v - min) / range) * 14}`)
      .join(' ')
  }, [data])
  return (
    <svg width="56" height="18" viewBox="0 0 56 18" className="overflow-visible">
      <polyline points={path} fill="none" stroke={up ? '#10b981' : '#f43f5e'} strokeWidth="1.2" />
    </svg>
  )
}

function DecisionBadge({ decision }: { decision: PairDecision }) {
  const map: Record<PairDecision, string> = {
    HOLD: 'bg-sky-500/10 text-sky-300 ring-sky-500/30',
    ENTER: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/40',
    SIGNAL: 'bg-amber-500/10 text-amber-300 ring-amber-500/40',
    EXIT: 'bg-rose-500/10 text-rose-300 ring-rose-500/40',
    WATCH: 'bg-white/5 text-zinc-400 ring-white/10',
    WAIT: 'bg-white/5 text-zinc-500 ring-white/10',
    SKIP: 'bg-white/5 text-zinc-500 ring-white/10',
  }
  return (
    <span className={cn('inline-flex rounded-md px-1.5 py-0.5 font-mono text-[9.5px] font-bold tracking-wide ring-1', map[decision])}>
      {decision}
    </span>
  )
}

export function MarketTable({ state, onFocus }: { state: EngineState; onFocus: (symbol: string) => void }) {
  return (
    <Card className="border-white/10 bg-white/[0.02] p-0">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 p-4 pb-2">
        <CardTitle className="flex items-center gap-2 text-[13px] font-bold text-zinc-100">
          <Radar className="h-4 w-4 text-emerald-400" /> Pasar Sungguhan
          <span className="font-mono text-[10px] font-normal text-zinc-500">Binance Spot · data real-time</span>
        </CardTitle>
        <span className="font-mono text-[10px] text-zinc-600">klik baris untuk fokus chart</span>
      </CardHeader>
      <CardContent className="overflow-x-auto p-2 pt-0">
        <table className="w-full min-w-[760px] border-separate border-spacing-y-1 text-left">
          <thead>
            <tr className="font-mono text-[9.5px] uppercase tracking-wider text-zinc-600">
              <th className="px-2 pb-1 font-medium">Pair</th>
              <th className="px-2 pb-1 text-right font-medium">Harga</th>
              <th className="px-2 pb-1 text-right font-medium">24 Jam</th>
              <th className="px-2 pb-1 text-right font-medium">Vol 24J</th>
              <th className="px-2 pb-1 text-right font-medium">RSI 14</th>
              <th className="px-2 pb-1 text-right font-medium">ATR %</th>
              <th className="px-2 pb-1 text-center font-medium">Tren</th>
              <th className="px-2 pb-1 font-medium">Grafik</th>
              <th className="px-2 pb-1 font-medium">Status</th>
              <th className="px-2 pb-1 font-medium">Master Aktif</th>
            </tr>
          </thead>
          <tbody>
            {state.symbols.map((s: MarketSymbol) => {
              const up = s.change24hPct >= 0
              const trendIcon =
                s.emaTrend === 'UP' ? <TrendingUp className="h-3.5 w-3.5 text-emerald-400" /> :
                s.emaTrend === 'DOWN' ? <TrendingDown className="h-3.5 w-3.5 text-rose-400" /> :
                <Minus className="h-3.5 w-3.5 text-zinc-600" />
              const focused = state.focusSymbol === s.id
              return (
                <tr
                  key={s.id}
                  onClick={() => onFocus(s.id)}
                  className={cn(
                    'cursor-pointer bg-black/25 text-[12px] transition-colors hover:bg-white/[0.06]',
                    focused && 'bg-emerald-500/[0.07] ring-1 ring-inset ring-emerald-500/25',
                  )}
                >
                  <td className="rounded-l-lg px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                      {focused && <Crosshair className="h-3 w-3 text-emerald-400" />}
                      <span className="font-bold text-zinc-100">{s.base}</span>
                      <span className="font-mono text-[10px] text-zinc-600">/USDT</span>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono font-semibold tabular-nums text-zinc-100">{fmtPrice(s.price)}</td>
                  <td className={cn('px-2 py-1.5 text-right font-mono font-semibold tabular-nums', up ? 'text-emerald-400' : 'text-rose-400')}>
                    {fmtPct(s.change24hPct, true)}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-[10.5px] tabular-nums text-zinc-400">{fmtUsd(s.vol24hUsd)}</td>
                  <td className={cn('px-2 py-1.5 text-right font-mono tabular-nums', s.rsi14 > 70 ? 'text-rose-400' : s.rsi14 < 30 ? 'text-emerald-400' : 'text-zinc-400')}>
                    {s.rsi14.toFixed(0)}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums text-zinc-400">{s.atrPct.toFixed(2)}</td>
                  <td className="px-2 py-1.5 text-center">{trendIcon}</td>
                  <td className="px-2 py-1.5">
                    <Sparkline data={s.sparkline} up={(s.sparkline[s.sparkline.length - 1] ?? 0) >= (s.sparkline[0] ?? 0)} />
                  </td>
                  <td className="px-2 py-1.5">
                    <DecisionBadge decision={s.decision} />
                  </td>
                  <td className="rounded-r-lg px-2 py-1.5">
                    {s.mastersActive.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {s.mastersActive.map((m) => (
                          <span key={m} className="rounded bg-emerald-500/15 px-1 py-0.5 font-mono text-[9px] font-bold text-emerald-300">
                            {MASTER_SHORT[m] ?? m}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="font-mono text-[10px] text-zinc-700">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}
