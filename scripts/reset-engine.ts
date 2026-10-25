import { io } from 'socket.io-client'
const socket = io('http://127.0.0.1:3003', { path: '/', transports: ['polling'] })
socket.on('connect', () => {
  socket.emit('control', { action: 'reset' })
  socket.emit('control', { action: 'start' })
  setTimeout(() => { console.log('engine direset + RUNNING'); process.exit(0) }, 800)
})
setTimeout(() => process.exit(1), 5000)
