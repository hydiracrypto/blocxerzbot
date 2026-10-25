'use client'

// ═══════════════════════════════════════════════════════════════════════
// SETTINGS TAB — konfigurasi bot, API key MEXC, mode PAPER/LIVE
// ═══════════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/hooks/use-toast'
import { AlertTriangle, KeyRound, Save, Settings2, ShieldCheck } from 'lucide-react'
import type { SettingsData } from './base'

export function SettingsTab({ settings, onSaved }: { settings: SettingsData | null; onSaved: () => void }) {
  const [form, setForm] = useState<SettingsData | null>(null)
  const [saving, setSaving] = useState(false)
  const [liveDialog, setLiveDialog] = useState(false)
  const [accountCheck, setAccountCheck] = useState<{ ok: boolean; message: string } | null>(null)

  useEffect(() => {
    if (settings && !form) setForm({ ...settings })
  }, [settings, form])

  if (!form) return <div className="py-16 text-center text-xs text-zinc-500">Memuat pengaturan…</div>

  const set = <K extends keyof SettingsData>(k: K, v: SettingsData[K]) => setForm({ ...form, [k]: v })

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const j = await res.json()
      if (j.accountCheck) setAccountCheck(j.accountCheck)
      toast({ title: j.ok ? 'Pengaturan tersimpan' : 'Gagal menyimpan', description: j.accountCheck?.message })
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  const toggleMode = (checked: boolean) => {
    if (checked) {
      setLiveDialog(true)
    } else {
      set('mode', 'PAPER')
    }
  }

  const confirmLive = () => {
    set('mode', 'LIVE')
    setLiveDialog(false)
  }

  const numField = (label: string, k: keyof SettingsData, desc: string, step = '1', min?: number, max?: number) => (
    <div className="space-y-1.5">
      <Label className="text-[11px] text-zinc-300">{label}</Label>
      <Input
        type="number"
        step={step}
        min={min}
        max={max}
        value={String(form[k] ?? '')}
        onChange={(e) => set(k, Number(e.target.value) as never)}
        className="h-9 border-white/10 bg-white/[0.03] font-mono text-xs"
      />
      <p className="text-[9px] leading-relaxed text-zinc-600">{desc}</p>
    </div>
  )

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Eksekusi & API */}
      <section className="space-y-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
          <KeyRound className="h-4 w-4 text-yellow-500" />
          EKSEKUSI PASAR SUNGGUHAN · MEXC FUTURES
        </div>

        <div className="flex items-center justify-between rounded-lg border border-white/10 p-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
              Mode Live (uang riil)
              <Badge className={`border-0 text-[9px] font-bold ${form.mode === 'LIVE' ? 'bg-red-500 text-white' : 'bg-yellow-500/15 text-yellow-400'}`}>
                {form.mode === 'LIVE' ? 'LIVE · REAL' : 'PAPER · SIMULASI'}
              </Badge>
            </div>
            <p className="mt-0.5 text-[9px] text-zinc-500">PAPER: simulasi dengan harga pasar riil. LIVE: order riil ke MEXC Futures (butuh API key).</p>
          </div>
          <Switch checked={form.mode === 'LIVE'} onCheckedChange={toggleMode} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-[11px] text-zinc-300">MEXC API Key</Label>
            <Input
              value={form.apiKey}
              onChange={(e) => set('apiKey', e.target.value)}
              placeholder="xxxxxxx…"
              className="h-9 border-white/10 bg-white/[0.03] font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] text-zinc-300">MEXC API Secret</Label>
            <Input
              type="password"
              value={form.apiSecret}
              onChange={(e) => set('apiSecret', e.target.value)}
              placeholder="xxxxxxx…"
              className="h-9 border-white/10 bg-white/[0.03] font-mono text-xs"
            />
          </div>
        </div>

        {form.hasKeys && (
          <div className="flex items-center gap-2 rounded-lg border border-yellow-500/25 bg-yellow-500/5 p-2.5 text-[10px] text-yellow-300">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            API key terkonfigurasi. Untuk keamanan: batasi API key Anda ke Futures Trading tanpa withdrawal, dan whitelist IP server ini di MEXC.
          </div>
        )}
        {accountCheck && (
          <div className={`rounded-lg border p-2.5 text-[10px] ${accountCheck.ok ? 'border-yellow-500/25 bg-yellow-500/5 text-yellow-300' : 'border-red-500/25 bg-red-500/5 text-red-300'}`}>
            {accountCheck.ok ? '✓' : '✕'} {accountCheck.message}
          </div>
        )}

        <Dialog open={liveDialog} onOpenChange={setLiveDialog}>
          <DialogContent className="border-white/10 bg-[#16120c]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-sm text-red-400">
                <AlertTriangle className="h-4 w-4" /> Aktifkan Mode Live?
              </DialogTitle>
              <DialogDescription className="text-[11px] leading-relaxed text-zinc-400">
                Bot akan mengirim order <b className="text-zinc-200">riil</b> LONG/SHORT ke MEXC Futures menggunakan API key Anda. Trading futures
                berleveraj tinggi berisiko likuidasi. Pastikan Anda memahami risikonya. Disarankan mulai dengan risiko rendah (0.5–1%) dan
                pantau bot secara berkala.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setLiveDialog(false)} className="border-white/15 text-xs">
                Batal
              </Button>
              <Button size="sm" onClick={confirmLive} className="bg-red-500 text-xs text-white hover:bg-red-400">
                Saya mengerti — aktifkan LIVE
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </section>

      {/* Risk & Strategi */}
      <section className="space-y-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
          <Settings2 className="h-4 w-4 text-yellow-500" />
          RISK MANAGEMENT & STRATEGI
        </div>

        <div className="grid grid-cols-2 gap-3">
          {numField('Risiko per trade (% equity)', 'riskPct', 'Risk $ = equity × % / jarak SL. Standar profesional: 1%.', '0.1', 0.1, 10)}
          {numField('Leverage', 'leverage', 'Leverage futures MEXC. Wajar: 5–20×.', '1', 1, 125)}
          {numField('Max posisi bersamaan', 'maxPositions', 'Batas posisi terbuka sekaligus.', '1', 1, 20)}
          {numField('Pair dipantau (watchlist)', 'maxWatch', 'Top N pair berdasarkan volume 24 jam.', '1', 3, 30)}
          {numField('Min skor utama', 'minScore', 'Skor konfluensi minimal sinyal utama (Pine default 7).', '1', 4, 8)}
          {numField('Min skor QM', 'qmMinScore', 'Skor minimal sinyal Quasimodo (Pine default 6).', '1', 3, 8)}
          {numField('Min volume 24 jam (USDT)', 'minVolUsd', 'Filter likuiditas pair.', '500000')}
          {numField('Equity paper (USDT)', 'paperEquity', 'Modal awal simulasi.', '100')}
          {numField('Fee taker (%)', 'feePct', 'Fee per sisi transaksi.', '0.01')}
          {numField('Batas loss harian (%)', 'maxDailyLossPct', 'Guard: berhenti buka posisi baru bila loss harian menembus batas.', '1', 1, 100)}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-[11px] text-zinc-300">Mode Take Profit</Label>
            <Select value={form.tpMode} onValueChange={(v) => set('tpMode', v as SettingsData['tpMode'])}>
              <SelectTrigger className="h-9 border-white/10 bg-white/[0.03] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-white/10 bg-[#16120c]">
                <SelectItem value="LADDER">Ladder — TP1/TP2/TP3: 33/33/34% + SL→BE</SelectItem>
                <SelectItem value="TP3_FULL">TP3 Full — tahan sampai TP3, SL→BE setelah TP1</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[9px] text-zinc-600">Cara bot mengelola target 1R / 2R / 3R.</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] text-zinc-300">Flip posisi lawan</Label>
            <div className="flex h-9 items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3">
              <Switch checked={form.allowFlip} onCheckedChange={(v) => set('allowFlip', v)} />
              <span className="text-[10px] text-zinc-400">{form.allowFlip ? 'Sinyal berlawanan menutup & membalik posisi' : 'Sinyal berlawanan diabaikan'}</span>
            </div>
            <p className="text-[9px] text-zinc-600">Sesuai input &quot;Allow Opposite Signal to Flip&quot; di Pine.</p>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-[11px] text-zinc-300">Auto-start saat server menyala</Label>
            <div className="flex h-9 items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3">
              <Switch checked={form.autoRun} onCheckedChange={(v) => set('autoRun', v)} />
              <span className="text-[10px] text-zinc-400">{form.autoRun ? '6 Agent otomatis bekerja saat aplikasi dibuka' : 'Bot menunggu tombol START'}</span>
            </div>
          </div>
        </div>
      </section>

      <div className="lg:col-span-2">
        <Button onClick={save} disabled={saving} className="h-10 w-full gap-2 bg-yellow-500 font-semibold text-black hover:bg-yellow-400">
          <Save className="h-4 w-4" />
          {saving ? 'Menyimpan…' : 'SIMPAN PENGATURAN'}
        </Button>
      </div>
    </div>
  )
}
