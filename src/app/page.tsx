'use client'

import { useState } from 'react'
import { useEngineSocket } from '@/hooks/use-engine'
import { Header } from '@/components/dashboard/header'
import { KpiCards } from '@/components/dashboard/kpi-cards'
import { EquityChart } from '@/components/dashboard/equity-chart'
import { PriceChart } from '@/components/dashboard/price-chart'
import { MastersPanel } from '@/components/dashboard/masters-panel'
import { ActivityFeed } from '@/components/dashboard/activity-feed'
import { MarketTable } from '@/components/dashboard/market-table'
import { PositionsTrades } from '@/components/dashboard/positions-trades'
import { SettingsDialog } from '@/components/dashboard/settings-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Loader2, TrendingUp, Info } from 'lucide-react'

function BootingScreen({ connected }: { connected: boolean }) {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4">
      <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-500/40">
        <TrendingUp className="h-8 w-8 animate-pulse text-emerald-400" />
      </div>
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
        {connected ? 'Menyambungkan ke engine…' : 'Membangunkan APEX-5 engine…'}
      </div>
      <p className="max-w-sm text-center text-[11px] leading-relaxed text-zinc-600">
        Menyambungkan ke pasar sungguhan Binance Spot, memuat 10 pair USDT,
        dan menyiapkan 5 master strategi (Dennis, Seykota, Schwartz, PTJ, Bollinger) + Risk Manager.
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
  const [settingsOpen, setSettingsOpen] = useState(false)

  const onControl = (action: 'start' | 'pause' | 'reset') => sendControl({ action })
  const onFocus = (symbol: string) => sendControl({ action: 'focus', symbol })
  const onSaveSettings = (settings: Record<string, unknown>) => sendControl({ action: 'settings', settings })

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100 antialiased">
      <Header state={state} connected={connected} onControl={onControl} onOpenSettings={() => setSettingsOpen(true)} />

      <main className="mx-auto w-full max-w-[1600px] flex-1 space-y-3.5 px-3 py-4 sm:px-5">
        {booting && !state ? (
          <BootingScreen connected={connected} />
        ) : state ? (
          <>
            <KpiCards state={state} />

            <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-3">
              <div className="space-y-3.5 xl:col-span-2">
                <PriceChart state={state} />
                <EquityChart state={state} />
              </div>
              <MastersPanel state={state} />
            </div>

            <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-3">
              <div className="xl:col-span-2">
                <MarketTable state={state} onFocus={onFocus} />
              </div>
              <ActivityFeed state={state} />
            </div>

            <PositionsTrades state={state} />

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <p className="flex items-center gap-1.5 font-mono text-[10.5px] text-zinc-600">
                <Info className="h-3 w-3 shrink-0" />
                Sinyal dihitung pada candle 1m tertutup; stop/TP dipantau tiap detik terhadap harga real.
              </p>
              <p className="max-w-lg text-[10.5px] leading-relaxed text-zinc-600">
                Harga sungguhan dari Binance Spot. Mode PAPER mensimulasikan eksekusi; mode LIVE mengirim order
                nyata via API key Anda. Bukan saran finansial — kelola risiko Anda sendiri.
              </p>
            </div>
          </>
        ) : null}
      </main>

      <footer className="mt-auto border-t border-white/5 py-3">
        <p className="text-center font-mono text-[10px] text-zinc-700">
          APEX-5 · Real-Market Autonomous Trading · Dennis × Seykota × Schwartz × Tudor Jones × Bollinger + Risk Manager
        </p>
      </footer>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} state={state} onSave={onSaveSettings} />
    </div>
  )
}
