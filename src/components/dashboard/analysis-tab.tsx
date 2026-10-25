'use client'

// ═══════════════════════════════════════════════════════════════════════
// ANALYSIS TAB — hasil Strategy Engine per pair + sinyal terbaru
// ═══════════════════════════════════════════════════════════════════════
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { FACTOR_LABELS } from './factors'
import { fmtPrice, timeAgo, type AnalysisRow, type SignalRow } from './base'
import { BrainCircuit } from 'lucide-react'

function FactorDots({ factors }: { factors: number[] }) {
  return (
    <div className="flex flex-wrap gap-0.5" title={FACTOR_LABELS.map((l, i) => `${i + 1}. ${l}: ${factors[i] ? '✓' : '✗'}`).join('\n')}>
      {factors.map((f, i) => (
        <span
          key={i}
          className={`flex h-3.5 w-3.5 items-center justify-center rounded-[3px] text-[7px] font-bold ${
            f ? 'bg-yellow-500/25 text-yellow-300' : 'bg-white/5 text-zinc-600'
          }`}
        >
          {i + 1}
        </span>
      ))}
    </div>
  )
}

export function AnalysisTab({ analyses, signals }: { analyses: AnalysisRow[]; signals: SignalRow[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <section aria-label="Analisa strategi" className="lg:col-span-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-zinc-300">
          <BrainCircuit className="h-4 w-4 text-yellow-500" />
          STRATEGY ENGINE · BLOCXERZ v3.0 (8 faktor konfluensi, bar 15m closed)
        </div>
        <div className="max-h-[560px] overflow-y-auto rounded-xl border border-white/10">
          <Table>
            <TableHeader className="sticky top-0 bg-[#16120c]">
              <TableRow className="border-white/5 hover:bg-transparent">
                <TableHead className="h-9 text-[10px] text-zinc-500">PAIR</TableHead>
                <TableHead className="h-9 text-[10px] text-zinc-500">BIAS</TableHead>
                <TableHead className="h-9 text-center text-[10px] text-zinc-500">SKOR L/S</TableHead>
                <TableHead className="h-9 text-[10px] text-zinc-500">FAKTOR</TableHead>
                <TableHead className="h-9 text-[10px] text-zinc-500">STRUKTUR</TableHead>
                <TableHead className="h-9 text-[10px] text-zinc-500">QM</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {analyses.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-xs text-zinc-500">
                    Engine menghitung konfluensi pertama…
                  </TableCell>
                </TableRow>
              )}
              {analyses.map((a) => (
                <TableRow key={a.symbol} className="border-white/5 align-top">
                  <TableCell className="py-2.5 font-mono text-[11px] font-bold text-zinc-100">
                    {a.symbol.replace('_USDT', '')}
                    <div className="text-[9px] font-normal text-zinc-500">{fmtPrice(a.price)}</div>
                  </TableCell>
                  <TableCell className="py-2.5">
                    <Badge
                      className={`border-0 text-[9px] font-bold ${
                        a.biasDir === 1 ? 'bg-emerald-500/15 text-emerald-400' : a.biasDir === -1 ? 'bg-red-500/15 text-red-400' : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      {a.biasDir === 1 ? 'BULLISH' : a.biasDir === -1 ? 'BEARISH' : 'NETRAL'} · {['—', 'Low', 'Med', 'High'][a.biasConf]}
                    </Badge>
                    <div className="mt-1 max-w-[170px] truncate text-[9px] text-zinc-500" title={a.biasReason}>
                      {a.biasReason}
                    </div>
                  </TableCell>
                  <TableCell className="py-2.5 text-center font-mono text-[11px]">
                    <span className={a.scoreBuy >= 7 ? 'font-bold text-emerald-400' : 'text-zinc-300'}>{a.scoreBuy}</span>
                    <span className="text-zinc-600"> / </span>
                    <span className={a.scoreSell >= 7 ? 'font-bold text-red-400' : 'text-zinc-300'}>{a.scoreSell}</span>
                  </TableCell>
                  <TableCell className="py-2.5">
                    <div className="space-y-1">
                      <FactorDots factors={a.factorsBuy} />
                      <FactorDots factors={a.factorsSell} />
                    </div>
                  </TableCell>
                  <TableCell className="py-2.5 text-[9px] text-zinc-400">
                    <div>{a.biasStruct}</div>
                    <div className="font-mono text-zinc-600">{a.tfAlign}</div>
                  </TableCell>
                  <TableCell className="py-2.5">
                    <span
                      className={`text-[9px] ${
                        a.qmBullActive ? 'text-emerald-400' : a.qmBearActive ? 'text-red-400' : 'text-zinc-600'
                      }`}
                    >
                      {a.qm}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section aria-label="Sinyal terbaru" className="lg:col-span-2">
        <div className="mb-2 text-xs font-semibold text-zinc-300">SINYAL TERBARU (bar closed · non-repainting)</div>
        <div className="max-h-[560px] space-y-2 overflow-y-auto">
          {signals.length === 0 && (
            <div className="rounded-xl border border-white/10 py-10 text-center text-xs text-zinc-500">
              Belum ada sinyal · skor 7/8 sangat ketat, bot menunggu setup terbaik
            </div>
          )}
          {signals.map((s) => (
            <div key={s.id} className={`rounded-xl border p-3 ${s.direction === 1 ? 'border-emerald-500/30 bg-emerald-500/[0.05]' : 'border-red-500/30 bg-red-500/[0.05]'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge className={`border-0 text-[10px] font-bold ${s.direction === 1 ? 'bg-emerald-500 text-black' : 'bg-red-500 text-white'}`}>
                    {s.direction === 1 ? 'LONG' : 'SHORT'}
                  </Badge>
                  <span className="font-mono text-xs font-bold text-zinc-100">{s.symbol.replace('_USDT', '')}</span>
                  {s.isQM && <Badge className="border-0 bg-amber-500/15 text-[9px] text-amber-400">QM</Badge>}
                </div>
                <span className="font-mono text-[10px] text-zinc-500">skor {s.score}/8</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-[10px] text-zinc-400">
                <span>Entry: <span className="text-zinc-200">{fmtPrice(s.entry)}</span></span>
                <span className="text-red-400">SL: {fmtPrice(s.sl)}</span>
                <span className="text-emerald-400">TP1: {fmtPrice(s.tp1)}</span>
                <span className="text-emerald-400">TP2: {fmtPrice(s.tp2)}</span>
                <span className="text-emerald-400">TP3: {fmtPrice(s.tp3)}</span>
                <span className="text-right text-[9px] text-zinc-600">{timeAgo(s.createdAt)}</span>
              </div>
              {s.skipReason && (
                <div className="mt-1.5 rounded bg-white/5 px-2 py-1 text-[9px] text-amber-400/90" title={s.skipReason}>
                  Tidak dieksekusi: {s.skipReason}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
