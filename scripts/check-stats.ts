import { io } from 'socket.io-client'
const socket = io('http://127.0.0.1:3003', { path: '/', transports: ['polling'] })
socket.on('connect', () => socket.emit('hello'))
socket.on('state', (s: any) => {
  const st = s.stats
  console.log(`tick=${s.tick} equity=$${s.account.equity.toFixed(2)} (${s.account.pnlPct.toFixed(0)}%) maxDD=${s.account.maxDrawdownPct.toFixed(1)}%`)
  console.log(`trades=${st.trades} W=${st.wins} L=${st.losses} WR=${st.winRate.toFixed(1)}% PF=${st.profitFactor.toFixed(2)} E=${st.expectancyPct.toFixed(2)}%/trade avgSlip=${st.avgSlippagePct.toFixed(2)}%`)
  console.log(`avgWin=${st.avgWinPct.toFixed(1)}% avgLoss=${st.avgLossPct.toFixed(1)}% pos=${s.positions.length} rugDicegah=${st.rejectedRugs}`)
  console.log(`curve_points=${s.equityCurve.length} activity=${s.activity.length}`)
  console.log('exit reasons terakhir:', s.trades.slice(0, 8).map((t: any) => `${t.symbol}:${t.win ? 'W' : 'L'}${t.pnlPct.toFixed(0)}%`).join(' '))
  process.exit(0)
})
setTimeout(() => process.exit(1), 8000)
