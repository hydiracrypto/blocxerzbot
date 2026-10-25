// ============================================================
// APEX-5 · Persistence Store (SQLite via Prisma)
// Menyimpan: settings, trades (open/closed), equity curve.
// Engine tetap jalan in-memory; DB untuk ketahanan restart.
// Semua fungsi aman-gagal: DB error tidak menghentikan engine.
// ============================================================

import { PrismaClient } from '@prisma/client'
import path from 'node:path'

const dbFile = path.resolve(import.meta.dir, '../../db/custom.db')
const prisma = new PrismaClient({
  datasources: { db: { url: `file:${dbFile}` } },
  log: [{ emit: 'event', level: 'error' }],
})

export interface StoredTrade {
  id: string
  symbol: string
  strategy: string
  sizeUsd: number
  qty: number
  entryPrice: number
  exitPrice: number | null
  pnlUsd: number | null
  pnlPct: number | null
  feeUsd: number
  reason: string
  status: string
  mode: string
  entryTime: number
  exitTime: number | null
  meta: string | null
}

export const store = {
  async loadSettings(): Promise<Record<string, string>> {
    try {
      const rows = await prisma.botSetting.findMany()
      return Object.fromEntries(rows.map((r) => [r.key, r.value]))
    } catch {
      return {}
    }
  },

  async saveSetting(key: string, value: string): Promise<void> {
    try {
      await prisma.botSetting.upsert({ where: { key }, create: { key, value }, update: { value } })
    } catch {
      /* noop */
    }
  },

  async saveSettings(entries: Record<string, string>): Promise<void> {
    for (const [key, value] of Object.entries(entries)) await this.saveSetting(key, value)
  },

  async loadTrades(): Promise<StoredTrade[]> {
    try {
      const rows = await prisma.botTrade.findMany({ orderBy: { createdAt: 'asc' } })
      return rows.map((r) => ({
        id: r.id,
        symbol: r.symbol,
        strategy: r.strategy,
        sizeUsd: r.sizeUsd,
        qty: r.qty,
        entryPrice: r.entryPrice,
        exitPrice: r.exitPrice,
        pnlUsd: r.pnlUsd,
        pnlPct: r.pnlPct,
        feeUsd: r.feeUsd,
        reason: r.reason,
        status: r.status,
        mode: r.mode,
        entryTime: r.entryTime,
        exitTime: r.exitTime,
        meta: r.meta,
      }))
    } catch {
      return []
    }
  },

  async insertTrade(t: {
    id: string
    symbol: string
    strategy: string
    sizeUsd: number
    qty: number
    entryPrice: number
    feeUsd: number
    reason: string
    status: string
    mode: string
    entryTime: number
    meta: string
  }): Promise<void> {
    try {
      await prisma.botTrade.create({ data: t })
    } catch {
      /* noop */
    }
  },

  async closeTrade(id: string, patch: { exitPrice: number; pnlUsd: number; pnlPct: number; feeUsd: number; reason: string; exitTime: number }): Promise<void> {
    try {
      await prisma.botTrade.update({ where: { id }, data: { ...patch, status: 'CLOSED' } })
    } catch {
      /* noop */
    }
  },

  async updateTradeMeta(id: string, meta: string): Promise<void> {
    try {
      await prisma.botTrade.update({ where: { id }, data: { meta } })
    } catch {
      /* noop */
    }
  },

  async addEquityPoint(t: number, equity: number, cash: number): Promise<void> {
    try {
      await prisma.botEquity.create({ data: { t, equity, cash } })
    } catch {
      /* noop */
    }
  },

  async loadEquity(limit = 2000): Promise<{ t: number; equity: number; cash: number }[]> {
    try {
      const rows = await prisma.botEquity.findMany({ orderBy: { id: 'desc' }, take: limit })
      return rows.reverse().map((r) => ({ t: r.t, equity: r.equity, cash: r.cash }))
    } catch {
      return []
    }
  },

  async pruneEquity(keep = 2400): Promise<void> {
    try {
      const rows = await prisma.botEquity.findMany({ orderBy: { id: 'desc' }, take: keep, select: { id: true } })
      const minId = rows.length ? rows[rows.length - 1].id : 0
      await prisma.botEquity.deleteMany({ where: { id: { lt: minId } } })
    } catch {
      /* noop */
    }
  },

  async wipeAll(): Promise<void> {
    try {
      await prisma.botTrade.deleteMany()
      await prisma.botEquity.deleteMany()
      await prisma.botSetting.deleteMany()
    } catch {
      /* noop */
    }
  },
}
