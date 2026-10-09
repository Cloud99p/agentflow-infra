/**
 * Smoke test for portfolio MUTATIONS (open/close) and the backtest runner.
 *
 * Proves the portfolio does what it is supposed to do: cash moves correctly,
 * cost basis is preserved, realized PnL reconciles, closed positions leave the
 * book, and invalid input is rejected rather than silently accepted.
 *
 * Run: node scripts/smoke-portfolio-mutations.mjs
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  openPosition,
  closePosition,
  emptyPortfolioState,
  calculatePortfolioMetrics,
  validatePortfolioState,
  savePortfolioState,
  isValidSymbol,
} from '../dist/portfolio-tracker.js';

let failures = 0;

function check(label, condition, detail = '') {
  if (!condition) failures++;
  console.log(`  [${condition ? 'PASS' : 'FAIL'}] ${label}${detail ? ` :: ${detail}` : ''}`);
}

function expectThrow(label, fn) {
  let threw = false;
  let msg = '';
  try {
    fn();
  } catch (e) {
    threw = true;
    msg = e.message;
  }
  check(label, threw, threw ? msg.slice(0, 60) : 'DID NOT THROW');
}

console.log('\n=== 1. Symbol validation ===');
check('accepts BTCUSDT', isValidSymbol('BTCUSDT'));
check('accepts ETHUSDT', isValidSymbol('ETHUSDT'));
check('rejects lowercase', !isValidSymbol('btcusdt'));
check('rejects path traversal', !isValidSymbol('../../etc/passwd'));
check('rejects URL injection', !isValidSymbol('BTC&foo=bar'));
check('rejects empty', !isValidSymbol(''));

console.log('\n=== 2. Open a long position ===');
{
  const s = emptyPortfolioState();
  const startCash = s.cash;
  openPosition(s, { symbol: 'BTCUSDT', amount: 0.1, entryPrice: 50000 });

  check('position recorded', s.positions.length === 1);
  check('symbol uppercased', s.positions[0].symbol === 'BTCUSDT');
  check('side defaults to long', s.positions[0].side === 'long');
  check(
    'cost deducted from cash (0.1 * 50000 = 5000)',
    Math.abs(s.cash - (startCash - 5000)) < 1e-9,
    `cash=$${s.cash}`
  );
  check('updatedAt advanced', s.updatedAt !== s.createdAt);
}

console.log('\n=== 3. Cash conservation: open then close at break-even ===');
{
  const s = emptyPortfolioState();
  const startCash = s.cash;
  openPosition(s, { symbol: 'BTCUSDT', amount: 0.1, entryPrice: 50000 });
  closePosition(s, { symbol: 'BTCUSDT', exitPrice: 50000 });

  check('position removed', s.positions.length === 0);
  check('trade recorded', s.tradeHistory.length === 1);
  check('break-even PnL is zero', Math.abs(s.tradeHistory[0].pnl) < 1e-9, `pnl=${s.tradeHistory[0].pnl}`);
  check(
    'cash returned to start (no money created or lost)',
    Math.abs(s.cash - startCash) < 1e-9,
    `cash=$${s.cash} vs start $${startCash}`
  );
  check('realizedPnL is zero', Math.abs(s.realizedPnL) === 0);
}

console.log('\n=== 4. Winning long ===');
{
  const s = emptyPortfolioState();
  openPosition(s, { symbol: 'ETHUSDT', amount: 2, entryPrice: 2000 }); // cost 4000
  const trade = closePosition(s, { symbol: 'ETHUSDT', exitPrice: 2500 }); // +1000

  check('gross PnL is +1000', Math.abs(trade.pnl - 1000) < 1e-9, `pnl=${trade.pnl}`);
  check('cash = 10000 - 4000 + 5000 = 11000', Math.abs(s.cash - 11000) < 1e-9, `cash=$${s.cash}`);
  check('realizedPnL = +1000', Math.abs(s.realizedPnL - 1000) < 1e-9);

  const m = calculatePortfolioMetrics(s.positions, s.realizedPnL, s.tradeHistory, s.cash);
  check('metrics show +1000 total PnL', Math.abs(m.totalPnL - 1000) < 1e-9);
  check('win rate 100%', m.winRate === 100);
  check('total value 11000', Math.abs(m.totalValue - 11000) < 1e-9, `$${m.totalValue}`);
}

console.log('\n=== 5. Losing long ===');
{
  const s = emptyPortfolioState();
  openPosition(s, { symbol: 'ETHUSDT', amount: 2, entryPrice: 2000 });
  const trade = closePosition(s, { symbol: 'ETHUSDT', exitPrice: 1800 }); // -400

  check('gross PnL is -400', Math.abs(trade.pnl + 400) < 1e-9, `pnl=${trade.pnl}`);
  check('cash = 10000 - 4000 + 3600 = 9600', Math.abs(s.cash - 9600) < 1e-9, `cash=$${s.cash}`);

  const m = calculatePortfolioMetrics(s.positions, s.realizedPnL, s.tradeHistory, s.cash);
  check('win rate 0%', m.winRate === 0);
  check('losing trades = 1', m.losingTrades === 1);
}

console.log('\n=== 6. Short position ===');
{
  const s = emptyPortfolioState();
  openPosition(s, { symbol: 'BTCUSDT', amount: 0.1, entryPrice: 50000, side: 'short' });
  const trade = closePosition(s, { symbol: 'BTCUSDT', exitPrice: 45000 });
  check('short profits when price falls', Math.abs(trade.pnl - 500) < 1e-9, `pnl=${trade.pnl}`);
  check('side recorded as short', trade.side === 'short');
}

console.log('\n=== 7. Fees reduce PnL and are credited back to cash ===');
{
  const s0 = emptyPortfolioState();
  openPosition(s0, { symbol: 'BTCUSDT', amount: 0.1, entryPrice: 50000 });
  closePosition(s0, { symbol: 'BTCUSDT', exitPrice: 50000, feeRate: 0.001 });

  const trade = s0.tradeHistory[0];
  const expectedFee = (50000 + 50000) * 0.1 * 0.001; // 10
  check('fee charged', Math.abs(trade.fees - expectedFee) < 1e-9, `fees=${trade.fees}`);
  check('net PnL is negative by the fee', Math.abs(trade.pnl + expectedFee) < 1e-9, `pnl=${trade.pnl}`);
  check(
    'cash reflects the fee loss exactly',
    Math.abs(s0.cash - (10000 - expectedFee)) < 1e-9,
    `cash=$${s0.cash} expected $${10000 - expectedFee}`
  );
}

console.log('\n=== 8. Multiple positions and partial closes ===');
{
  const s = emptyPortfolioState();
  openPosition(s, { symbol: 'BTCUSDT', amount: 0.1, entryPrice: 50000 });
  openPosition(s, { symbol: 'ETHUSDT', amount: 1, entryPrice: 2000 });
  check('two positions open', s.positions.length === 2);
  check('cash = 10000 - 5000 - 2000 = 3000', Math.abs(s.cash - 3000) < 1e-9, `cash=$${s.cash}`);

  closePosition(s, { symbol: 'ETHUSDT', exitPrice: 2100 });
  check('one position remains', s.positions.length === 1);
  check('remaining position is BTC', s.positions[0].symbol === 'BTCUSDT');

  const m = calculatePortfolioMetrics(s.positions, s.realizedPnL, s.tradeHistory, s.cash);
  check('unrealized is zero (positions not yet marked)', m.unrealizedPnL === 0);
  check('metrics stay finite with a position open', Number.isFinite(m.totalValue), `$${m.totalValue}`);
  // 10000 - 5000 (BTC) - 2000 (ETH) = 3000, then ETH returns 2100 at market.
  check('cash is 5100 after opening BTC and closing ETH', Math.abs(s.cash - 5100) < 1e-9, `$${s.cash}`);
  check('unmarked position is reported, not silently priced', m.skippedPositions.includes('BTCUSDT'));
}

console.log('\n=== 9. Invalid input is rejected ===');
{
  const s = emptyPortfolioState();
  expectThrow('rejects overspend', () => openPosition(s, { symbol: 'BTCUSDT', amount: 1, entryPrice: 50000 }));
  expectThrow('rejects negative amount', () => openPosition(s, { symbol: 'BTCUSDT', amount: -1, entryPrice: 50000 }));
  expectThrow('rejects zero price', () => openPosition(s, { symbol: 'BTCUSDT', amount: 1, entryPrice: 0 }));
  expectThrow('rejects NaN price', () => openPosition(s, { symbol: 'BTCUSDT', amount: 1, entryPrice: NaN }));
  expectThrow('rejects bad symbol', () => openPosition(s, { symbol: 'not a symbol', amount: 1, entryPrice: 1 }));
  expectThrow('rejects bad side', () => openPosition(s, { symbol: 'BTCUSDT', amount: 1, entryPrice: 1, side: 'up' }));
  expectThrow('rejects closing a non-existent position', () =>
    closePosition(s, { symbol: 'SOLUSDT', exitPrice: 100 })
  );
  check('portfolio untouched after all rejections', s.positions.length === 0 && s.cash === 10000);
}

console.log('\n=== 10. Persistence round-trip ===');
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'afp-'));
  const file = path.join(dir, 'portfolio_state.json');

  const s = emptyPortfolioState();
  openPosition(s, { symbol: 'BTCUSDT', amount: 0.05, entryPrice: 40000 });
  closePosition(s, { symbol: 'BTCUSDT', exitPrice: 45000 });
  savePortfolioState(s, file, fs);

  check('file written', fs.existsSync(file));
  check('no temp file left behind', !fs.existsSync(`${file}.tmp`));

  const reloaded = validatePortfolioState(JSON.parse(fs.readFileSync(file, 'utf8')));
  check('positions survive round-trip', reloaded.positions.length === 0);
  check('trade history survives', reloaded.tradeHistory.length === 1);
  check('realizedPnL survives', Math.abs(reloaded.realizedPnL - 250) < 1e-9, `$${reloaded.realizedPnL}`);
  check('cash survives', Math.abs(reloaded.cash - 10250) < 1e-9, `$${reloaded.cash}`);

  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
