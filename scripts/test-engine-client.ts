// Test client v2: verifikasi penuh kontrol engine (pause/resume/speed/reset)
import { io } from 'socket.io-client'

const socket = io('http://127.0.0.1:3003', {
  path: '/',
  transports: ['websocket', 'polling'],
  timeout: 5000,
})

let count = 0
let tickAtResume = 0
let phase = 'observe' // observe -> paused -> resumed -> reset
let observedAt = 0

socket.on('connect', () => {
  console.log('CONNECTED')
  socket.emit('control', { action: 'start' }) // pastikan engine berjalan
})

socket.on('state', (s: any) => {
  count++
  console.log(`#${count} tick=${s.tick} status=${s.status} speed=${s.speed}x equity=$${s.account.equity.toFixed(2)} pos=${s.positions.length} curve=${s.equityCurve.length}`)

  if (phase === 'observe' && count >= 4) {
    phase = 'paused'
    socket.emit('control', { action: 'pause' })
    socket.emit('hello')
  } else if (phase === 'paused' && s.status === 'PAUSED') {
    console.log('  ✓ PAUSE bekerja')
    phase = 'resumed'
    tickAtResume = s.tick
    socket.emit('control', { action: 'speed', value: 4 })
    socket.emit('control', { action: 'start' })
    socket.emit('hello')
    setTimeout(() => {
      observedAt = Date.now()
      socket.emit('hello') // 3 detik kemudian cek tick bertambah ~12 (4x)
    }, 3000)
  } else if (phase === 'resumed' && s.speed === 4 && s.status === 'RUNNING' && observedAt > 0) {
    const delta = s.tick - tickAtResume
    console.log(`  ✓ RESUME + SPEED 4x bekerja · tick naik ${delta} dalam ~3s (harapannya ~12)`)
    phase = 'reset'
    socket.emit('control', { action: 'reset' })
    socket.emit('hello')
  } else if (phase === 'reset' && s.status === 'RUNNING' && s.tick < 5 && s.account.equity < 20) {
    console.log(`  ✓ RESET bekerja · tick=${s.tick} equity=$${s.account.equity.toFixed(2)} (harus ~14.82)`)
    console.log('SEMUA TES LULUS')
    socket.disconnect()
    process.exit(0)
  }
})

socket.on('connect_error', (e: any) => {
  console.error('CONNECT_ERROR', e.message)
  process.exit(1)
})

setTimeout(() => { console.error('TIMEOUT — phase terakhir:', phase); process.exit(1) }, 40000)
