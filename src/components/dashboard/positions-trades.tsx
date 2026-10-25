'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Briefcase, History, CircleDollarSign } from 'lucide-react'
import type { EngineState, PositionView, TradeView } from '@/lib/engine-types'
import { fmtPrice, fmtPct, fmtUsd } from '@/lib/engine-types'
import { cn } from '@/lib/utils'

const MASTER_NAME: Record<string, string> = {
  turtle: 'Dennis · Turtle',
  seykota: 'Seykota · Trend',
  schwartz: 'Schwartz · Momentum',
  ptj: 'PTJ · Macro',
  bollinger: 'Bollinger · Reversion',
  risk: 'Risk Manager',
}

function ModeBadge({ mode }: { mode: string }) {
  return (
    <span
      className={cn(
        'rounded px-1 py-0.5 font-mono text-[9px] font-bold tracking-wide',
        mode === 'LIVE' ? 'bg-fuchsia-500/15 text-fuchsia-300' : 'bg-sky-500/15 text-sky-300',
      )}
    >
      {mode}
    </span>
  )
}

function PositionsTable({ state }: { state: EngineState }) {
  const rows = state.positions
  if (rows.length === 0) {
    return (
      <div className="flex h-32 flex-col items-center justify-center gap-1.5 text-zinc-600">
        <Briefcase className="h-5 w-5" />
        <p className="text-[11.5px]">Belum ada posisi terbuka — master sedang menunggu setup valid di pasar real</p>
      </div>
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-left text-[12px]">
        <thead>
          <tr className="border-b border-white/5 font-mono text-[9.5px] uppercase tracking-wider text-zinc-600">
            <th className="px-2 pb-1.5 font-medium">Pair</th>
            <th className="px-2 pb-1.5 font-medium">Strategi</th>
            <th className="px-2 pb-1.5 font-medium">Mode</th>
            <th className="px-2 pb-1.5 text-right font-medium">Ukuran</th>
            <th className="px-2 pb-1.5 text-right font-medium">Entry</th>
            <th className="px-2 pb-1.5 text-right font-medium">Mark</th>
            <th className="px-2 pb-1.5 text-right font-medium">SL / TP</th>
            <th className="px-2 pb-1.5 text-right font-medium">PnL</th>
            <th className="px-2 pb-1.5 text-right font-medium">Umur</th>
          </tr>
        </thead>
        <tbody>
          <TooltipProvider delayDuration={200}>
            {rows.map((p: PositionView) => (
              <tr key={p.id} className="border-b border-white/5 transition-colors hover:bg-white/[0.04]">
                <td className="px-2 py-2 font-bold text-zinc-100">{p.base}</td>
                <td className="px-2 py-2">
                  <span className="font-medium text-zinc-300">{MASTER_NAME[p.strategy] ?? p.strategy}</span>
                </td>
                <td className="px-2 py-2">
                  <ModeBadge mode={p.mode} />
                </td>
                <td className="px-2 py-2 text-right font-mono tabular-nums text-zinc-300">{fmtUsd(p.sizeUsd)}</td>
                <td className="px-2 py-2 text-right font-mono tabular-nums text-zinc-300">{fmtPrice(p.entryPrice)}</td>
                <td className="px-2 py-2 text-right font-mono tabular-nums text-zinc-100">{fmtPrice(p.markPrice)}</td>
                <td className="px-2 py-2 text-right font-mono text-[10.5px] tabular-nums">
                  <span className="text-rose-400/90">{fmtPrice(p.stopPrice)}</span>
                  <span className="text-zinc-700"> / </span>
                  <span className="text-emerald-400/90">{fmtPrice(p.takeProfitPrice)}</span>
                </td>
                <td className="px-2 py-2 text-right">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className={cn('cursor-help font-mono font-bold tabular-nums', p.pnlUsd >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                        {fmtPct(p.pnlPct, true)}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[280px] text-[11px]">
                      <p className="font-mono">
                        {fmtUsd(p.pnlUsd, true)} · puncak {fmtPct(p.peakPnlPct, true)}
                      </p>
                      <p className="mt-1 text-zinc-400">{p.thesis}</p>
                    </TooltipContent>
                  </Tooltip>
                </td>
                <td className="px-2 py-2 text-right font-mono text-[10.5px] tabular-nums text-zinc-500">{p.ageMin}m</td>
              </tr>
            ))}
          </TooltipProvider>
        </tbody>
      </table>
    </div>
  )
}

function TradesTable({ state }: { state: EngineState }) {
  const rows = state.trades
  if (rows.length === 0) {
    return (
      <div className="flex h-32 flex-col items-center justify-center gap-1.5 text-zinc-600">
        <History className="h-5 w-5" />
        <p className="text-[11.5px]">Riwayat trade masih kosong — menunggu posisi ditutup</p>
      </div>
    )
  }
  return (
    <div className="max-h-[340px] overflow-auto [scrollbar-width:thin]">
      <table className="w-full min-w-[860px] text-left text-[12px]">
        <thead className="sticky top-0 z-10 bg-zinc-950">
          <tr className="border-b border-white/5 font-mono text-[9.5px] uppercase tracking-wider text-zinc-600">
            <th className="px-2 pb-1.5 font-medium">Pair</th>
            <th className="px-2 pb-1.5 font-medium">Strategi</th>
            <th className="px-2 pb-1.5 font-medium">Mode</th>
            <th className="px-2 pb-1.5 text-right font-medium">Entry → Exit</th>
            <th className="px-2 pb-1.5 text-right font-medium">PnL</th>
            <th className="px-2 pb-1.5 text-right font-medium">PnL $</th>
            <th className="px-2 pb-1.5 font-medium">Alasan Exit</th>
            <th className="px-2 pb-1.5 text-right font-medium">Hold</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t: TradeView) => (
            <tr key={t.id} className="border-b border-white/5 transition-colors hover:bg-white/[0.04]">
              <td className="px-2 py-2 font-bold text-zinc-100">
                {t.symbol.replace('USDT', '')}
              </td>
              <td className="px-2 py-2 text-zinc-300">{MASTER_NAME[t.strategy] ?? t.strategy}</td>
              <td className="px-2 py-2">
                <ModeBadge mode={t.mode} />
              </td>
              <td className="px-2 py-2 text-right font-mono text-[10.5px] tabular-nums text-zinc-400">
                {fmtPrice(t.entryPrice)} → {fmtPrice(t.exitPrice)}
              </td>
              <td className={cn('px-2 py-2 text-right font-mono font-bold tabular-nums', t.win ? 'text-emerald-400' : 'text-rose-400')}>
                {fmtPct(t.pnlPct, true)}
              </td>
              <td className={cn('px-2 py-2 text-right font-mono tabular-nums', t.win ? 'text-emerald-400/80' : 'text-rose-400/80')}>
                {fmtUsd(t.pnlUsd, true)}
              </td>
              <td className="max-w-[240px] truncate px-2 py-2 text-[11px] text-zinc-400" title={t.reason}>
                {t.reason}
              </td>
              <td className="px-2 py-2 text-right font-mono text-[10.5px] tabular-nums text-zinc-500">{t.holdMin}m</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function PositionsTrades({ state }: { state: EngineState }) {
  const totalPnl = state.trades.reduce((a, t) => a + t.pnlUsd, 0)
  return (
    <Card className="border-white/10 bg-white/[0.02] p-0">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-[13px] font-bold text-zinc-100">
          <CircleDollarSign className="h-4 w-4 text-emerald-400" /> Posisi & Riwayat
          <span className="ml-2 flex items-center gap-1.5 font-mono text-[10.5px] font-normal text-zinc-500">
            {state.trades.length} trade selesai · total realized{' '}
            <span className={totalPnl >= 0 ? 'font-bold text-emerald-400' : 'font-bold text-rose-400'}>{fmtUsd(totalPnl, true)}</span>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-2 pt-0">
        <Tabs defaultValue="positions">
          <TabsList className="mb-2 h-8 bg-white/5">
            <TabsTrigger value="positions" className="h-6 px-3 text-[11.5px]">
              Posisi Terbuka ({state.positions.length})
            </TabsTrigger>
            <TabsTrigger value="trades" className="h-6 px-3 text-[11.5px]">
              Riwayat Trade ({state.trades.length})
            </TabsTrigger>
          </TabsList>
          <TabsContent value="positions" className="mt-0">
            <PositionsTable state={state} />
          </TabsContent>
          <TabsContent value="trades" className="mt-0">
            <TradesTable state={state} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
