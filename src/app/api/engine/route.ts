import { NextResponse } from 'next/server'
import net from 'node:net'
import { spawn } from 'node:child_process'
import path from 'node:path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ENGINE_PORT = 3003

function isPortOpen(port: number, timeout = 700): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    const done = (ok: boolean) => {
      socket.destroy()
      resolve(ok)
    }
    socket.setTimeout(timeout)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
    socket.connect(port, '127.0.0.1')
  })
}

let spawning = false

export async function POST() {
  try {
    if (await isPortOpen(ENGINE_PORT)) {
      return NextResponse.json({ ok: true, already: true })
    }
    if (spawning) {
      return NextResponse.json({ ok: true, spawning: true })
    }
    spawning = true
    try {
      const cwd = path.join(process.cwd(), 'mini-services', 'trading-engine')
      const child = spawn('bun', ['index.ts'], {
        cwd,
        detached: true,
        stdio: 'ignore',
        env: { ...process.env },
      })
      child.unref()
      // tunggu port terbuka (maks 6 detik)
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 200))
        if (await isPortOpen(ENGINE_PORT)) {
          return NextResponse.json({ ok: true, spawned: true })
        }
      }
      return NextResponse.json({ ok: false, error: 'engine gagal start' }, { status: 502 })
    } finally {
      spawning = false
    }
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ alive: await isPortOpen(ENGINE_PORT) })
}
