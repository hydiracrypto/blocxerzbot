'use client'

// ═══════════════════════════════════════════════════════════════════════
// HEADER — status bot, kontrol start/stop, mode, sumber data pasar
// ═══════════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Activity, Pause, Play, Radio, ShieldAlert, Zap } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import type { StatusResponse } from './base'

export function Header({ status, onRefresh }: { status: StatusResponse | null; onRefresh: () => void }) {
  const [busy, setBusy] = useState(false)
  const [uptime, setUptime] = useState('')

  useEffect(() => {
    const t = setInterval(() => {
      if (!status?.startedAt) {
        setUptime('—')
        return
      }
      const d = Math.floor((Date.now() - status.startedAt) / 1000)
      const h = Math.floor(d / 3600)
      const m = Math.floor((d % 3600) / 60)
      const s = d % 60
      setUptime(`${h}j ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}d`)
    }, 1000)
    return () => clearInterval(t)
  }, [status?.startedAt])

  const control = async (action: string) => {
    setBusy(true)
    try {
      const res = await fetch('/api/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const j = await res.json()
      toast({ title: j.message ?? 'OK', description: j.running === true ? 'Semua agent melanjutkan siklus' : undefined })
      onRefresh()
    } catch {
      toast({ title: 'Gagal mengirim perintah', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  const running = status?.running ?? false
  const srcLabel =
    status?.marketSource === 'MEXC_FUTURES'
      ? 'MEXC FUTURES · PASAR SUNGGUHAN'
      : status?.marketSource === 'MEXC_SPOT'
        ? 'MEXC SPOT (fallback) · PASAR SUNGGUHAN'
        : status?.marketSource === 'BINANCE_FUTURES'
          ? 'BINANCE FUTURES (fallback) · PASAR SUNGGUHAN'
          : status?.marketSource === 'BINANCE_SPOT'
            ? 'BINANCE SPOT (fallback) · PASAR SUNGGUHAN'
            : status?.marketSource === 'BYBIT'
              ? 'BYBIT PERP (fallback) · PASAR SUNGGUHAN'
              : status?.marketSource === 'OKX'
                ? 'OKX SWAP (fallback) · PASAR SUNGGUHAN'
                : 'MENYAMBUNGKAN…'

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0b0f14]/95 backdrop-blur supports-[backdrop-filter]:bg-[#0b0f14]/80">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/15 ring-1 ring-emerald-500/40">
            <Zap className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2 text-sm font-bold tracking-wide text-white">
              BLOCXERZ <span className="text-emerald-400">MEXC DESK</span>
              <Badge className="border-0 bg-zinc-800 text-[9px] font-semibold text-zinc-300">v3.0</Badge>
            </div>
            <div className="text-[10px] text-zinc-500">Signal Engine ICT · FVG · QM · 6 Agent Otonom 24/7</div>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Badge
            className={`gap-1.5 border-0 px-2.5 py-1.5 font-mono text-[10px] font-bold ${
              running ? 'animate-pulse bg-emerald-500/15 text-emerald-400' : 'bg-zinc-800 text-zinc-400'
            }`}
          >
            <Radio className="h-3 w-3" />
            {running ? 'RUNNING' : 'STOPPED'}
          </Badge>

          <Badge className="border-0 bg-amber-500/10 px-2.5 py-1.5 font-mono text-[10px] font-bold text-amber-400">
            <Activity className="h-3 w-3" />
            {srcLabel}
          </Badge>

          {status?.dailyGuard && (
            <Badge className="gap-1 border-0 bg-red-500/15 px-2.5 py-1.5 text-[10px] font-bold text-red-400">
              <ShieldAlert className="h-3 w-3" /> GUARD LOSS HARIAN
            </Badge>
          )}

          <div className="hidden items-center gap-3 rounded-lg border border-white/10 px-3 py-1.5 font-mono text-[10px] text-zinc-400 md:flex">
            <span>
              UPTIME <span className="text-zinc-200">{uptime}</span>
            </span>
            <span className="text-zinc-700">|</span>
            <span>
              SIKLUS <span className="text-zinc-200">{status?.cycles ?? 0}</span>
            </span>
            <span className="text-zinc-700">|</span>
            <span>
              POSISI <span className="text-zinc-200">{status?.openCount ?? 0}</span>
            </span>
            <span className="text-zinc-700">|</span>
            <span>
              PAIR <span className="text-zinc-200">{status?.watchlist.length ?? 0}</span>
            </span>
          </div>

          <Button
            size="sm"
            disabled={busy}
            onClick={() => control(running ? 'stop' : 'start')}
            className={`h-8 gap-1.5 border-0 font-semibold ${
              running ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25' : 'bg-emerald-500 text-black hover:bg-emerald-400'
            }`}
          >
            {running ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {running ? 'STOP BOT' : 'START BOT'}
          </Button>
        </div>
      </div>
    </header>
  )
}
