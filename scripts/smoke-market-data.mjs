/**
 * Smoke test for the real market data provider.
 *
 * Proves that:
 *   1. Live prices are fetched from a real exchange (isLive === true)
 *   2. Failover works when the primary source is unavailable
 *   3. Real candles are returned for indicator calculation
 *   4. Simulated data is never silently substituted
 *
 * Run: node scripts/smoke-market-data.mjs
 */

import { MarketDataProvider } from '../dist/market-data.js';

const provider = new MarketDataProvider({ cacheTtlMs: 0 });
let failures = 0;

function check(label, condition, detail = '') {
  const mark = condition ? 'PASS' : 'FAIL';
  if (!condition) failures++;
  console.log(`  [${mark}] ${label}${detail ? ` :: ${detail}` : ''}`);
}

console.log('\n=== 1. Live snapshot from default source order ===');
try {
  const snap = await provider.getSnapshot(['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT']);
  console.log(`  source=${snap.source} isLive=${snap.isLive} cached=${snap.cached}`);
  for (const [sym, t] of Object.entries(snap.tickers)) {
    console.log(
      `    ${sym.padEnd(9)} $${parseFloat(t.lastPr).toLocaleString().padEnd(14)} ` +
        `${(parseFloat(t.change24h) * 100).toFixed(2).padStart(7)}%  [${t.source}]`
    );
  }
  check('isLive is true', snap.isLive === true);
  check('source is a real exchange', ['coingecko', 'binance', 'bitget'].includes(snap.source));
  check('all 4 symbols returned', Object.keys(snap.tickers).length === 4);
  check(
    'prices are plausible (BTC > 1000)',
    parseFloat(snap.tickers.BTCUSDT.lastPr) > 1000,
    `BTC=$${snap.tickers.BTCUSDT.lastPr}`
  );
  check('every ticker flagged live', Object.values(snap.tickers).every((t) => t.isLive === true));
} catch (err) {
  console.log(`  [FAIL] snapshot threw: ${err.message}`);
  failures++;
}

console.log('\n=== 2. Failover: primary source forced to fail ===');
try {
  const fallback = new MarketDataProvider({
    sourceOrder: ['bitget', 'binance'], // bitget will fail (DNS), binance should answer
    cacheTtlMs: 0,
  });
  const snap = await fallback.getSnapshot(['BTCUSDT']);
  console.log(`  source=${snap.source} errors=${JSON.stringify(snap.errors)}`);
  check('recovered to a live source', snap.isLive === true);
  check('reported the failed source', snap.errors.length > 0, snap.errors[0] ?? '');
} catch (err) {
  console.log(`  [FAIL] failover threw: ${err.message}`);
  failures++;
}

console.log('\n=== 3. Real candles for indicators ===');
try {
  const candles = await provider.getCandles('BTCUSDT', '1d', 200);
  console.log(`  received ${candles.length} candles`);
  console.log(
    `  latest close: $${candles[candles.length - 1].close.toLocaleString()} ` +
      `@ ${new Date(candles[candles.length - 1].timestamp).toISOString().slice(0, 10)}`
  );
  check('200 candles returned', candles.length === 200);
  check('candles have sane OHLC', candles.every((c) => c.high >= c.low && c.close > 0));
  check('candles are chronological', candles.every((c, i) => i === 0 || c.timestamp > candles[i - 1].timestamp));
} catch (err) {
  console.log(`  [FAIL] candles threw: ${err.message}`);
  failures++;
}

console.log('\n=== 4. No silent simulation (all sources dead) ===');
try {
  const dead = new MarketDataProvider({
    sourceOrder: ['bitget'],
    cacheTtlMs: 0,
    allowSimulated: false,
  });
  await dead.getSnapshot(['BTCUSDT']);
  console.log('  [FAIL] expected a throw, got data back');
  failures++;
} catch (err) {
  check('throws instead of faking data', /All live market data sources failed/.test(err.message));
}

console.log('\n=== 5. Simulation is explicit when opted in ===');
try {
  const sim = new MarketDataProvider({ sourceOrder: ['bitget'], cacheTtlMs: 0, allowSimulated: true });
  const snap = await sim.getSnapshot(['BTCUSDT']);
  check('isLive is false', snap.isLive === false);
  check('source labelled simulated', snap.source === 'simulated');
} catch (err) {
  console.log(`  [FAIL] opt-in simulation threw: ${err.message}`);
  failures++;
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
