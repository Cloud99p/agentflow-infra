/**
 * End-to-end verification of the dashboard HTTP API against a running server.
 *
 * Asserts that every endpoint returns REAL data and that no response carries
 * mock/simulated values. Fails loudly if the server serves fabricated numbers.
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

console.log('\n--- GET /api/portfolio ---');
{
  const { status, json } = await get('/api/portfolio');
  check('HTTP 200', status === 200, `got ${status}`);
  check('backed by persisted state', String(json?.source).includes('portfolio_state.json'), String(json?.source));
  check('value is finite', Number.isFinite(json?.totalValue), String(json?.totalValue));
  check('no mock trade count (old mock said 25 trades)', json?.totalTrades !== 25, String(json?.totalTrades));
  check('no mock win rate (old mock said 64%)', json?.winRate !== 64, String(json?.winRate));
  check('positions are an array', Array.isArray(json?.positions));
  check(
    'empty portfolio shows zeroes, not invented stats',
    json.positions.length > 0 || (json.totalPnL === 0 && json.winRate === 0 && json.totalTrades === 0)
  );
}

console.log('\n--- GET /api/backtest ---');
{
  const { status, json } = await get('/api/backtest?symbol=BTCUSDT&interval=1d');
  check('HTTP 200', status === 200, `got ${status}`);
  check('ran over 200 real candles', json?.candleCount === 200, String(json?.candleCount));
  check('provenance recorded', json?.symbol === 'BTCUSDT' && json?.source === 'binance');
  check('isLive true', json?.isLive === true);
  check('equity curve matches candle count', json?.equityCurve?.length === 200, String(json?.equityCurve?.length));
  check('win + loss == total', json.winningTrades + json.losingTrades === json.totalTrades);
  check('sharpe is finite', Number.isFinite(json?.sharpeRatio), String(json?.sharpeRatio));
  check('result is not the old random-mock shape (15 trades)', json.totalTrades !== 15, String(json.totalTrades));
  check(
    'equity curve is entirely finite',
    json.equityCurve.every((p) => Number.isFinite(p.value))
  );
}

console.log('\n--- GET / (dashboard HTML) ---');
{
  const { status, text } = await get('/');
  check('HTTP 200', status === 200, `got ${status}`);
  check('serves the dashboard', text.includes('AgentFlow'));
  check('has the live/down source badge', text.includes('id="sourceBadge"'));
  check('no "Bitget Integrated" claim', !text.includes('Bitget Integrated'));
}

console.log(`\n${failures === 0 ? 'ALL LIVE CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
