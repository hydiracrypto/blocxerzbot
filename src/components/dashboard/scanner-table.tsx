'use client'

import type { EngineState, WatchPair, PairDecision } from '@/lib/engine-types'
import { fmtPrice } from '@/lib/engine-types'
import { cn } from '@/lib/utils'
import { Lock, Unlock, ShieldCheck, ShieldX, Bot } from 'lucide-react'
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip'

const DECISION_CLS: Record<PairDecision, string> = {
  WAIT: 'bg-white/5 text-zinc-400 ring-white/10',
  ANALYZING: 'bg-amber-500/10 text-amber-300 ring-amber-500/30',
  SKIP: 'bg-amber-500/10 text-amber-300 ring-amber-500/30',
  REJECT: 'bg-rose-500/10 text-rose-300 ring-rose-500/30',
  ENTER: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/40',
  HOLD: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30',
}

function RugBadge({ pair }: { pair: WatchPair }) {
  const s = pair.rugScore
  const cls =
    s == null ? 'bg-white/5 text-zinc-500 ring-white/10'
    : s < 35 ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30'
    : s < 55 ? 'bg-amber-500/10 text-amber-300 ring-amber-500/30'
    : 'bg-rose-500/10 text-rose-300 ring-rose-500/30'
  return (
    <TooltipProvider delayDuration={80}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn('inline-flex cursor-help items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10.5px] font-bold ring-1', cls)}>
            {s == null ? '—' : `${s}/100`}
          </span>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-64 border-white/10 bg-zinc-900 font-mono text-[10.5px] text-zinc-200">
          <div className="mb-1 font-bold">Rug Guard · {pair.symbol}</div>
          <ul className="space-y-0.5">
            <li>{pair.rugChecks.honeypot ? '✗ honeypot terdeteksi' : '✓ honeypot aman'}</li>
            <li className="flex items-center gap-1">
              {pair.rugChecks.lpLocked ? <Lock className="h-3 w-3 text-emerald-400" /> : <Unlock className="h-3 w-3 text-rose-400" />}
              {pair.rugChecks.lpLocked ? 'LP terkunci' : 'LP tidak terkunci'}
            </li>
            <li>{pair.rugChecks.renounced ? '✓ kontrak renounced' : '✗ kontrak belum renounced'}</li>
            <li>{pair.rugChecks.mintDisabled ? '✓ mint disabled' : '✗ mint aktif'}</li>
            <li>top10 holder {pair.rugChecks.top10Pct.toFixed(0)}% · {pair.rugChecks.holders} holder</li>
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function ScannerTable({ state }: { state: EngineState }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-200">Pair Scanner · Rug Check</h2>
          <p className="text-[11px] text-zinc-500">Kandidat live — hover skor risiko untuk detail audit</p>
        </div>
        <Bot className="h-4 w-4 text-zinc-600" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left">
          <thead>
            <tr className="border-b border-white/5 text-[10px] uppercase tracking-wider text-zinc-600">
              <th className="px-3 py-2 font-medium">Pair</th>
              <th className="px-3 py-2 font-medium">Harga</th>
              <th className="px-3 py-2 text-right font-medium">Δ Harga</th>
              <th className="px-3 py-2 text-right font-medium">Vol Spike</th>
              <th className="px-3 py-2 text-right font-medium">Liq</th>
              <th className="px-3 py-2 text-center font-medium">Rug Check</th>
              <th className="px-3 py-2 font-medium">Keputusan</th>
            </tr>
          </thead>
          <tbody>
            {state.watchlist.map((p) => (
              <tr key={p.id} className="border-b border-white/5 last:border-b-0 hover:bg-white/[0.02]">
                <td className="px-3 py-2">
                  <div className="font-mono text-[12px] font-semibold text-zinc-200">{p.symbol}<span className="text-zinc-600">/{p.chain}</span></div>
                  <div className="text-[10px] text-zinc-600">umur {p.age} tick · {p.phase}</div>
                </td>
                <td className="px-3 py-2 font-mono text-[11.5px] text-zinc-300">{fmtPrice(p.price)}</td>
                <td className={cn('px-3 py-2 text-right font-mono text-[11.5px]', p.changePct >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                  {p.changePct >= 0 ? '+' : ''}{p.changePct.toFixed(1)}%
                </td>
                <td className={cn('px-3 py-2 text-right font-mono text-[11.5px]', p.spikePct > 150 ? 'font-bold text-amber-300' : p.spikePct > 40 ? 'text-amber-400/90' : 'text-zinc-500')}>
                  {p.spikePct > 5 ? `+${p.spikePct.toFixed(0)}%` : '—'}
                  {p.z >= 2 && <span className="ml-1 text-[9.5px] text-zinc-600">z{p.z.toFixed(1)}</span>}
                </td>
                <td className="px-3 py-2 text-right font-mono text-[11.5px] text-zinc-400">${(p.liquidity / 1000).toFixed(0)}k</td>
                <td className="px-3 py-2 text-center">
                  <RugBadge pair={p} />
                </td>
                <td className="px-3 py-2">
                  <span className={cn('inline-block rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ring-1', DECISION_CLS[p.decision])}>
                    {p.decision}
                  </span>
                  <div className="mt-0.5 max-w-56 truncate text-[10px] text-zinc-600" title={p.reason}>{p.reason}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2 border-t border-white/5 px-3 py-2 text-[10.5px] text-zinc-600">
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-500/70" />
        Setup dengan skor risiko tinggi ditolak Rug Guard sebelum dieksekusi
        <ShieldX className="h-3.5 w-3.5 text-rose-500/70" />
      </div>
    </div>
  )
}
