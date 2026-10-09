/**
 * Smoke test for real portfolio + backtest engines.
 *
 * Proves:
 *   1. Portfolio metrics mark positions to supplied live prices
 *   2. Empty portfolio is honest (zero, not fabricated trade stats)
 *   3. Corrupt state files are rejected loudly
 *   4. Backtest runs over REAL Binance candles and reports provenance
 *   5. Backtest results are reproducible for identical input
 *   6. Backtest refuses to run with no data instead of inventing it
 *
 * Run: node scripts/smoke-portfolio-backtest.mjs
 */

import {
  calculatePortfolioMetrics,
  validatePortfolioState,
  emptyPortfolioState,
} from '../dist/portfolio-tracker.js';
import { runBacktest, defaultBacktestConfig } from '../dist/backtest-engine.js';
import { MarketDataProvider } from '../dist/market-data.js';

let failures = 0;

function check(label, condition, detail = '') {
  const mark = condition ? 'PASS' : 'FAIL';
  if (!condition) failures++;
  console.log(`  [${mark}] ${label}${detail ? ` :: ${detail}` : ''}`);
}

const provider = new MarketDataProvider({ cacheTtlMs: 0 });

console.log('\n=== 1. Portfolio marked to live prices ===');
const snap = await provider.getSnapshot(['BTCUSDT', 'ETHUSDT']);
const btc = parseFloat(snap.tickers.BTCUSDT.lastPr);
const eth = parseFloat(snap.tickers.ETHUSDT.lastPr);
console.log(`  live BTC=$${btc.toLocaleString()} ETH=$${eth.toLocaleString()}`);

const metrics = calculatePortfolioMetrics(
  [
    { symbol: 'BTCUSDT', amount: 0.05, entryPrice: btc * 0.98, currentPrice: btc, side: 'long', openedAt: Date.now() },
    { symbol: 'ETHUSDT', amount: 2.5, entryPrice: eth * 1.02, currentPrice: eth, side: 'long', openedAt: Date.now() },
  ],
  0,
  [],
  5000
);
console.log(
  `  totalValue=$${metrics.totalValue.toFixed(2)} unrealized=$${metrics.unrealizedPnL.toFixed(2)}`
);
check('total value includes cash', Math.abs(metrics.totalValue - (0.05 * btc + 2.5 * eth + 5000)) < 0.01);
check('realized PnL honoured', metrics.realizedPnL === 0);
check('unrealized PnL is real', metrics.unrealizedPnL !== 0);
check('no fabricated trade count', metrics.totalTrades === 0);
check('no fabricated win rate', metrics.winRate === 0);
check('allocation sums to ~100%', Math.abs(metrics.allocation.reduce((s, a) => s + a.percentage, 0) - 100) < 0.01);

console.log('\n=== 2. Empty portfolio is honest ===');
const empty = calculatePortfolioMetrics([], 0, [], 10000);
check('value equals cash', empty.totalValue === 10000);
check('zero PnL', empty.totalPnL === 0);
check('zero trades', empty.totalTrades === 0);
check('no positions', empty.positions.length === 0);

console.log('\n=== 3. Corrupt state is rejected loudly ===');
const badCases = [
  ['non-object', 'not an object'],
  ['missing cash', { positions: [], tradeHistory: [] }],
  ['bad position side', { cash: 0, positions: [{ symbol: 'BTCUSDT', amount: 1, entryPrice: 1, side: 'sideways', openedAt: 0 }], tradeHistory: [] }],
  ['negative amount', { cash: 0, positions: [{ symbol: 'BTCUSDT', amount: -1, entryPrice: 1, side: 'long', openedAt: 0 }], tradeHistory: [] }],
];
for (const [label, input] of badCases) {
  let threw = false;
  try {
    validatePortfolioState(input);
  } catch {
    threw = true;
  }
  check(`rejects ${label}`, threw);
}
const good = validatePortfolioState(emptyPortfolioState());
check('accepts a valid empty state', good.cash === 10000 && good.positions.length === 0);

console.log('\n=== 4. Backtest over REAL candles ===');
const candles = await provider.getCandles('BTCUSDT', '1d', 200);
const bt = runBacktest(candles, defaultBacktestConfig(), {
  symbol: 'BTCUSDT',
  interval: '1d',
  source: 'binance',
});
console.log(
  `  ${bt.candleCount} candles, ${bt.totalTrades} trades, ` +
    `return ${bt.totalReturnPercent.toFixed(2)}%, winRate ${bt.winRate.toFixed(1)}%, ` +
    `maxDD ${bt.maxDrawdownPercent.toFixed(2)}%`
);
check('used all real candles', bt.candleCount === 200);
check('provenance recorded', bt.symbol === 'BTCUSDT' && bt.source === 'binance' && bt.isLive === true);
check('period is a real date range', bt.periodEnd > bt.periodStart && bt.periodStart > 0);
check('equity curve matches candle count', bt.equityCurve.length === 200);
check('trade count is plausible', bt.totalTrades >= 0 && bt.totalTrades <= 50);
check('win+loss reconciles with total', bt.winningTrades + bt.losingTrades === bt.totalTrades);
check(
  'equity curve is finite',
  bt.equityCurve.every((p) => Number.isFinite(p.value)),
  `first=${bt.equityCurve[0].value.toFixed(2)} last=${bt.equityCurve[bt.equityCurve.length - 1].value.toFixed(2)}`
);

console.log('\n=== 5. Backtest is reproducible ===');
const bt2 = runBacktest(candles, defaultBacktestConfig(), { symbol: 'BTCUSDT', interval: '1d', source: 'binance' });
check(
  'identical input -> identical result',
  bt.totalTrades === bt2.totalTrades && bt.totalReturn === bt2.totalReturn
);

console.log('\n=== 6. Backtest refuses to invent data ===');
let threw = false;
try {
  runBacktest([], defaultBacktestConfig(), { symbol: 'BTCUSDT', interval: '1d', source: 'none' });
} catch {
  threw = true;
}
check('empty candles throws', threw);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
