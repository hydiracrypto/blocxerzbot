'use client'

import { useState } from 'react'
import type { EngineState } from '@/lib/engine-types'
import { fmtPrice, fmtUsd, fmtPct } from '@/lib/engine-types'
import { cn } from '@/lib/utils'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Layers, History } from 'lucide-react'

export function PositionsTrades({ state }: { state: EngineState }) {
  const [tab, setTab] = useState('positions')
  return (
    <Tabs value={tab} onValueChange={setTab} className="rounded-xl border border-white/10 bg-white/[0.03]">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <TabsList className="h-8 bg-white/5 p-0.5">
          <TabsTrigger value="positions" className="h-7 gap-1.5 px-3 text-xs data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100">
            <Layers className="h-3.5 w-3.5" />
            Posisi Terbuka
            <span className="rounded bg-emerald-500/20 px-1 font-mono text-[10px] text-emerald-300">{state.positions.length}</span>
          </TabsTrigger>
          <TabsTrigger value="trades" className="h-7 gap-1.5 px-3 text-xs data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100">
            <History className="h-3.5 w-3.5" />
            Riwayat Trade
            <span className="rounded bg-white/10 px-1 font-mono text-[10px] text-zinc-400">{state.trades.length}</span>
          </TabsTrigger>
        </TabsList>
        <span className="hidden font-mono text-[10.5px] text-zinc-600 sm:block">
          exit reason: TP / STOP / TRAIL / TIME / RUG / SINYAL
        </span>
      </div>

      <TabsContent value="positions" className="m-0">
        {state.positions.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-zinc-600">Tidak ada posisi terbuka — Executor menunggu setup valid…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left">
              <thead>
                <tr className="border-b border-white/5 text-[10px] uppercase tracking-wider text-zinc-600">
                  <th className="px-3 py-2 font-medium">Pair</th>
                  <th className="px-3 py-2 text-right font-medium">Size</th>
                  <th className="px-3 py-2 text-right font-medium">Entry</th>
                  <th className="px-3 py-2 text-right font-medium">Mark</th>
                  <th className="px-3 py-2 text-right font-medium">Slip</th>
                  <th className="px-3 py-2 text-right font-medium">P&L</th>
                  <th className="px-3 py-2 text-center font-medium">Guard</th>
                  <th className="px-3 py-2 font-medium">Thesis</th>
                </tr>
              </thead>
              <tbody>
                {state.positions.map((p) => (
                  <tr key={p.id} className="border-b border-white/5 last:border-b-0 hover:bg-white/[0.02]">
                    <td className="px-3 py-2 font-mono text-[12px] font-semibold text-zinc-200">
                      {p.symbol}<span className="text-zinc-600">/{p.chain}</span>
                      <div className="text-[10px] font-normal text-zinc-600">{p.age} tick</div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[11.5px] text-zinc-300">{fmtUsd(p.sizeUsd)}</td>
                    <td className="px-3 py-2 text-right font-mono text-[11.5px] text-zinc-400">{fmtPrice(p.entryPrice)}</td>
                    <td className="px-3 py-2 text-right font-mono text-[11.5px] text-zinc-300">{fmtPrice(p.markPrice)}</td>
                    <td className="px-3 py-2 text-right font-mono text-[11.5px] text-zinc-500">{p.slippagePct.toFixed(2)}%</td>
                    <td className={cn('px-3 py-2 text-right font-mono text-[12px] font-bold', p.pnlPct >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                      {fmtPct(p.pnlPct, true)}
                      <div className="text-[10px] font-normal opacity-80">{fmtUsd(p.pnlUsd, true)}</div>
                    </td>
                    <td className="px-3 py-2 text-center font-mono text-[10.5px]">
                      <span className="text-rose-400/90">SL {p.partialTaken ? 'BE' : `-${p.stopPct.toFixed(1)}%`}</span>
                      <span className="mx-1 text-zinc-700">·</span>
                      <span className="text-emerald-400/90">TP1 +{p.tp1Pct}%</span>
                      {p.partialTaken && <div className="text-[9.5px] text-emerald-500/80">50% terjual · peak +{p.peakPnlPct.toFixed(0)}%</div>}
                    </td>
                    <td className="max-w-64 px-3 py-2">
                      <p className="truncate text-[10.5px] text-zinc-500" title={p.thesis}>{p.thesis}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </TabsContent>

      <TabsContent value="trades" className="m-0">
        {state.trades.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-zinc-600">Belum ada trade yang ditutup — win/loss ratio akan terisi otomatis.</p>
        ) : (
          <div className="max-h-[420px] overflow-y-auto">
            <table className="w-full min-w-[860px] text-left">
              <thead className="sticky top-0 z-10 bg-zinc-950/95 backdrop-blur">
                <tr className="border-b border-white/5 text-[10px] uppercase tracking-wider text-zinc-600">
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Pair</th>
                  <th className="px-3 py-2 text-right font-medium">Size</th>
                  <th className="px-3 py-2 text-right font-medium">Entry → Exit</th>
                  <th className="px-3 py-2 text-right font-medium">Slip</th>
                  <th className="px-3 py-2 text-right font-medium">P&L</th>
                  <th className="px-3 py-2 text-center font-medium">W/L</th>
                  <th className="px-3 py-2 font-medium">Alasan Exit</th>
                </tr>
              </thead>
              <tbody>
                {state.trades.map((t, i) => (
                  <tr key={t.id} className="border-b border-white/5 last:border-b-0 hover:bg-white/[0.02]">
                    <td className="px-3 py-2 font-mono text-[10.5px] text-zinc-600">{t.closedTick}</td>
                    <td className="px-3 py-2 font-mono text-[12px] font-semibold text-zinc-200">
                      {t.symbol}<span className="text-zinc-600">/{t.chain}</span>
                      <div className="text-[10px] font-normal text-zinc-600">hold {t.holdTicks} tick</div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[11.5px] text-zinc-400">{fmtUsd(t.sizeUsd)}</td>
                    <td className="px-3 py-2 text-right font-mono text-[10.5px] text-zinc-500">
                      {fmtPrice(t.entryPrice)} → {fmtPrice(t.exitPrice)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[11.5px] text-zinc-500">{t.slippagePct.toFixed(2)}%</td>
                    <td className={cn('px-3 py-2 text-right font-mono text-[12px] font-bold', t.pnlPct >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                      {fmtPct(t.pnlPct, true)}
                      <div className="text-[10px] font-normal opacity-80">{fmtUsd(t.pnlUsd, true)}</div>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={cn('inline-block rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ring-1',
                        t.win ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30' : 'bg-rose-500/10 text-rose-300 ring-rose-500/30')}>
                        {t.win ? 'WIN' : 'LOSS'}
                      </span>
                    </td>
                    <td className="max-w-56 px-3 py-2">
                      <p className="truncate text-[10.5px] text-zinc-500" title={t.reason}>{t.reason}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </TabsContent>
    </Tabs>
  )
}
