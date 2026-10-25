'use client'

import { useState } from 'react'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { KeyRound, Save, ShieldAlert, Info, Database } from 'lucide-react'
import type { EngineState } from '@/lib/engine-types'
import { cn } from '@/lib/utils'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  state: EngineState | null
  onSave: (patch: Record<string, unknown>) => void
}

/** Form di-mount ulang tiap dialog dibuka — inisialisasi dari snapshot state terbaru */
function SettingsForm({ state, onSave, onClose }: { state: EngineState; onSave: (patch: Record<string, unknown>) => void; onClose: () => void }) {
  const st = state.settings
  const [mode, setMode] = useState<'PAPER' | 'LIVE'>(st.mode)
  const [apiKey, setApiKey] = useState(st.apiKeyMasked || '')
  const [apiSecret, setApiSecret] = useState('')
  const [testnet, setTestnet] = useState(st.testnet)
  const [riskPct, setRiskPct] = useState(String(st.riskPerTradePct))
  const [maxOpen, setMaxOpen] = useState(String(st.maxOpenPositions))
  const [dailyLoss, setDailyLoss] = useState(String(st.dailyLossLimitPct))
  const [startEquity, setStartEquity] = useState(String(st.startingEquity))

  const handleSave = () => {
    const patch: Record<string, unknown> = {
      mode,
      testnet,
      riskPerTradePct: Number(riskPct),
      maxOpenPositions: Number(maxOpen),
      dailyLossLimitPct: Number(dailyLoss),
      startingEquity: Number(startEquity),
    }
    // hanya kirim keys bila user mengubahnya (bukan nilai masked)
    if (apiKey && !apiKey.includes('…')) patch.apiKey = apiKey
    if (apiSecret.trim()) patch.apiSecret = apiSecret.trim()
    onSave(patch)
    onClose()
  }

  return (
    <>
      <div className="space-y-4 py-1">
        <div className="space-y-1.5">
          <Label className="text-[12px] text-zinc-300">Mode Eksekusi</Label>
          <Select value={mode} onValueChange={(v) => setMode(v as 'PAPER' | 'LIVE')}>
            <SelectTrigger className="h-9 border-white/10 bg-white/[0.04]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-white/10 bg-zinc-950">
              <SelectItem value="PAPER">PAPER — simulasi dgn harga real (aman)</SelectItem>
              <SelectItem value="LIVE">LIVE — order nyata ke Binance</SelectItem>
            </SelectContent>
          </Select>
          {mode === 'LIVE' && (
            <Alert className="border-fuchsia-500/30 bg-fuchsia-500/5">
              <ShieldAlert className="h-4 w-4 text-fuchsia-400" />
              <AlertTitle className="text-[12px] font-bold text-fuchsia-300">Perhatian — uang sungguhan</AlertTitle>
              <AlertDescription className="text-[11px] leading-relaxed text-zinc-400">
                Mode LIVE mengirim order market nyata. Gunakan API key dengan izin <b>Spot Trading</b> saja
                (tanpa izin withdraw), aktifkan IP whitelist, dan mulai dengan dana kecil. Bot memakai stop-loss
                ketat, tetapi risiko pasar tetap ada.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <p className="mb-2.5 flex items-center gap-1.5 text-[12px] font-bold text-zinc-200">
            <KeyRound className="h-3.5 w-3.5 text-emerald-400" /> API Binance {st.hasApiSecret ? '(terpasang)' : '(belum diatur)'}
          </p>
          <div className="space-y-2.5">
            <div className="space-y-1">
              <Label className="text-[11px] text-zinc-400">API Key</Label>
              <Input
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="64 karakter API key dari Binance"
                className="h-8 border-white/10 bg-black/40 font-mono text-[11px]"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-zinc-400">API Secret</Label>
              <Input
                type="password"
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
                placeholder={st.hasApiSecret ? '••• tersimpan — kosongkan bila tidak diubah' : '64 karakter API secret'}
                className="h-8 border-white/10 bg-black/40 font-mono text-[11px]"
                autoComplete="new-password"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-[11.5px] text-zinc-300">Binance Testnet</Label>
                <p className="text-[10px] text-zinc-500">Uji LIVE mode tanpa uang nyata (saldo uji)</p>
              </div>
              <Switch checked={testnet} onCheckedChange={setTestnet} />
            </div>
          </div>
          <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-relaxed text-zinc-600">
            <Database className="mt-0.5 h-3 w-3 shrink-0" />
            Keys disimpan lokal di database SQLite sandbox ini dan hanya dikirim ke Binance. Tidak dibagikan ke pihak lain.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div className="space-y-1">
            <Label className="text-[11.5px] text-zinc-300">Risiko / trade (% ekuitas)</Label>
            <Input
              type="number" min="0.2" max="5" step="0.1" value={riskPct}
              onChange={(e) => setRiskPct(e.target.value)}
              className="h-8 border-white/10 bg-black/40 font-mono text-[12px]"
            />
            <p className="text-[9.5px] text-zinc-600">aturan profesional: ≤ 1–2%</p>
          </div>
          <div className="space-y-1">
            <Label className="text-[11.5px] text-zinc-300">Maks posisi terbuka</Label>
            <Input
              type="number" min="1" max="10" value={maxOpen}
              onChange={(e) => setMaxOpen(e.target.value)}
              className="h-8 border-white/10 bg-black/40 font-mono text-[12px]"
            />
            <p className="text-[9.5px] text-zinc-600">diversifikasi antar pair</p>
          </div>
          <div className="space-y-1">
            <Label className="text-[11.5px] text-zinc-300">Batas loss harian (%)</Label>
            <Input
              type="number" min="1" max="30" value={dailyLoss}
              onChange={(e) => setDailyLoss(e.target.value)}
              className="h-8 border-white/10 bg-black/40 font-mono text-[12px]"
            />
            <p className="text-[9.5px] text-zinc-600">kaidah PTJ: pertahankan modal</p>
          </div>
          <div className="space-y-1">
            <Label className={cn('text-[11.5px]', state.positions.length ? 'text-zinc-600' : 'text-zinc-300')}>
              Ekuitas awal PAPER ($)
            </Label>
            <Input
              type="number" min="100" step="100" value={startEquity} disabled={state.positions.length > 0}
              onChange={(e) => setStartEquity(e.target.value)}
              className="h-8 border-white/10 bg-black/40 font-mono text-[12px] disabled:opacity-50"
            />
            <p className="text-[9.5px] text-zinc-600">{state.positions.length ? 'terkunci saat ada posisi' : 'modal simulasi'}</p>
          </div>
        </div>

        <Alert className="border-emerald-500/20 bg-emerald-500/5">
          <Info className="h-4 w-4 text-emerald-400" />
          <AlertDescription className="text-[11px] leading-relaxed text-zinc-400">
            <b className="text-zinc-200">PAPER</b> mengeksekusi sinyal dengan harga real-time Binance + slippage &
            fee 0.1% — hasil mewakili kondisi pasar nyata. <b className="text-zinc-200">LIVE</b> mengirim order
            market sesungguhnya (default: Binance Testnet untuk uji aman).
          </AlertDescription>
        </Alert>
      </div>

      <DialogFooter>
        <Button variant="outline" size="sm" onClick={onClose} className="border-white/15 bg-white/[0.03]">
          Batal
        </Button>
        <Button size="sm" onClick={handleSave} className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400">
          <Save className="mr-1.5 h-3.5 w-3.5" /> Simpan Pengaturan
        </Button>
      </DialogFooter>
    </>
  )
}

export function SettingsDialog({ open, onOpenChange, state, onSave }: SettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-white/10 bg-zinc-950 text-zinc-100 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[15px]">
            <KeyRound className="h-4 w-4 text-emerald-400" /> Pengaturan Bot Trading
          </DialogTitle>
          <DialogDescription className="text-[12px] text-zinc-500">
            Koneksi pasar sungguhan Binance Spot + parameter risiko profesional.
          </DialogDescription>
        </DialogHeader>
        {state && open && <SettingsForm state={state} onSave={onSave} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}
