'use client'

import { useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import type { EngineState } from '@/lib/engine-types'
import { fmtUsd, fmtPct } from '@/lib/engine-types'

export function EquityChart({ state }: { state: EngineState }) {
  const data = state.equityCurve
  const start = state.account.startingEquity
  const up = state.account.pnl >= 0

  const domain = useMemo(() => {
    if (!data.length) return ['auto', 'auto'] as [string, string]
    const min = Math.min(start, ...data.map((d) => d.e))
    const max = Math.max(start, ...data.map((d) => d.e))
    const pad = (max - min) * 0.08 || 1
    return [Math.max(0, min - pad), max + pad] as [number, number]
  }, [data, start])

  const multiple = start > 0 ? state.account.equity / start : 1

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-zinc-200">Kurva Ekuitas</h2>
          <p className="text-[11px] text-zinc-500">Compound 24/7 · modal awal {fmtUsd(start)}</p>
        </div>
        <div className="flex items-center gap-3 font-mono text-xs">
          <span className={up ? 'text-emerald-400' : 'text-rose-400'}>
            {fmtUsd(state.account.equity)} ({fmtPct(state.account.pnlPct, true)})
          </span>
          <span className="rounded bg-white/5 px-1.5 py-0.5 text-zinc-400">{multiple.toFixed(2)}x modal</span>
        </div>
      </div>
      <div className="h-56 w-full sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34d399" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#34d399" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#ffffff10" vertical={false} />
            <XAxis dataKey="t" tick={{ fill: '#71717a', fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={48} />
            <YAxis
              domain={domain}
              tick={{ fill: '#71717a', fontSize: 10, fontFamily: 'monospace' }}
              tickLine={false}
              axisLine={false}
              width={62}
              tickFormatter={(v: number) => (v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(v < 20 ? 1 : 0)}`)}
            />
            <Tooltip
              contentStyle={{
                background: '#111113',
                border: '1px solid #ffffff1a',
                borderRadius: 10,
                fontSize: 12,
                fontFamily: 'monospace',
              }}
              labelStyle={{ color: '#a1a1aa' }}
              labelFormatter={(t) => `tick ${t}`}
              formatter={(value) => [fmtUsd(Number(value)), 'Ekuitas']}
            />
            <ReferenceLine
              y={start}
              stroke="#f59e0b"
              strokeDasharray="4 4"
              strokeOpacity={0.55}
              label={{ value: `modal awal ${fmtUsd(start)}`, fill: '#b45309', fontSize: 10, position: 'insideBottomLeft' }}
            />
            <Area
              type="monotone"
              dataKey="e"
              stroke={up ? '#34d399' : '#fb7185'}
              strokeWidth={2}
              fill="url(#eqFill)"
              isAnimationActive={false}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
