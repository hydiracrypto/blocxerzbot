// ============================================================
// NEXUS-6 · Market Simulator
// Simulasi pasar memecoin DEX: listing baru, spike volume,
// pump, dump, rug pull — dengan "hidden intent" untuk scam pair.
// ============================================================

export type Phase = 'quiet' | 'accum' | 'spike' | 'pump' | 'dump' | 'decay' | 'rug' | 'dead'

export interface Pair {
  id: string
  symbol: string
  chain: string
  price: number
  lastPrice: number
  changePct: number
  liquidity: number
  vol24h: number
  volHist: number[]
  holders: number
  top10: number
  lpLocked: boolean
  honeypot: boolean
  renounced: boolean
  mintDisabled: boolean
  age: number
  phase: Phase
  phaseT: number
  z: number
  spikePct: number
  rugScore: number | null
  decision: 'WAIT' | 'ANALYZING' | 'SKIP' | 'REJECT' | 'ENTER' | 'HOLD'
  reason: string
  status: 'watch' | 'held' | 'rejected' | 'dead'
  queued: boolean
  // hidden (tidak pernah dikirim ke client)
  rugIntent: boolean
  rugAt: number
  lastInterestingTick: number
}

const NAMES = [
  'PEPE', 'MOON', 'DOGE', 'SHIB', 'WOJAK', 'TURBO', 'BONK', 'FLOKI', 'BRETT', 'POPCAT',
  'GIGA', 'MUMU', 'NEIRO', 'TOSHI', 'MEW', 'PONKE', 'HARAMBE', 'SNEK', 'GOAT', 'PNUT',
  'MOODENG', 'FWOG', 'APU', 'BOME', 'SLERF', 'MYRO', 'WEN', 'JELLY', 'ZEREBRO', 'MOG',
  'CHILLGUY', 'GNON', 'SPX', 'MAGA', 'LANDWOLF', 'NIKKE',
]
const SUFFIX = ['', '', '2.0', 'AI', 'INU', 'KING', 'X', 'MAX', '404', 'PRO']
const CHAINS = ['SOL', 'WETH', 'BNB', 'BASE', 'ARB', 'SUI']

export const rnd = (a: number, b: number) => a + Math.random() * (b - a)
export const irnd = (a: number, b: number) => Math.floor(rnd(a, b + 1))
export const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]
export const chance = (p: number) => Math.random() < p
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
export const gauss = () => (Math.random() + Math.random() + Math.random() + Math.random() - 2) / 2

const usedNames = new Set<string>()

function genSymbol(): string {
  for (let i = 0; i < 24; i++) {
    const s = pick(NAMES) + pick(SUFFIX)
    if (!usedNames.has(s)) {
      usedNames.add(s)
      return s
    }
  }
  return 'TKN' + irnd(100, 999)
}

export function makePair(tick: number): Pair {
  const scam = chance(0.3)
  const honeypot = scam && chance(0.42)
  const rugIntent = !honeypot && scam && chance(0.5)
  return {
    id: Math.random().toString(36).slice(2, 10),
    symbol: genSymbol(),
    chain: pick(CHAINS),
    price: Math.pow(10, rnd(-6, -3.4)),
    lastPrice: 0,
    changePct: 0,
    liquidity: rnd(9000, 240000),
    vol24h: rnd(4000, 90000),
    volHist: [],
    holders: scam ? irnd(14, 110) : irnd(80, 950),
    top10: scam ? rnd(42, 84) : rnd(9, 36),
    lpLocked: scam ? chance(0.28) : chance(0.82),
    honeypot,
    renounced: scam ? chance(0.22) : chance(0.78),
    mintDisabled: scam ? chance(0.3) : chance(0.88),
    age: 0,
    phase: 'quiet',
    phaseT: 0,
    z: 0,
    spikePct: 0,
    rugScore: null,
    decision: 'WAIT',
    reason: 'Baru terdeteksi — menunggu sinyal volume',
    status: 'watch',
    queued: false,
    rugIntent,
    rugAt: tick + irnd(10, 60),
    lastInterestingTick: tick,
  }
}

function enterPhase(p: Pair, ph: Phase) {
  p.phase = ph
  p.phaseT = 0
}

export function volumeZ(p: Pair): { z: number; spikePct: number } {
  const h = p.volHist
  if (h.length < 8) return { z: 0, spikePct: 0 }
  const mean = h.reduce((a, b) => a + b, 0) / h.length
  const std = Math.sqrt(h.reduce((a, b) => a + (b - mean) ** 2, 0) / h.length) || mean * 0.01
  const z = (h[h.length - 1] - mean) / std
  return { z, spikePct: mean > 0 ? (h[h.length - 1] / mean - 1) * 100 : 0 }
}

export interface RugResult {
  score: number
  notes: { label: string; pass: boolean }[]
}

export function computeRugScore(p: Pair): RugResult {
  let s = 0
  const notes: { label: string; pass: boolean }[] = []
  const add = (label: string, pass: boolean, penalty: number) => {
    notes.push({ label, pass })
    if (!pass) s += penalty
  }
  add('Honeypot simulation', !p.honeypot, 46)
  add('LP locked 12M+', p.lpLocked, 20)
  add('Contract renounced', p.renounced, 12)
  add('Mint auth disabled', p.mintDisabled, 10)
  if (p.top10 > 55) { s += 22; notes.push({ label: `Top10 holders ${p.top10.toFixed(0)}% (ekstrem)`, pass: false }) }
  else if (p.top10 > 35) { s += 10; notes.push({ label: `Top10 holders ${p.top10.toFixed(0)}% (tinggi)`, pass: false }) }
  else notes.push({ label: `Top10 holders ${p.top10.toFixed(0)}% sehat`, pass: true })
  if (p.holders < 50) { s += 16; notes.push({ label: `Holder ${p.holders} (sangat sedikit)`, pass: false }) }
  else if (p.holders < 120) { s += 8; notes.push({ label: `Holder ${p.holders} (sedikit)`, pass: false }) }
  else notes.push({ label: `Holder ${p.holders} ok`, pass: true })
  if (p.liquidity < 12000) { s += 14; notes.push({ label: `Likuiditas tipis $${(p.liquidity / 1000).toFixed(1)}k`, pass: false }) }
  else if (p.liquidity < 30000) { s += 7; notes.push({ label: `Likuiditas $${(p.liquidity / 1000).toFixed(1)}k`, pass: false }) }
  else notes.push({ label: `Likuiditas $${(p.liquidity / 1000).toFixed(0)}k cukup`, pass: true })
  if (p.age < 5) { s += 6; notes.push({ label: 'Umur < 5 tick (terlalu baru)', pass: false }) }
  s = clamp(s + rnd(-4, 4), 0, 100)
  return { score: Math.round(s), notes }
}

export function tickPair(p: Pair, tick: number) {
  p.age++
  p.lastPrice = p.price
  const baseline = p.liquidity * rnd(0.015, 0.05)
  let vol = baseline

  // rug intent meledak kapan pun jadwalnya
  if (p.rugIntent && tick >= p.rugAt && p.phase !== 'rug' && p.phase !== 'dead') enterPhase(p, 'rug')

  switch (p.phase) {
    case 'quiet':
      p.price *= 1 + gauss() * 0.006
      if (chance(0.012)) enterPhase(p, 'accum')
      break
    case 'accum':
      p.price *= 1 + gauss() * 0.01 + 0.004
      vol = baseline * rnd(1.5, 2.5)
      if (chance(0.11)) enterPhase(p, 'spike')
      break
    case 'spike':
      vol = baseline * rnd(4, 11)
      p.price *= 1 + gauss() * 0.012 + 0.007
      p.phaseT++
      if (p.phaseT > irnd(1, 2)) enterPhase(p, chance(0.56) ? 'pump' : 'dump') // 44% fakeout → dump
      break
    case 'pump':
      p.price *= 1 + rnd(0.025, 0.095)
      vol = baseline * rnd(3, 7)
      p.phaseT++
      if (p.phaseT > irnd(3, 6)) enterPhase(p, 'dump')
      break
    case 'dump':
      p.price *= 1 - rnd(0.03, 0.085)
      vol = baseline * rnd(4, 8)
      p.phaseT++
      if (p.phaseT > irnd(2, 4)) enterPhase(p, 'decay')
      break
    case 'decay':
      p.price *= 1 - rnd(0.004, 0.014)
      vol = baseline * rnd(0.4, 0.9)
      p.phaseT++
      if (p.phaseT > 22 && chance(0.04)) enterPhase(p, 'accum')
      break
    case 'rug':
      p.price *= 1 - rnd(0.5, 0.82)
      vol = baseline * rnd(6, 12)
      p.phaseT++
      if (p.phaseT >= 2) enterPhase(p, 'dead')
      break
    case 'dead':
      p.price *= 1 + gauss() * 0.002
      vol = baseline * 0.08
      break
  }

  p.price = Math.max(p.price, 1e-10)
  p.changePct = p.lastPrice > 0 ? (p.price / p.lastPrice - 1) * 100 : 0
  p.vol24h = p.vol24h * 0.7 + vol * 0.3
  p.volHist.push(vol)
  if (p.volHist.length > 30) p.volHist.shift()
  const { z, spikePct } = volumeZ(p)
  p.z = z
  p.spikePct = spikePct
}
