'use client'

import { useEffect, useRef } from 'react'
import type { ActivityItem, EngineState, LogLevel } from '@/lib/engine-types'
import { cn } from '@/lib/utils'
import { Radar, Zap, ShieldAlert, Scale, Crosshair, NotebookPen } from 'lucide-react'

const AGENT_TAG: Record<string, { tag: string; icon: React.ReactNode; cls: string }> = {
  scanner: { tag: 'SCANNER', icon: <Radar className="h-3 w-3" />, cls: 'text-sky-300 bg-sky-500/10 ring-sky-500/30' },
  volume: { tag: 'VOLUME', icon: <Zap className="h-3 w-3" />, cls: 'text-violet-300 bg-violet-500/10 ring-violet-500/30' },
  rug: { tag: 'RUG-GUARD', icon: <ShieldAlert className="h-3 w-3" />, cls: 'text-orange-300 bg-orange-500/10 ring-orange-500/30' },
  sizer: { tag: 'SIZER', icon: <Scale className="h-3 w-3" />, cls: 'text-teal-300 bg-teal-500/10 ring-teal-500/30' },
  executor: { tag: 'EXECUTOR', icon: <Crosshair className="h-3 w-3" />, cls: 'text-emerald-300 bg-emerald-500/10 ring-emerald-500/30' },
  journal: { tag: 'JOURNAL', icon: <NotebookPen className="h-3 w-3" />, cls: 'text-zinc-300 bg-white/5 ring-white/15' },
}

function timeLabel(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

function levelTextCls(level: LogLevel, msg: string): string {
  if (level === 'danger') return 'text-rose-300'
  if (level === 'warn') return 'text-amber-300'
  if (level === 'success') return 'text-emerald-300'
  if (level === 'trade') return msg.includes('+') ? 'font-semibold text-emerald-300' : msg.includes('-') ? 'font-semibold text-rose-300' : 'text-zinc-200'
  return 'text-zinc-400'
}

function Row({ item }: { item: ActivityItem }) {
  const meta = AGENT_TAG[item.agent] ?? AGENT_TAG.journal
  return (
    <div className="flex items-start gap-2 border-b border-white/5 px-3 py-1.5 last:border-b-0 hover:bg-white/[0.02]">
      <span className="shrink-0 pt-0.5 font-mono text-[10px] text-zinc-600">{timeLabel(item.ts)}</span>
      <span className={cn('flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[9.5px] font-bold tracking-wide ring-1', meta.cls)}>
        {meta.icon}
        {meta.tag}
      </span>
      <p className={cn('min-w-0 flex-1 break-words font-mono text-[11.5px] leading-relaxed', levelTextCls(item.level, item.msg))}>
        {item.msg}
      </p>
    </div>
  )
}

export function ActivityFeed({ state }: { state: EngineState }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)

  useEffect(() => {
    const el = scrollRef.current
    if (el && stickRef.current) el.scrollTop = 0
  }, [state.activity])

  return (
    <div className="flex h-full flex-col rounded-xl border border-white/10 bg-white/[0.03]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-200">Activity Feed</h2>
          <p className="text-[11px] text-zinc-500">Setiap keputusan agent + alasan, real-time</p>
        </div>
        <span className="flex items-center gap-1.5 font-mono text-[10px] text-emerald-400">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          STREAMING
        </span>
      </div>
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget
          stickRef.current = el.scrollTop < 24
        }}
        className="min-h-0 flex-1 overflow-y-auto"
        style={{ maxHeight: 420 }}
      >
        {state.activity.length === 0 ? (
          <p className="p-6 text-center text-xs text-zinc-600">Menunggu aktivitas agent…</p>
        ) : (
          state.activity.map((item) => <Row key={item.id} item={item} />)
        )}
      </div>
    </div>
  )
}
