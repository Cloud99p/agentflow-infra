/**
 * End-to-end verification of the dashboard HTTP API against a running server.
 *
 * Asserts that every endpoint returns REAL data, that the portfolio mutations
 * behave correctly end to end, and that backtest parameters are honoured.
 * Fails loudly if the server serves fabricated numbers or loses money.
 *
 * Usage: node scripts/verify-dashboard-live.mjs [baseUrl]
 */

const BASE = process.argv[2] || 'http://localhost:3011';

let failures = 0;

function check(label, condition, detail = '') {
  if (!condition) failures++;
  console.log(`  [${condition ? 'PASS' : 'FAIL'}] ${label}${detail ? ` :: ${detail}` : ''}`);
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, json, text };
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, json, text };
}

/** Reset the portfolio so the mutation tests start from a known state. */
async function resetPortfolio() {
  const state = {
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    cash: 10000,
    positions: [],
    tradeHistory: [],
    realizedPnL: 0,
  };
  const res = await post('/api/portfolio/reset', state);
  if (res.status !== 200) throw new Error(`reset failed: HTTP ${res.status} ${res.text.slice(0, 120)}`);
}

console.log(`\n=== Verifying ${BASE} ===\n`);

console.log('--- GET /api/market-data ---');
{
  const { status, json } = await get('/api/market-data');
  check('HTTP 200', status === 200, `got ${status}`);
  check('isLive flag true', json?.isLive === true);
  check('source is a real exchange', ['coingecko', 'binance', 'bitget'].includes(json?.source), String(json?.source));
  for (const k of ['btc', 'eth', 'sol', 'xrp']) {
    const price = parseFloat(json?.[k]?.lastPr ?? '0');
    check(`${k} price is a positive real number`, price > 0, `$${price}`);
  }
  const btc = parseFloat(json.btc.lastPr);
  check('BTC price is not the old mock constant (64000)', Math.abs(btc - 64000) > 1, `$${btc}`);
  check('no simulated source in payload', !JSON.stringify(json).includes('"simulated"'));
}

console.log('\n--- GET /api/indicators ---');
{
  const { status, json } = await get('/api/indicators?symbol=BTCUSDT&interval=1d');
  check('HTTP 200', status === 200, `got ${status}`);
  check('200 real candles used', json?.candleCount === 200, String(json?.candleCount));
  check('RSI in valid range', json?.rsi > 0 && json?.rsi < 100, String(json?.rsi));
  check('MACD present with signal/histogram', typeof json?.macd?.signal === 'number' && typeof json?.macd?.histogram === 'number');
  check(
    'MACD reconciles (macd - signal === histogram)',
    Math.abs((json.macd.macd - json.macd.signal) - json.macd.histogram) < 0.001,
    `${json.macd.macd} - ${json.macd.signal} = ${(json.macd.macd - json.macd.signal).toFixed(4)} vs ${json.macd.histogram}`
  );
  check('period is a real date range', json?.periodEnd > json?.periodStart && json?.periodStart > 0);
  check('source is binance', json?.source === 'binance');
}

console.log('\n--- GET /api/signals ---');
{
  const { status, json } = await get('/api/signals?symbol=BTCUSDT');
  check('HTTP 200', status === 200, `got ${status}`);
  check('10 signals returned', json?.signals?.length === 10, String(json?.signals?.length));
  check('top-level isLive true', json?.isLive === true);
  check('report has a live data source', ['coingecko', 'binance', 'bitget'].includes(json?.dataSource), String(json?.dataSource));

  const rsiSignal = json.signals.find((s) => s.name === 'RSI');
  check('RSI signal comes from real candles', rsiSignal?.source === 'binance', `source=${rsiSignal?.source}`);
  check('RSI rationale does NOT say "Simulated"', !/simulated/i.test(rsiSignal?.rationale ?? ''), rsiSignal?.rationale?.slice(0, 60));

  const sentiment = json.signals.find((s) => s.name === 'Sentiment');
  check(
    'unconfigured sentiment is labelled unavailable, not invented',
    sentiment?.source === 'unavailable',
    `source=${sentiment?.source}`
  );

  const scored = json.signals.every((s) => typeof s.score === 'number' && s.score >= 0 && s.score <= 100);
  check('every signal score is 0-100', scored);
  check(
    'no signal claims a source it cannot have',
    json.signals.every((s) => ['coingecko', 'binance', 'bitget', 'unavailable'].includes(s.source))
  );
}

console.log('\n--- GET /api/backtest (parameterised) ---');
let liveBtc = 0;
{
  const { status, json } = await get('/api/backtest?symbol=BTCUSDT&interval=1d&limit=200');
  check('HTTP 200', status === 200, `got ${status}`);
  check('ran over 200 real candles', json?.candleCount === 200, String(json?.candleCount));
  check('provenance recorded', json?.symbol === 'BTCUSDT' && json?.source === 'binance');
  check('isLive true', json?.isLive === true);
  check('equity curve matches candle count', json?.equityCurve?.length === 200, String(json?.equityCurve?.length));
  check('win + loss == total', json.winningTrades + json.losingTrades === json.totalTrades);
  check('sharpe is finite', Number.isFinite(json?.sharpeRatio), String(json?.sharpeRatio));
  check('profit factor is finite (no Infinity in JSON)', Number.isFinite(json?.profitFactor), String(json?.profitFactor));
  check('result is not the old random-mock shape (15 trades)', json.totalTrades !== 15, String(json.totalTrades));
  check('equity curve is entirely finite', json.equityCurve.every((p) => Number.isFinite(p.value)));

  console.log('\n--- Backtest parameters are honoured ---');
  const small = await get('/api/backtest?symbol=BTCUSDT&interval=1d&limit=100');
  check('limit=100 returns 100 candles', small.json?.candleCount === 100, String(small.json?.candleCount));

  const eth = await get('/api/backtest?symbol=ETHUSDT&interval=4h&limit=300&capital=5000');
  check('symbol override honoured', eth.json?.symbol === 'ETHUSDT', String(eth.json?.symbol));
  check('interval override honoured', eth.json?.interval === '4h', String(eth.json?.interval));
  check('300 candles returned', eth.json?.candleCount === 300, String(eth.json?.candleCount));
  check(
    'capital=5000 starts the equity curve at 5000',
    Math.abs(eth.json?.equityCurve?.[0]?.value - 5000) < 1e-6,
    `$${eth.json?.equityCurve?.[0]?.value}`
  );

  const tight = await get('/api/backtest?symbol=BTCUSDT&interval=1d&limit=300&takeProfit=1&stopLoss=1');
  const loose = await get('/api/backtest?symbol=BTCUSDT&interval=1d&limit=300&takeProfit=20&stopLoss=20');
  check(
    'tighter TP/SL produces different results than loose',
    tight.json?.totalTrades !== loose.json?.totalTrades ||
      tight.json?.totalReturn !== loose.json?.totalReturn,
    `tight=${tight.json?.totalTrades}t loose=${loose.json?.totalTrades}t`
  );

  console.log('\n--- Backtest rejects invalid parameters ---');
  for (const [label, qs] of [
    ['bad symbol', 'symbol=../etc&limit=200'],
    ['bad interval', 'symbol=BTCUSDT&interval=7d'],
    ['limit too small', 'symbol=BTCUSDT&interval=1d&limit=5'],
    ['limit too large', 'symbol=BTCUSDT&interval=1d&limit=5000'],
    ['negative capital', 'symbol=BTCUSDT&interval=1d&capital=-5'],
    ['zero stop loss', 'symbol=BTCUSDT&interval=1d&stopLoss=0'],
  ]) {
    const r = await get(`/api/backtest?${qs}`);
    check(`rejects ${label}`, r.status === 400, `HTTP ${r.status}`);
  }
}

console.log('\n--- Portfolio mutations (end to end) ---');
{
  await resetPortfolio();

  const market = await get('/api/market-data');
  liveBtc = parseFloat(market.json.btc.lastPr);

  let p = await get('/api/portfolio');
  check('reset leaves 10000 cash', Math.abs(p.json.cash - 10000) < 1e-9, `$${p.json.cash}`);
  check('reset leaves no positions', p.json.positions.length === 0);
  check('reset leaves no trades', p.json.totalTrades === 0);

  // Open below market so the mark-to-market is a real gain.
  const entry = Math.round(liveBtc * 0.98);
  const open = await post('/api/portfolio/position', {
    symbol: 'BTCUSDT',
    side: 'long',
    amount: 0.05,
    entryPrice: entry,
  });
  check('open accepted', open.status === 200, `HTTP ${open.status} ${open.text.slice(0, 80)}`);
  check('cash debited by cost', Math.abs(open.json?.cash - (10000 - 0.05 * entry)) < 1e-6, `$${open.json?.cash}`);

  p = await get('/api/portfolio');
  const pos = p.json.positions[0];
  check('position appears', p.json.positions.length === 1);
  check('position marked to the LIVE price', Math.abs(pos.currentPrice - liveBtc) < 0.01, `mark=$${pos.currentPrice} live=$${liveBtc}`);
  check(
    'unrealized PnL computed from the live mark',
    Math.abs(pos.pnl - (liveBtc - entry) * 0.05) < 0.01,
    `$${pos.pnl?.toFixed(2)}`
  );
  check('total value = cash + live position value', Math.abs(p.json.totalValue - (p.json.cash + liveBtc * 0.05)) < 0.01);
  check('metrics are finite', Number.isFinite(p.json.totalValue) && Number.isFinite(p.json.totalPnL));

  console.log('\n--- Position validation is enforced ---');
  const overspend = await post('/api/portfolio/position', { symbol: 'BTCUSDT', amount: 100, entryPrice: liveBtc });
  check('overspend rejected with 400', overspend.status === 400, `HTTP ${overspend.status}`);
  const badSymbol = await post('/api/portfolio/position', { symbol: '../../etc', amount: 0.01, entryPrice: 100 });
  check('bad symbol rejected', badSymbol.status === 400, `HTTP ${badSymbol.status}`);
  const negAmount = await post('/api/portfolio/position', { symbol: 'BTCUSDT', amount: -1, entryPrice: 100 });
  check('negative amount rejected', negAmount.status === 400, `HTTP ${negAmount.status}`);

  console.log('\n--- Close round-trip conserves cash ---');
  const beforeClose = (await get('/api/portfolio')).json;
  const closeAt = liveBtc;
  const close = await post('/api/portfolio/close', { symbol: 'BTCUSDT', exitPrice: closeAt });
  check('close accepted', close.status === 200, `HTTP ${close.status} ${close.text.slice(0, 80)}`);

  const expectedPnl = (closeAt - entry) * 0.05;
  check('trade PnL matches entry/exit', Math.abs(close.json?.trade?.pnl - expectedPnl) < 0.01, `$${close.json?.trade?.pnl?.toFixed(2)}`);

  const expectedCash = beforeClose.cash + closeAt * 0.05;
  check(
    'cash credited with market value (no double-counting)',
    Math.abs(close.json?.cash - expectedCash) < 0.01,
    `$${close.json?.cash?.toFixed(2)} expected $${expectedCash.toFixed(2)}`
  );

  const after = (await get('/api/portfolio')).json;
  check('position removed after close', after.positions.length === 0);
  check('trade recorded in history', after.totalTrades === 1);
  check('realized PnL reflects the trade', Math.abs(after.realizedPnL - expectedPnl) < 0.01, `$${after.realizedPnL?.toFixed(2)}`);
  check('win rate is 100% on a winning trade', after.winRate === 100, `${after.winRate}%`);
  check(
    'total value is conserved (cash + 0 positions)',
    Math.abs(after.totalValue - after.cash) < 0.01,
    `value=$${after.totalValue?.toFixed(2)} cash=$${after.cash?.toFixed(2)}`
  );

  const closeAgain = await post('/api/portfolio/close', { symbol: 'BTCUSDT', exitPrice: liveBtc });
  check('closing a non-existent position rejected', closeAgain.status === 400, `HTTP ${closeAgain.status}`);

  await resetPortfolio();
  const final = (await get('/api/portfolio')).json;
  check('portfolio reset to clean state at the end', final.cash === 10000 && final.totalTrades === 0);
}

console.log('\n--- GET / (dashboard HTML) ---');
{
  const { status, text } = await get('/');
  check('HTTP 200', status === 200, `got ${status}`);
  check('serves the dashboard', text.includes('AgentFlow'));
  check('has the live/down source badge', text.includes('id="sourceBadge"'));
  check('has a Run Backtest control', text.includes('id="btSymbol"') && text.includes('runBacktest()'));
  check('has an Open Position control', text.includes('id="posSymbol"') && text.includes('submitOpenPosition()'));
  check('has a close-position control', text.includes('closePosition('));
  check('no "Bitget Integrated" claim', !text.includes('Bitget Integrated'));
}

console.log(`\n${failures === 0 ? 'ALL LIVE CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
