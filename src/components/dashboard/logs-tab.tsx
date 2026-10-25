'use client'

// ═══════════════════════════════════════════════════════════════════════
// LOGS TAB — konsol aktivitas 6 agent
// ═══════════════════════════════════════════════════════════════════════
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { clockTime, type LogRow } from './base'
import { Terminal } from 'lucide-react'

const AGENT_COLOR: Record<string, string> = {
  A1: 'text-sky-300',
  A2: 'text-amber-300',
  A3: 'text-emerald-300',
  A4: 'text-violet-300',
  A5: 'text-orange-300',
  A6: 'text-teal-300',
  SYS: 'text-zinc-400',
}

const LEVEL_STYLE: Record<string, string> = {
  info: 'text-zinc-300',
  signal: 'text-emerald-300 font-semibold',
  trade: 'text-amber-300 font-semibold',
  warn: 'text-yellow-400',
  error: 'text-red-400',
}

const AGENT_NAMES: Record<string, string> = {
  A1: 'SCANNER',
  A2: 'RADAR',
  A3: 'STRATEGY',
  A4: 'SIZER',
  A5: 'EXECUTOR',
  A6: 'MONITOR',
  SYS: 'SYSTEM',
}

export function LogsTab({ logs }: { logs: LogRow[] }) {
  const [filter, setFilter] = useState('all')

  const filtered = logs.filter((l) => (filter === 'all' ? true : filter === 'activity' ? !['signal', 'trade'].includes(l.level) : l.level === filter))

  return (
    <section aria-label="Log aktivitas">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
          <Terminal className="h-4 w-4 text-emerald-400" />
          KONSOL AKTIVITAS 6 AGENT (24/7)
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="h-7 w-44 border-white/10 bg-white/[0.03] text-[11px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-white/10 bg-[#10161d]">
            <SelectItem value="all">Semua log</SelectItem>
            <SelectItem value="activity">Aktivitas agent</SelectItem>
            <SelectItem value="signal">Sinyal</SelectItem>
            <SelectItem value="trade">Trade</SelectItem>
            <SelectItem value="warn">Peringatan</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="max-h-[560px] space-y-1 overflow-y-auto rounded-xl border border-white/10 bg-black/40 p-3 font-mono">
        {filtered.length === 0 && <div className="py-10 text-center text-xs text-zinc-600">Kosong</div>}
        {filtered.map((l) => (
          <div key={l.id} className="flex gap-2 text-[11px] leading-relaxed">
            <span className="shrink-0 text-zinc-600">{clockTime(l.createdAt)}</span>
            <span className={`w-16 shrink-0 ${AGENT_COLOR[l.agent] ?? 'text-zinc-400'}`}>[{AGENT_NAMES[l.agent] ?? l.agent}]</span>
            <span className={`min-w-0 break-words ${LEVEL_STYLE[l.level] ?? 'text-zinc-300'}`}>{l.message}</span>
            {l.level === 'signal' && <Badge className="ml-auto h-4 shrink-0 border-0 bg-emerald-500/15 px-1 text-[8px] text-emerald-300">SIGNAL</Badge>}
            {l.level === 'trade' && <Badge className="ml-auto h-4 shrink-0 border-0 bg-amber-500/15 px-1 text-[8px] text-amber-300">TRADE</Badge>}
          </div>
        ))}
      </div>
    </section>
  )
}
