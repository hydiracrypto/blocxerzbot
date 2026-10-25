'use client'

// ═══════════════════════════════════════════════════════════════════════
// TRADES TAB — riwayat + statistik
// ═══════════════════════════════════════════════════════════════════════
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from '@/hooks/use-toast'
import { fmtPrice, fmtPnl, clockTime, type TradeRow } from './base'
import { History, RotateCcw } from 'lucide-react'

interface Stats {
  total: number
  wins: number
  losses: number
  winRate: number
  totalPnl: number
  bestPnl: number
  worstPnl: number
}

export function TradesTab({ trades, stats, onRefresh }: { trades: TradeRow[]; stats: Stats | null; onRefresh: () => void }) {
  const reset = async () => {
    const res = await fetch('/api/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset-paper' }),
    })
    const j = await res.json()
    toast({ title: j.message ?? 'Direset' })
    onRefresh()
  }

  const reasonColor = (r: string) =>
    r === 'SL' ? 'bg-red-500/15 text-red-400' : r === 'FLIP' ? 'bg-amber-500/15 text-amber-400' : r === 'MANUAL' ? 'bg-zinc-700 text-zinc-300' : 'bg-emerald-500/15 text-emerald-400'

  return (
    <section aria-label="Riwayat trading">
      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: 'TOTAL TRADE', value: String(stats?.total ?? 0), color: 'text-zinc-100' },
          { label: 'WIN RATE', value: (stats?.winRate ?? 0).toFixed(1) + '%', color: (stats?.winRate ?? 0) >= 50 ? 'text-emerald-400' : 'text-amber-400' },
          { label: 'WIN / LOSS', value: `${stats?.wins ?? 0} / ${stats?.losses ?? 0}`, color: 'text-zinc-100' },
          { label: 'TOTAL PnL', value: fmtPnl(stats?.totalPnl ?? 0), color: (stats?.totalPnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400' },
          { label: 'TERBAIK', value: fmtPnl(stats?.bestPnl ?? 0), color: 'text-emerald-400' },
          { label: 'TERBURUK', value: fmtPnl(stats?.worstPnl ?? 0), color: 'text-red-400' },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <div className="text-[9px] font-semibold tracking-wider text-zinc-500">{c.label}</div>
            <div className={`mt-1 font-mono text-lg font-bold ${c.color}`}>{c.value}</div>
          </div>
        ))}
      </div>

      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
          <History className="h-4 w-4 text-yellow-500" />
          RIWAYAT PENUTUPAN (partial close TP1/TP2/TP3, SL, flip)
        </div>
        <Button size="sm" variant="outline" onClick={reset} className="h-7 gap-1 border-white/15 text-[10px] text-zinc-300 hover:bg-white/5">
          <RotateCcw className="h-3 w-3" /> Reset Paper
        </Button>
      </div>

      <div className="max-h-[440px] overflow-y-auto rounded-xl border border-white/10">
        <Table>
          <TableHeader className="sticky top-0 bg-[#16120c]">
            <TableRow className="border-white/5 hover:bg-transparent">
              <TableHead className="h-9 text-[10px] text-zinc-500">WAKTU</TableHead>
              <TableHead className="h-9 text-[10px] text-zinc-500">PAIR</TableHead>
              <TableHead className="h-9 text-[10px] text-zinc-500">ARAH</TableHead>
              <TableHead className="h-9 text-right text-[10px] text-zinc-500">ENTRY → EXIT</TableHead>
              <TableHead className="h-9 text-[10px] text-zinc-500">ALASAN</TableHead>
              <TableHead className="h-9 text-right text-[10px] text-zinc-500">PnL</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {trades.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-xs text-zinc-500">
                  Belum ada trade selesai
                </TableCell>
              </TableRow>
            )}
            {trades.map((t) => (
              <TableRow key={t.id} className="border-white/5 font-mono text-[11px]">
                <TableCell className="py-2 text-[10px] text-zinc-500">{clockTime(t.closedAt)}</TableCell>
                <TableCell className="py-2 font-bold text-zinc-100">{t.symbol.replace('_USDT', '')}</TableCell>
                <TableCell className="py-2">
                  <span className={t.side === 1 ? 'text-emerald-400' : 'text-red-400'}>{t.side === 1 ? 'LONG' : 'SHORT'}</span>
                </TableCell>
                <TableCell className="py-2 text-right text-[10px] text-zinc-400">
                  {fmtPrice(t.entryPrice)} → {fmtPrice(t.exitPrice)}
                </TableCell>
                <TableCell className="py-2">
                  <Badge className={`border-0 text-[9px] font-bold ${reasonColor(t.reason)}`}>{t.reason}</Badge>
                </TableCell>
                <TableCell className={`py-2 text-right font-bold ${t.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {fmtPnl(t.pnl)}
                  <div className="text-[9px] font-normal opacity-80">{t.pnlPct >= 0 ? '+' : ''}{t.pnlPct.toFixed(1)}%</div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}
