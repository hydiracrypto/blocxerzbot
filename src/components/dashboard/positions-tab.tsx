'use client'

// ═══════════════════════════════════════════════════════════════════════
// POSITIONS TAB — posisi terbuka + PnL live + close manual
// ═══════════════════════════════════════════════════════════════════════
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from '@/hooks/use-toast'
import { fmtPrice, fmtPnl, type PositionRow } from './base'
import { Crosshair, X } from 'lucide-react'

export function PositionsTab({ positions, onRefresh }: { positions: PositionRow[]; onRefresh: () => void }) {
  const [closing, setClosing] = useState<string | null>(null)

  const closePos = async (id: string) => {
    setClosing(id)
    try {
      const res = await fetch('/api/positions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positionId: id }),
      })
      const j = await res.json()
      toast({ title: j.ok ? 'Posisi ditutup' : 'Gagal', description: j.message })
      onRefresh()
    } finally {
      setClosing(null)
    }
  }

  return (
    <section aria-label="Posisi terbuka">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-zinc-300">
        <Crosshair className="h-4 w-4 text-emerald-400" />
        POSISI TERBUKA ({positions.length}) · Long & Short otomatis sesuai indikator
      </div>
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <Table>
          <TableHeader>
            <TableRow className="border-white/5 hover:bg-transparent">
              <TableHead className="h-9 text-[10px] text-zinc-500">PAIR</TableHead>
              <TableHead className="h-9 text-[10px] text-zinc-500">ARAH</TableHead>
              <TableHead className="h-9 text-right text-[10px] text-zinc-500">QTY</TableHead>
              <TableHead className="h-9 text-right text-[10px] text-zinc-500">ENTRY</TableHead>
              <TableHead className="h-9 text-right text-[10px] text-zinc-500">HARGA</TableHead>
              <TableHead className="h-9 text-right text-[10px] text-zinc-500">SL / TP</TableHead>
              <TableHead className="h-9 text-right text-[10px] text-zinc-500">LEV</TableHead>
              <TableHead className="h-9 text-right text-[10px] text-zinc-500">PnL</TableHead>
              <TableHead className="h-9 text-center text-[10px] text-zinc-500">RISK MGMT</TableHead>
              <TableHead className="h-9 text-right text-[10px] text-zinc-500">AKSI</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {positions.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="py-12 text-center text-xs text-zinc-500">
                  Belum ada posisi · bot membuka posisi saat skor konfluensi ≥ 7/8
                </TableCell>
              </TableRow>
            )}
            {positions.map((p) => (
              <TableRow key={p.id} className="border-white/5 font-mono text-[11px]">
                <TableCell className="py-2.5 font-bold text-zinc-100">
                  {p.symbol.replace('_USDT', '')}
                  <span className="text-[9px] text-zinc-600"> {p.mode}</span>
                </TableCell>
                <TableCell className="py-2.5">
                  <Badge className={`border-0 text-[9px] font-bold ${p.side === 1 ? 'bg-emerald-500 text-black' : 'bg-red-500 text-white'}`}>
                    {p.side === 1 ? 'LONG' : 'SHORT'}
                  </Badge>
                </TableCell>
                <TableCell className="py-2.5 text-right text-zinc-300">{p.remainCoin < 0.0001 ? p.remainCoin.toExponential(2) : p.remainCoin.toFixed(4)}</TableCell>
                <TableCell className="py-2.5 text-right text-zinc-300">{fmtPrice(p.entryPrice)}</TableCell>
                <TableCell className="py-2.5 text-right text-zinc-100">{fmtPrice(p.currentPrice)}</TableCell>
                <TableCell className="py-2.5 text-right text-[10px]">
                  <span className="text-red-400">{fmtPrice(p.sl)}</span>
                  <span className="text-zinc-600"> / </span>
                  <span className="text-emerald-400">{fmtPrice(p.tp2)}</span>
                </TableCell>
                <TableCell className="py-2.5 text-right text-zinc-400">{p.leverage}×</TableCell>
                <TableCell className={`py-2.5 text-right font-bold ${p.unrealized + p.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {fmtPnl(p.unrealized + p.pnl)}
                  <div className="text-[9px] font-normal opacity-80">{p.pnlPct >= 0 ? '+' : ''}{p.pnlPct.toFixed(1)}%</div>
                </TableCell>
                <TableCell className="py-2.5">
                  <div className="flex justify-center gap-1">
                    <Badge className={`border-0 text-[8px] ${p.tp1Hit ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/5 text-zinc-600'}`}>TP1{p.tp1Hit ? ' ✓' : ''}</Badge>
                    <Badge className={`border-0 text-[8px] ${p.tp2Hit ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/5 text-zinc-600'}`}>TP2{p.tp2Hit ? ' ✓' : ''}</Badge>
                    <Badge className={`border-0 text-[8px] ${p.beMoved ? 'bg-amber-500/20 text-amber-300' : 'bg-white/5 text-zinc-600'}`}>BE{p.beMoved ? ' ✓' : ''}</Badge>
                  </div>
                </TableCell>
                <TableCell className="py-2.5 text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={closing === p.id}
                    onClick={() => closePos(p.id)}
                    className="h-7 gap-1 border-red-500/30 px-2 text-[10px] text-red-400 hover:bg-red-500/10"
                  >
                    <X className="h-3 w-3" /> Tutup
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}
