'use client'

import { useEngineSocket } from '@/hooks/use-engine'
import { Header } from '@/components/dashboard/header'
import { KpiCards, StreakBadge } from '@/components/dashboard/kpi-cards'
import { EquityChart } from '@/components/dashboard/equity-chart'
import { AgentsPanel } from '@/components/dashboard/agents-panel'
import { ActivityFeed } from '@/components/dashboard/activity-feed'
import { ScannerTable } from '@/components/dashboard/scanner-table'
import { PositionsTrades } from '@/components/dashboard/positions-trades'
import { Skeleton } from '@/components/ui/skeleton'
import { Loader2, Hexagon, Info } from 'lucide-react'

function BootingScreen({ connected }: { connected: boolean }) {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4">
      <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-500/40">
        <Hexagon className="h-8 w-8 animate-pulse text-emerald-400" />
      </div>
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
        {connected ? 'Menyambungkan ke engine…' : 'Membangunkan NEXUS-6 engine…'}
      </div>
      <p className="max-w-xs text-center text-[11px] leading-relaxed text-zinc-600">
        6 agent otonom sedang diinisialisasi: scanner, volume radar, rug guard, position sizer, executor, journal.
      </p>
      <div className="mt-2 w-full max-w-md space-y-2 px-6">
        <Skeleton className="h-8 w-full bg-white/5" />
        <Skeleton className="h-24 w-full bg-white/5" />
        <Skeleton className="h-16 w-full bg-white/5" />
      </div>
    </div>
  )
}

export default function Page() {
  const { state, connected, booting, sendControl } = useEngineSocket()

  const onControl = (action: 'start' | 'pause' | 'reset' | 'speed', value?: number) => {
    if (action === 'speed') sendControl({ action: 'speed', value: value ?? 1 })
    else sendControl({ action })
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
      <Header state={state} connected={connected} onControl={onControl} />

      <main className="mx-auto max-w-[1600px] space-y-3.5 px-3 py-4 sm:px-5">
        {booting && !state ? (
          <BootingScreen connected={connected} />
        ) : state ? (
          <>
            <KpiCards state={state} />

            <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-3">
              <div className="xl:col-span-2">
                <EquityChart state={state} />
              </div>
              <AgentsPanel state={state} />
            </div>

            <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-3">
              <div className="xl:col-span-2">
                <ScannerTable state={state} />
              </div>
              <ActivityFeed state={state} />
            </div>

            <PositionsTrades state={state} />

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <StreakBadge state={state} />
              <p className="flex items-center gap-1.5 text-[10.5px] leading-relaxed text-zinc-600">
                <Info className="h-3 w-3 shrink-0" />
                Simulasi paper trading untuk edukasi — tidak terhubung ke bursa nyata & bukan saran finansial. Angka & pair disimulasikan secara acak.
              </p>
            </div>
          </>
        ) : null}
      </main>

      <footer className="mt-auto border-t border-white/5 py-3">
        <p className="text-center font-mono text-[10px] text-zinc-700">
          NEXUS-6 · 6-Agent Autonomous Trading Desk · scanner → volume → rug-check → sizing → eksekusi → jurnal
        </p>
      </footer>
    </div>
  )
}
