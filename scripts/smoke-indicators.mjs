/**
 * Smoke test for real technical indicators.
 *
 * Proves the indicators produce correct values on known input:
 *   1. RSI from a real BTC candle series lands in a sane range
 *   2. A monotonically rising series drives RSI to 100
 *   3. A monotonically falling series drives RSI to 0
 *   4. MACD signal line is a true EMA of the MACD line (not a scaled fake)
 *   5. Insufficient data returns null rather than a fabricated midpoint
 *   6. Live BTC RSI/MACD computed from real Binance candles is stable
 *
 * Run: node scripts/smoke-indicators.mjs
 */

import {
  calculateRSI,
  calculateMACD,
  calculateATR,
  volumeRatio,
  rangePosition,
} from '../dist/technical-indicators.js';
import { MarketDataProvider } from '../dist/market-data.js';

let failures = 0;

function check(label, condition, detail = '') {
  const mark = condition ? 'PASS' : 'FAIL';
  if (!condition) failures++;
  console.log(`  [${mark}] ${label}${detail ? ` :: ${detail}` : ''}`);
}

console.log('\n=== 1. RSI on a real BTC daily series ===');
const provider = new MarketDataProvider({ cacheTtlMs: 0 });
const candles = await provider.getCandles('BTCUSDT', '1d', 200);
const closes = candles.map((c) => c.close);

const rsi = calculateRSI(closes, 14);
console.log(`  BTC 14-period RSI: ${rsi === null ? 'null' : rsi.toFixed(2)}`);
check('RSI is a number', typeof rsi === 'number');
check('RSI within 0-100', rsi > 0 && rsi < 100);
check('RSI is not a placeholder 50', rsi !== 50, `got ${rsi?.toFixed(2)}`);

console.log('\n=== 2. RSI edge cases ===');
const rising = Array.from({ length: 40 }, (_, i) => 100 + i);
const falling = Array.from({ length: 40 }, (_, i) => 100 - i);
check('rising series -> RSI 100', calculateRSI(rising) === 100, `${calculateRSI(rising)}`);
check('falling series -> RSI 0', calculateRSI(falling) === 0, `${calculateRSI(falling)}`);

console.log('\n=== 3. Insufficient data returns null, not a fake midpoint ===');
check('short series -> null', calculateRSI([1, 2, 3]) === null);
check('short series MACD -> null', calculateMACD([1, 2, 3]) === null);

console.log('\n=== 4. MACD uses a real EMA signal line ===');
const macd = calculateMACD(closes);
console.log(
  `  MACD=${macd.macd} signal=${macd.signal} histogram=${macd.histogram}`
);
check('MACD present', macd !== null);
check(
  'histogram equals macd - signal',
  Math.abs(macd.histogram - (macd.macd - macd.signal)) < 1e-6,
  `${macd.histogram} vs ${macd.macd - macd.signal}`
);
// The old implementation returned signal = macd * 0.8 and histogram = macd * 0.2,
// i.e. histogram was always a fixed 20% of macd. A real EMA signal line has no
// such fixed ratio, so verify the relationship is not that constant.
const fakeHistogram = macd.macd * 0.2;
check(
  'histogram is not the old fixed 20% of macd',
  Math.abs(macd.histogram - fakeHistogram) > 1e-6 ||
    Math.abs(macd.macd) < 1e-9,
  `real=${macd.histogram} fake=${fakeHistogram.toFixed ? fakeHistogram.toFixed(4) : fakeHistogram}`
);

console.log('\n=== 5. Other indicators on real candles ===');
const atr = calculateATR(candles, 14);
const volRatio = volumeRatio(candles, 20);
const pos = rangePosition(closes[closes.length - 1], candles[candles.length - 1].low, candles[candles.length - 1].high);
console.log(`  ATR(14)=$${atr?.toFixed(2)} volumeRatio=${volRatio?.toFixed(2)} rangePosition=${pos.toFixed(1)}%`);
check('ATR positive', atr > 0);
check('volume ratio positive', volRatio > 0);
check('range position 0-100', pos >= 0 && pos <= 100);

console.log('\n=== 6. Indicators are deterministic ===');
const rsi2 = calculateRSI(closes, 14);
const macd2 = calculateMACD(closes);
check('RSI reproducible', rsi === rsi2);
check('MACD reproducible', macd.macd === macd2.macd && macd.signal === macd2.signal);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
