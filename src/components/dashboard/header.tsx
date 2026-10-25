'use client'

// ═══════════════════════════════════════════════════════════════════════
// HEADER — status bot, kontrol start/stop, mode, sumber data pasar
// Tema: Monumen Rawagede — Balongsari, Rawamerta, Karawang
// ═══════════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Pause, Play, Radio, ShieldAlert } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import type { StatusResponse } from './base'

// Logo Monumen Rawagede — piramida marmer + tangga emas + bintang
function LogoRawagede() {
  return (
    <svg viewBox="0 0 64 64" className="h-6 w-6" aria-label="Logo Monumen Rawagede">
      <circle cx="32" cy="32" r="30" fill="#1a1510" />
      <circle cx="32" cy="32" r="29.2" fill="none" stroke="#d4af37" strokeWidth="1.6" opacity="0.95" />
      <rect x="14" y="50.2" width="36" height="2.4" rx="0.6" fill="#332c22" />
      <rect x="11.5" y="53.2" width="41" height="2.4" rx="0.6" fill="#262019" />
      <path d="M19 50.2 L21.6 25 L42.4 25 L45 50.2 Z" fill="#e9e4d8" />
      <path d="M19 50.2 L21.6 25 L32 25 L32 50.2 Z" fill="#f6f2e7" />
      <path d="M21.6 25 L42.4 25 L32 12.5 Z" fill="#f7f3e8" />
      <path d="M21.6 25 L32 25 L32 12.5 Z" fill="#fffdf4" />
      <path d="M29.3 40.5 L29.3 32.5 Q32 30 34.7 32.5 L34.7 40.5 Z" fill="#17120b" />
      <g stroke="#d4af37" strokeWidth="1.5" strokeLinecap="round">
        <line x1="27.8" y1="43.2" x2="36.2" y2="43.2" />
        <line x1="26.2" y1="46.4" x2="37.8" y2="46.4" />
        <line x1="24.8" y1="49.6" x2="39.2" y2="49.6" />
      </g>
      <path d="M32 5 L32.82 7.27 L36.23 7.35 L33.33 8.83 L34 11.15 L32 9.8 L30 11.15 L30.67 8.83 L27.77 7.35 L31.18 7.27 Z" fill="#e8c766" />
    </svg>
  )
}

// ── Teks berjalan: peringatan Monumen Perjuangan Rawagede ──
// Dipisah per segmen (pemisah ✦) agar mudah dibaca saat bergulir
const TICKER_SEGMENTS = [
  'SELAMAT DATANG DI MONUMEN PERJUANGAN RAWAGEDE - BALONGSARI, RAWAMERTA, KARAWANG',
  '9 DESEMBER 1947 - 431 PUTRA TERBAIK GUGUR MEMPERTAHANKAN KEMERDEKAAN',
  'DIBANGUN NOV 1995 - DIRESMIKAN 12 JULI 1996',
  'TAMAN MAKAM PAHLAWAN SAMPURNA RAGA - 181 PAHLAWAN BERSEMAYAM',
  'KAMI YANG KINI TERBARING ANTARA KARAWANG-BEKASI TIDAK BISA TERIAK "MERDEKA" DAN ANGKAT SENJATA LAGI. TAPI SIAPAKAH YANG TIDAK LAGI MENDENGAR DERU KAMI, TERBAYANG KAMI MAJU DAN BERDEGAP HATI?',
  'KAMI BICARA PADAMU DALAM HENING DI MALAM SEPI JIKA DADA RASA HAMPA DAN JAM DINDING YANG BERDETAK. KAMI MATI MUDA. YANG TINGGAL TULANG DILIPUTI DEBU. KENANG, KENANGLAH KAMI.',
  'KAMI SUDAH COBA APA YANG KAMI BISA TAPI KERJA BELUM SELESAI, BELUM APA-APA. KAMI SUDAH BERI KAMI PUNYA JIWA KERJA BELUM SELESAI, BELUM BISA MEMPERHITUNGKAN ARTI 4-5 RIBU NYAWA.',
  'KAMI CUMA TULANG-TULANG BERSERAKAN TAPI ADALAH KEPUNYAANMU. KAULAH LAGI YANG TENTUKAN NILAI TULANG-TULANG BERSERAKAN.',
  'ATAUKAH JIWA KAMI MELAYANG UNTUK KEMERDEKAAN, KEMENANGAN DAN HARAPAN ATAU TIDAK UNTUK APA-APA, KAMI TIDAK TAHU, KAMI TIDAK LAGI BISA BERKATA KAULAH SEKARANG YANG BERKATA.',
  'KAMI BICARA PADAMU DALAM HENING DI MALAM SEPI JIKA DADA RASA HAMPA DAN JAM DINDING YANG BERDETAK KENANG-KENANGLAH KAMI.',
  'TERUSKAN, TERUSKAN JIWA KAMI MENJAGA BUNG KARNO, MENJAGA BUNG HATTA, MENJAGA BUNG SJAHIRIR. KAMI SEKARANG MAYAT BERILAH KAMI ARTI.',
  'BERJAGALAH TERUS DI GARIS BATAS PERNYATAAN DAN IMPIAN. KENANG, KENANGLAH KAMI YANG TINGGAL TULANG-TULANG DILIPUTI DEBU.',
  'KAMI TERBARING ANTARA KARAWANG-BEKASI - CHAIRIL ANWAR 1948',
  'JAS MERAH - JANGAN SEKALI-KALI MELUPAKAN SEJARAH',
]
const TICKER_TEXT = TICKER_SEGMENTS.map((s) => `✦ ${s}`).join(' ') + ' ✦'

function TickerRawagede() {
  return (
    <div
      className="relative overflow-hidden border-t border-yellow-500/10 bg-[#0d0a06]"
      role="marquee"
      aria-label="Teks peringatan Monumen Perjuangan Rawagede"
    >
      <div className="ticker-track flex w-max items-center whitespace-nowrap py-1.5 font-mono text-[10px] font-semibold tracking-[0.14em] text-yellow-500/90 sm:text-[11px]">
        <span className="pl-6 pr-12">{TICKER_TEXT}</span>
        <span className="pr-12" aria-hidden="true">
          {TICKER_TEXT}
        </span>
      </div>
      {/* gradasi tepi agar teks masuk/keluar dengan halus */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-[#0d0a06] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[#0d0a06] to-transparent" />
    </div>
  )
}

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

  return (
    <header className="sticky top-0 z-30 border-b border-yellow-500/15 bg-[#14100a]/95 backdrop-blur supports-[backdrop-filter]:bg-[#14100a]/80">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-yellow-500/10 ring-1 ring-yellow-500/50">
            <LogoRawagede />
          </div>
          <div>
            <div className="flex items-center gap-2 text-sm font-bold tracking-wide text-white">
              BLOCXERZ <span className="text-yellow-500">MEXC DESK</span>
              <Badge className="border-0 bg-zinc-800 text-[9px] font-semibold text-zinc-300">v3.0</Badge>
            </div>
            <div className="text-[10px] text-zinc-500">
              Signal Engine ICT · FVG · QM · 6 Agent Otonom 24/7 ·{' '}
              <span className="text-yellow-600/90">Edisi Monumen Rawagede — Karawang 1947</span>
            </div>
          </div>
        </div>

        <div className="ml-auto flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <Badge
            className={`gap-1.5 border-0 px-2.5 py-1.5 font-mono text-[10px] font-bold ${
              running ? 'animate-pulse bg-yellow-500/15 text-yellow-400' : 'bg-zinc-800 text-zinc-400'
            }`}
          >
            <Radio className="h-3 w-3" />
            {running ? 'RUNNING' : 'STOPPED'}
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
            className={`ml-auto h-8 gap-1.5 border-0 font-semibold sm:ml-0 ${
              running ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25' : 'bg-yellow-500 text-black hover:bg-yellow-400'
            }`}
          >
            {running ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {running ? 'STOP BOT' : 'START BOT'}
          </Button>
        </div>
      </div>

      {/* ── Teks berjalan peringatan Monumen Perjuangan Rawagede ── */}
      <TickerRawagede />
    </header>
  )
}
