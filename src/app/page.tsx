'use client'

import { useMemo, useState } from 'react'
import { Header } from '@/components/dashboard/header'
import { AgentGrid } from '@/components/dashboard/agents'
import { ScannerTab } from '@/components/dashboard/scanner-tab'
import { AnalysisTab } from '@/components/dashboard/analysis-tab'
import { PositionsTab } from '@/components/dashboard/positions-tab'
import { TradesTab } from '@/components/dashboard/trades-tab'
import { LogsTab } from '@/components/dashboard/logs-tab'
import { SettingsTab } from '@/components/dashboard/settings-tab'
import { usePolling, type AnalysisRow, type LogRow, type PositionRow, type SettingsData, type SignalRow, type StatusResponse, type TradeRow } from '@/components/dashboard/base'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { CircleDollarSign, Info, Sigma } from 'lucide-react'

export default function Page() {
  const [tab, setTab] = useState('scanner')

  const status = usePolling<StatusResponse>('/api/status', 3000)
  const analysis = usePolling<{ analyses: AnalysisRow[]; recentSignals: SignalRow[] }>('/api/analysis', 6000)
  const positions = usePolling<{ positions: PositionRow[] }>('/api/positions', 3000)
  const trades = usePolling<{ trades: TradeRow[]; stats: { total: number; wins: number; losses: number; winRate: number; totalPnl: number; bestPnl: number; worstPnl: number } }>('/api/trades', 8000)
  const logs = usePolling<{ logs: LogRow[] }>('/api/logs?limit=120', 4000)
  const settings = usePolling<SettingsData>('/api/settings', 30000)

  const refreshAll = () => {
    void fetch('/api/status', { cache: 'no-store' })
    void fetch('/api/trades', { cache: 'no-store' })
    void fetch('/api/positions', { cache: 'no-store' })
  }

  const bestSignal = useMemo(() => {
    const rows = analysis.data?.analyses ?? []
    return rows.length > 0 ? Math.max(...rows.map((r) => Math.max(r.scoreBuy, r.scoreSell))) : 0
  }, [analysis.data])

  const totalUnrealized = useMemo(() => {
    return (positions.data?.positions ?? []).reduce((s, p) => s + p.unrealized + p.pnl, 0)
  }, [positions.data])

  return (
    <div className="min-h-screen bg-[#0d0a06] text-zinc-100">
      <Header status={status.data} onRefresh={refreshAll} />

      <main className="mx-auto max-w-[1500px] space-y-4 px-4 py-4 sm:px-6">
        {/* 6 AGENTS */}
        <AgentGrid agents={status.data?.agents ?? []} />

        {/* KPI strip */}
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <div className="flex items-center gap-1.5 text-[9px] font-semibold tracking-wider text-zinc-500">
              <Sigma className="h-3 w-3" /> SKOR KONFLUENSI TERTINGGI
            </div>
            <div className="mt-1 font-mono text-xl font-bold text-yellow-500">{bestSignal}/8</div>
            <div className="text-[9px] text-zinc-600">sinyal masuk saat ≥ {settings.data?.minScore ?? 7}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <div className="flex items-center gap-1.5 text-[9px] font-semibold tracking-wider text-zinc-500">
              <CircleDollarSign className="h-3 w-3" /> PnL TERBUKA
            </div>
            <div className={`mt-1 font-mono text-xl font-bold ${totalUnrealized >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {totalUnrealized >= 0 ? '+' : ''}
              {totalUnrealized.toFixed(2)}
            </div>
            <div className="text-[9px] text-zinc-600">{positions.data?.positions.length ?? 0} posisi aktif</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <div className="text-[9px] font-semibold tracking-wider text-zinc-500">WIN RATE</div>
            <div className="mt-1 font-mono text-xl font-bold text-zinc-100">{(trades.data?.stats.winRate ?? 0).toFixed(0)}%</div>
            <div className="text-[9px] text-zinc-600">{trades.data?.stats.wins ?? 0}W / {trades.data?.stats.losses ?? 0}L</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <div className="text-[9px] font-semibold tracking-wider text-zinc-500">MODE EKSEKUSI</div>
            <div className="mt-1 flex items-center gap-2">
              <Badge className={`border-0 text-[10px] font-bold ${settings.data?.mode === 'LIVE' ? 'bg-red-500 text-white' : 'bg-yellow-500/15 text-yellow-400'}`}>
                {settings.data?.mode === 'LIVE' ? 'LIVE · REAL' : 'PAPER'}
              </Badge>
              <span className="font-mono text-[10px] text-zinc-500">{settings.data?.hasKeys ? 'API ✓' : 'API —'}</span>
            </div>
            <div className="mt-0.5 text-[9px] text-zinc-600">risk {settings.data?.riskPct ?? 1}% · lev {settings.data?.leverage ?? 10}×</div>
          </div>
        </section>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="h-9 w-full justify-start gap-1 overflow-x-auto rounded-xl border border-white/10 bg-white/[0.02] p-1 sm:w-fit">
            {[
              ['scanner', 'Scanner'],
              ['analysis', 'Sinyal & Analisa'],
              ['positions', 'Posisi'],
              ['trades', 'Riwayat'],
              ['logs', 'Log Agent'],
              ['settings', 'Pengaturan'],
            ].map(([v, label]) => (
              <TabsTrigger
                key={v}
                value={v}
                className={`h-7 rounded-lg px-3 text-[11px] font-semibold ${tab === v ? 'bg-yellow-500 text-black' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="scanner" className="mt-4">
            <ScannerTab scanRows={status.data?.scanRows ?? []} radarRows={status.data?.radarRows ?? []} />
          </TabsContent>

          <TabsContent value="analysis" className="mt-4">
            <AnalysisTab analyses={analysis.data?.analyses ?? []} signals={analysis.data?.recentSignals ?? []} />
          </TabsContent>

          <TabsContent value="positions" className="mt-4">
            <PositionsTab positions={positions.data?.positions ?? []} onRefresh={refreshAll} />
          </TabsContent>

          <TabsContent value="trades" className="mt-4">
            <TradesTab trades={trades.data?.trades ?? []} stats={trades.data?.stats ?? null} onRefresh={refreshAll} />
          </TabsContent>

          <TabsContent value="logs" className="mt-4">
            <LogsTab logs={logs.data?.logs ?? []} />
          </TabsContent>

          <TabsContent value="settings" className="mt-4">
            <SettingsTab settings={settings.data} onSaved={refreshAll} />
          </TabsContent>
        </Tabs>

        <footer className="mt-6 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-3 text-[10px] leading-relaxed text-amber-200/70">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
          <p>
            <b>Mode PAPER</b> menggunakan harga pasar sungguhan MEXC tanpa risiko modal — gunakan untuk memverifikasi kualitas sinyal
            BLOCXERZ v3.0 (konfluensi 7–8/8 = sangat ketat, frekuensi rendah kualitas tinggi). <b>Mode LIVE</b> mengirim order riil ke MEXC
            Futures dan berisiko likuidasi. Tidak ada indikator yang menjamin profit — kelola risiko, gunakan guard loss harian, dan pantau
            bot secara berkala.
          </p>
        </footer>
      </main>
    </div>
  )
}
