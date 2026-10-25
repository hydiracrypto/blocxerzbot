// Tes lapisan market-data baru: 6 sumber, throttle, klines, tickers, universe
// Jalankan: npx tsx /home/z/my-project/scripts/test-market-data.ts
import {
  getKlines,
  getUniverse,
  getAllTickers,
  getSourceHealth,
} from '../src/lib/mexc/market-data'

async function main() {
  console.log('── 1) Universe ──')
  const t0 = Date.now()
  const uni = await getUniverse()
  console.log(`universe: ${uni.items.length} aset dari ${uni.source} (${Date.now() - t0}ms)`)

  console.log('── 2) Tickers ──')
  const t1 = Date.now()
  const tk = await getAllTickers()
  console.log(`tickers: ${tk.map.size} pair dari ${tk.source} (${Date.now() - t1}ms)`)

  console.log('── 3) Klines 6 TF × 3 simbol (BTC, ETH, SOL) ──')
  for (const sym of ['BTC_USDT', 'ETH_USDT', 'SOL_USDT']) {
    const t2 = Date.now()
    const parts: string[] = []
    for (const tf of ['15m', '30m', '1h', '4h', '1d', '1w'] as const) {
      const limit = tf === '15m' ? 1000 : tf === '30m' || tf === '1h' || tf === '4h' ? 400 : 40
      const k = await getKlines(sym, tf, limit)
      const last = k.candles[k.candles.length - 1]
      parts.push(`${tf}=${k.candles.length}b(${k.source},c=${last.c})`)
    }
    console.log(`${sym}: ${parts.join(' · ')} (${Date.now() - t2}ms)`)
  }

  console.log('── 4) Cache hit (panggil ulang) ──')
  const t3 = Date.now()
  await getKlines('BTC_USDT', '15m', 1000)
  console.log(`cache hit ${Date.now() - t3}ms`)

  console.log('── 5) Health semua sumber ──')
  for (const [k, v] of Object.entries(getSourceHealth())) {
    console.log(`${k.padEnd(16)} ok=${v.ok} fail=${v.failCount} ban=${v.bannedUntil ? 'YA' : '-'} ${v.banReason}`)
  }
  console.log('SELESAI ✓')
}

main().catch((e) => {
  console.error('GAGAL:', e)
  process.exit(1)
})
