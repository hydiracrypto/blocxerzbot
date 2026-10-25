'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts'
import { CandlestickChart, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import type { EngineState } from '@/lib/engine-types'
import { fmtPrice } from '@/lib/engine-types'
import { cn } from '@/lib/utils'

interface ChartDatum {
  t: number
  c: number
  e8: number
  e21: number
}

export function PriceChart({ state }: { state: EngineState }) {
  const focus = state.focusSymbol
  const base = focus.replace('USDT', '')
  const data: ChartDatum[] = useMemo(() => {
    const cs = state.candles
    const e8 = state.ema8Series
    const e21 = state.ema21Series
    return cs.map((c, i) => ({
      t: c.t,
      c: c.c,
      e8: Number.isFinite(e8[i]) ? e8[i] : null as unknown as number,
      e21: Number.isFinite(e21[i]) ? e21[i] : null as unknown as number,
    }))
  }, [state.candles, state.ema8Series, state.ema21Series])

  const sym = state.symbols.find((s) => s.id === focus)
  const lastC = data[data.length - 1]?.c ?? 0
  const firstC = data[0]?.c ?? 0
  const windowPct = firstC > 0 ? ((lastC - firstC) / firstC) * 100 : 0
  const rising = windowPct >= 0

  const yMin = useMemo(() => Math.min(...data.map((d) => d.c).filter((v) => v > 0)) * 0.9995, [data])
  const yMax = useMemo(() => Math.max(...data.map((d) => d.c).filter((v) => v > 0)) * 1.0005, [data])

  return (
    <Card className="border-white/10 bg-white/[0.02] p-0">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 p-4 pb-0">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/30">
            <CandlestickChart className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="leading-tight">
            <CardTitle className="flex items-center gap-2 text-[13px] font-bold text-zinc-100">
              {base}/USDT
              <span className="font-mono text-[11px] font-medium text-zinc-500">candle 1m real-time · Binance</span>
            </CardTitle>
            <p className="font-mono text-[10.5px] text-zinc-500">
              120 candle terakhir · EMA8 <span className="text-amber-400">▬</span> · EMA21 <span className="text-fuchsia-400">▬</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 font-mono text-[12px]">
          <span className="text-[15px] font-bold tabular-nums text-zinc-100">{fmtPrice(lastC)}</span>
          <span className={cn('flex items-center gap-1 font-semibold', rising ? 'text-emerald-400' : 'text-rose-400')}>
            {rising ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            {windowPct >= 0 ? '+' : ''}
            {windowPct.toFixed(2)}%
          </span>
          {sym && (
            <span className="hidden text-[10.5px] text-zinc-500 sm:inline">
              RSI {sym.rsi14.toFixed(0)} · ATR {sym.atrPct.toFixed(2)}%
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-3 pr-4">
        <div className="h-[240px] w-full">
          {data.length > 2 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 46, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis
                  dataKey="t"
                  tick={{ fill: '#71717a', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(t: number) =>
                    new Date(t).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
                  }
                  minTickGap={48}
                />
                <YAxis
                  domain={[yMin, yMax]}
                  tick={{ fill: '#71717a', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={0}
                  tickFormatter={(v: number) => (v >= 1000 ? v.toLocaleString('en-US') : v.toPrecision(5))}
                  orientation="right"
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
                  formatter={(value: number, name: string) => [fmtPrice(value), name === 'c' ? 'Harga' : name === 'e8' ? 'EMA 8' : 'EMA 21']}
                />
                <ReferenceLine y={lastC} stroke="rgba(16,185,129,0.35)" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="c" stroke="#10b981" strokeWidth={1.6} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="e8" stroke="#f59e0b" strokeWidth={1.1} dot={false} isAnimationActive={false} connectNulls />
                <Line type="monotone" dataKey="e21" stroke="#d946ef" strokeWidth={1.1} dot={false} isAnimationActive={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-[11px] text-zinc-600">
              <Minus className="mr-1.5 h-4 w-4" /> Memuat candle pasar real…
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
