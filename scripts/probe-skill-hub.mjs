/**
 * Establish EXACTLY which Skill Hub calls return real data from this host.
 *
 * Earlier probes over-counted twice:
 *   1. accepted {"error":""} envelopes because the transport succeeded
 *   2. accepted {"error":"","url":"..."} because a `url` field looked meaningful
 *
 * This version demands an actual value at a known path. Everything else is
 * reported as dead so it cannot be quietly wired into a signal.
 *
 * Usage: node scripts/probe-skill-hub.mjs
 */

import { SkillHubClient } from '../dist/skill-hub-client.js';

const client = new SkillHubClient();

/**
 * Resolve a dot path and confirm a real value sits there.
 * Bookkeeping keys (error/url/note/source/timestamp) never count as data.
 */
function hasValueAt(data, path) {
  const parts = path.split('.');
  let cur = data;
  for (const part of parts) {
    if (cur === null || cur === undefined) return null;
    // Support `items[0]` and array wildcards `[]`.
    const arrayMatch = part.match(/^(\w*)\[(\d*)\]$/);
    if (arrayMatch) {
      const [, key, idx] = arrayMatch;
      const arr = key ? cur[key] : cur;
      if (!Array.isArray(arr) || arr.length === 0) return null;
      cur = idx === '' ? arr : arr[Number(idx)];
    } else {
      cur = cur[part];
    }
  }
  if (cur === null || cur === undefined || cur === '') return null;
  if (typeof cur === 'number' && !Number.isFinite(cur)) return null;
  return cur;
}

/**
 * A probe passes only if a real value appears at one of these paths.
 * `paths` are chosen from observed good responses, not from documentation.
 */
const PROBES = [
  // --- Confirmed working: fast, real payloads ---
  { name: 'crypto_derivatives', args: { action: 'price', symbol: 'BTC/USDT' }, paths: ['price'], want: 'BTC price' },
  { name: 'crypto_derivatives', args: { action: 'ticker_24h', symbol: 'BTC/USDT' }, paths: ['last', 'change_pct'], want: '24h ticker' },
  { name: 'crypto_derivatives', args: { action: 'klines', symbol: 'BTC/USDT', timeframe: '1d', limit: 5 }, paths: [], want: 'OHLCV klines' },
  { name: 'technical_analysis', args: { action: 'full_analysis', symbol: 'BTC/USDT', timeframe: '1d' }, paths: ['rsi.rsi', 'macd.macd'], want: 'composite TA' },
  { name: 'technical_analysis', args: { action: 'rsi', symbol: 'BTC/USDT', timeframe: '1d' }, paths: ['rsi'], want: 'RSI' },
  { name: 'technical_analysis', args: { action: 'macd', symbol: 'BTC/USDT', timeframe: '1d' }, paths: ['macd'], want: 'MACD' },
  { name: 'technical_analysis', args: { action: 'bollinger', symbol: 'BTC/USDT', timeframe: '1d' }, paths: ['upper', 'middle'], want: 'Bollinger' },
  { name: 'technical_analysis', args: { action: 'atr', symbol: 'BTC/USDT', timeframe: '1d' }, paths: ['atr'], want: 'ATR' },
  { name: 'technical_analysis', args: { action: 'support_resistance', symbol: 'BTC/USDT', timeframe: '1d' }, paths: [], want: 'S/R levels' },
  { name: 'news_feed', args: { action: 'sources' }, paths: ['feeds'], want: 'feed list (44)' },

  // --- Everything below is expected dead from this host; verify, don't assume ---
  { name: 'sentiment_index', args: { action: 'current' }, paths: ['value', 'fear_and_greed.value', 'data.value'], want: 'Fear & Greed' },
  { name: 'sentiment_index', args: { action: 'history', days: 30 }, paths: [], want: 'F&G history' },
  { name: 'derivatives_sentiment', args: { action: 'long_short', symbol: 'BTCUSDT', period: '4h' }, paths: [], want: 'long/short' },
  { name: 'derivatives_sentiment', args: { action: 'open_interest', symbol: 'BTCUSDT', period: '4h' }, paths: [], want: 'open interest' },
  { name: 'news_feed', args: { action: 'latest', limit: 5, feeds: 'cointelegraph' }, paths: ['[0].items[0].title', '[0].items'], want: 'news articles' },
  { name: 'macro_indicators', args: { action: 'multi_indicator', indicators: 'cpi,unemployment' }, paths: ['cpi.value', 'cpi.latest_value'], want: 'CPI' },
  { name: 'rates_yields', args: { action: 'rates_snapshot' }, paths: ['t10y.value', 'yield_curve.t10y.value'], want: 'Y10' },
  { name: 'cross_asset', args: { action: 'correlation', base: 'btc', period: '90d' }, paths: ['correlations', 'correlation'], want: 'correlations' },
  { name: 'defi_analytics', args: { action: 'chains', limit: 10 }, paths: ['chains[0].tvl', '[0].tvl'], want: 'chain TVL' },
  { name: 'defi_analytics', args: { action: 'stablecoins', limit: 10 }, paths: ['stablecoins[0]', '[0]'], want: 'stablecoin caps' },
  { name: 'network_status', args: { action: 'eth_gas' }, paths: ['fast', 'standard', 'propose_gas_price'], want: 'gas price' },
  { name: 'network_status', args: { action: 'btc_fees' }, paths: ['fastestFee', 'halfHourFee', 'fastest_fee'], want: 'BTC fees' },
  { name: 'crypto_market', args: { action: 'global' }, paths: ['total_market_cap', 'data.total_market_cap'], want: 'global mkt cap' },
  { name: 'crypto_market', args: { action: 'trending' }, paths: ['coins[0]', 'trending[0]'], want: 'trending coins' },
  { name: 'global_data', args: { action: 'forex', base: 'USD', symbols: 'EUR,GBP' }, paths: ['rates.EUR', 'rates'], want: 'FX rates' },
  { name: 'dex_market', args: { action: 'search', query: 'SOL' }, paths: ['pairs[0]', 'pairs'], want: 'DEX pairs' },
  { name: 'tradfi_news', args: { action: 'crypto_news', limit: 3 }, paths: ['[0].headline', '[0]'], want: 'Finnhub news' },
];

console.log('\n=== Skill Hub: which calls actually return data from this host ===\n');
const status = await client.status();
if (!status.reachable) {
  console.log(`UNREACHABLE: ${status.error}`);
  process.exit(1);
}
console.log(`${status.serverName} ${status.serverVersion} | ${status.toolCount} tools\n`);

const live = [];
const dead = [];

for (const probe of PROBES) {
  const res = await client.callTool(probe.name, probe.args);
  const a = probe.args.action ?? '';

  // A payload counts only if a real value sits at an expected path.
  let value = null;
  if (res.ok && !res.toolError && res.data) {
    for (const p of probe.paths) {
      value = hasValueAt(res.data, p);
      if (value !== null && value !== undefined) break;
    }
    // No declared paths: accept any non-noise leaf (used for list-shaped tools).
    if (probe.paths.length === 0 && value === null) {
      const s = JSON.stringify(res.data);
      if (!/^\{"error":/.test(s) && s.length > 30) value = s.slice(0, 60);
    }
  }

  const ok = value !== null && value !== undefined;
  const rec = { ...probe, ok, ms: res.durationMs, raw: res.raw, data: res.data, value };
  (ok ? live : dead).push(rec);

  const flag = ok ? 'LIVE' : 'DEAD';
  const preview = ok
    ? `= ${String(typeof value === 'object' ? JSON.stringify(value) : value).slice(0, 70)}`
    : `(no value; ${res.raw.slice(0, 60).replace(/\s+/g, ' ') || 'empty'})`;
  console.log(`[${flag}] ${probe.name}/${a} ${res.durationMs}ms ${preview}`);
}

console.log(`\n=== ${live.length} LIVE / ${dead.length} DEAD (of ${PROBES.length}) ===\n`);

console.log('WORKS — safe to wire:');
for (const l of live) console.log(`  ${l.name}/${l.args.action ?? ''}`);

console.log('\nDEAD — label unavailable, never fabricate:');
for (const d of dead) console.log(`  ${d.name}/${d.args.action ?? ''}`);

// Write the report so the README can cite measured fact, not a guess.
const report = {
  probedAt: new Date().toISOString(),
  server: `${status.serverName} ${status.serverVersion}`,
  host: 'localhost (Nigeria)',
  live: live.map((l) => ({ tool: l.name, action: l.args.action ?? '', ms: l.ms, want: l.want })),
  dead: dead.map((d) => ({ tool: d.name, action: d.args.action ?? '', ms: d.ms, want: d.want })),
  note:
    'Dead entries are upstream fetch failures on the MCP host, not local network faults. ' +
    'Verified independently: a direct CoinGecko call from this host returns live prices while ' +
    'crypto_market/global times out through the MCP.',
};
const fs = await import('node:fs');
fs.writeFileSync('evidence/skill-hub-probe.json', JSON.stringify(report, null, 2));
console.log('\nReport written to evidence/skill-hub-probe.json');
console.log('');
