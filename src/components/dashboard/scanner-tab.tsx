'use client'

// ═══════════════════════════════════════════════════════════════════════
// SCANNER TAB — hasil Pair Scanner + Volume Radar
// ═══════════════════════════════════════════════════════════════════════
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Radar, ScanLine } from 'lucide-react'
import { fmtPrice, fmtUsd, type RadarRow, type ScanRow } from './base'

export function ScannerTab({ scanRows, radarRows }: { scanRows: ScanRow[]; radarRows: RadarRow[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <section aria-label="Market scanner" className="lg:col-span-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-zinc-300">
          <ScanLine className="h-4 w-4 text-emerald-400" />
          PAIR SCANNER · Semua aset USDT di MEXC (diurut volume 24 jam)
        </div>
        <div className="max-h-[520px] overflow-y-auto rounded-xl border border-white/10">
          <Table>
            <TableHeader className="sticky top-0 bg-[#10161d]">
              <TableRow className="border-white/5 hover:bg-transparent">
                <TableHead className="h-9 text-[10px] text-zinc-500">#</TableHead>
                <TableHead className="h-9 text-[10px] text-zinc-500">PAIR</TableHead>
                <TableHead className="h-9 text-right text-[10px] text-zinc-500">HARGA</TableHead>
                <TableHead className="h-9 text-right text-[10px] text-zinc-500">24J</TableHead>
                <TableHead className="h-9 text-right text-[10px] text-zinc-500">VOL 24J</TableHead>
                <TableHead className="h-9 text-right text-[10px] text-zinc-500">STATUS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scanRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-xs text-zinc-500">
                    Memindai pasar sungguhan…
                  </TableCell>
                </TableRow>
              )}
              {scanRows.map((r) => (
                <TableRow key={r.symbol} className={`border-white/5 font-mono text-[11px] ${r.watched ? 'bg-emerald-500/[0.04]' : ''}`}>
                  <TableCell className="py-2 text-zinc-500">{r.rank}</TableCell>
                  <TableCell className="py-2 font-semibold text-zinc-100">
                    {r.symbol.replace('_USDT', '')}
                    <span className="text-zinc-500">/USDT</span>
                  </TableCell>
                  <TableCell className="py-2 text-right text-zinc-200">{fmtPrice(r.price)}</TableCell>
                  <TableCell className={`py-2 text-right ${r.changeRate >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {r.changeRate >= 0 ? '+' : ''}
                    {(r.changeRate * 100).toFixed(2)}%
                  </TableCell>
                  <TableCell className="py-2 text-right text-zinc-400">{fmtUsd(r.quoteVolume)}</TableCell>
                  <TableCell className="py-2 text-right">
                    {r.watched ? (
                      <Badge className="border-0 bg-emerald-500/15 text-[9px] font-bold text-emerald-400">DIPANTAU</Badge>
                    ) : (
                      <span className="text-[9px] text-zinc-600">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section aria-label="Volume radar" className="lg:col-span-2">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-zinc-300">
          <Radar className="h-4 w-4 text-amber-400" />
          VOLUME RADAR · Momentum & likuiditas watchlist
        </div>
        <div className="max-h-[520px] space-y-2 overflow-y-auto rounded-xl border border-white/10 p-3">
          {radarRows.length === 0 && <div className="py-10 text-center text-xs text-zinc-500">Radar menyala…</div>}
          {radarRows.map((r) => (
            <div key={r.symbol} className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-zinc-100">{r.symbol.replace('_USDT', '')}</span>
                <span className="font-mono text-[10px] text-zinc-400">{fmtPrice(r.price)}</span>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[10px]">
                <span className={r.changeRate >= 0 ? 'font-mono text-emerald-400' : 'font-mono text-red-400'}>
                  {r.changeRate >= 0 ? '▲' : '▼'} {(r.changeRate * 100).toFixed(2)}%
                </span>
                <span className="font-mono text-zinc-500">VOL {fmtUsd(r.quoteVolume)}</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5">
                <div
                  className={`h-full rounded-full ${r.score >= 60 ? 'bg-amber-400' : r.score >= 35 ? 'bg-emerald-500' : 'bg-zinc-600'}`}
                  style={{ width: `${Math.min(100, r.score)}%` }}
                />
              </div>
              <div className="mt-1 flex justify-between text-[9px] text-zinc-600">
                <span>skor radar</span>
                <span className="font-mono">{r.score}/100</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
