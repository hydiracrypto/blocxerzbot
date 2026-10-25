'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { LineChart as LineChartIcon } from 'lucide-react'
import type { EngineState } from '@/lib/engine-types'
import { fmtUsd, fmtPct } from '@/lib/engine-types'

export function EquityChart({ state }: { state: EngineState }) {
  const data = state.equityCurve.map((p) => ({ t: p.t, e: p.e }))
  const first = data[0]?.e ?? state.account.startingEquity
  const last = data[data.length - 1]?.e ?? state.account.startingEquity
  const gain = last >= first

  return (
    <Card className="border-white/10 bg-white/[0.02] p-0">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 p-4 pb-0">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/30">
            <LineChartIcon className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="leading-tight">
            <CardTitle className="text-[13px] font-bold text-zinc-100">Kurva Ekuitas</CardTitle>
            <p className="font-mono text-[10.5px] text-zinc-500">
              {data.length > 1 ? `${data.length} titik · penyimpanan otomatis tiap 60s` : 'menunggu data…'}
            </p>
          </div>
        </div>
        <div className="font-mono text-[12px]">
          <span className="text-[15px] font-bold tabular-nums text-zinc-100">{fmtUsd(last)}</span>{' '}
          <span className={gain ? 'font-semibold text-emerald-400' : 'font-semibold text-rose-400'}>
            {fmtPct(first > 0 ? ((last - first) / first) * 100 : 0, true)}
          </span>
        </div>
      </CardHeader>
      <CardContent className="p-3 pr-4">
        <div className="h-[220px] w-full">
          {data.length > 2 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis
                  dataKey="t"
                  tick={{ fill: '#71717a', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(t: number) => new Date(t).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                  minTickGap={52}
                />
                <YAxis
                  tick={{ fill: '#71717a', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                  domain={['auto', 'auto']}
                  tickFormatter={(v: number) => `$${v >= 1000 ? v.toLocaleString('en-US') : v.toFixed(0)}`}
                />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(9,9,11,0.95)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 10,
                    fontSize: 11,
                  }}
                  labelStyle={{ color: '#a1a1aa' }}
                  labelFormatter={(t) => new Date(t).toLocaleTimeString('id-ID')}
                  formatter={(value: number) => [fmtUsd(value), 'Ekuitas']}
                />
                <Area type="monotone" dataKey="e" stroke="#10b981" strokeWidth={1.8} fill="url(#eqFill)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-[11px] text-zinc-600">Kurva ekuitas sedang terbentuk…</div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
