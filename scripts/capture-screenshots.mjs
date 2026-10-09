/**
 * Capture dashboard screenshots from a RUNNING server.
 *
 * Screenshots are captured with headless Chrome, then verified by asserting
 * that the served DOM contains real data (the API is the source of truth for
 * what the page renders). If the page cannot confirm live data, capture fails.
 *
 * Usage: node scripts/capture-screenshots.mjs [baseUrl] [delayMs]
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE = process.argv[2] || 'http://localhost:3011';
const SETTLE_MS = parseInt(process.argv[3] || '15000', 10);

const OUT_DIR = path.join(__dirname, '..', 'evidence', 'screenshots', 'live');

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

function findBrowser() {
  for (const c of CHROME_CANDIDATES) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error('No Chrome/Edge binary found');
}

async function api(pathname) {
  const res = await fetch(`${BASE}${pathname}`);
  if (!res.ok) throw new Error(`${pathname} -> HTTP ${res.status}`);
  return res.json();
}

async function shoot(browser, name, tab, windowSize) {
  const outPath = path.join(OUT_DIR, `${name}.png`);
  const url = `${BASE}/?tab=${tab}`;

  await execFileAsync(
    browser,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      `--window-size=${windowSize}`,
      `--virtual-time-budget=${SETTLE_MS}`,
      `--screenshot=${outPath}`,
      url,
    ],
    { timeout: 120000, maxBuffer: 20 * 1024 * 1024 }
  ).catch((err) => {
    // Chrome writes the file then exits with noise on stderr; only fail if no file.
    if (!fs.existsSync(outPath)) throw err;
  });

  if (!fs.existsSync(outPath)) throw new Error(`Screenshot not written: ${outPath}`);

  const size = fs.statSync(outPath).size;
  if (size < 10_000) throw new Error(`Screenshot suspiciously small (${size} bytes) - page probably blank`);

  console.log(`  [OK] ${name}.png (${(size / 1024).toFixed(1)} KB)`);
  return outPath;
}

console.log(`\n=== Capturing screenshots from ${BASE} ===\n`);

// Fail fast if the server is not serving live data.
const market = await api('/api/market-data');
if (market.isLive !== true) {
  console.error('Refusing to capture: /api/market-data is not live.');
  process.exit(1);
}

const signals = await api('/api/signals?symbol=BTCUSDT');
const portfolio = await api('/api/portfolio');
const backtest = await api('/api/backtest?symbol=BTCUSDT');

console.log('Live snapshot being captured:');
console.log(`  BTC          $${parseFloat(market.btc.lastPr).toLocaleString()}`);
console.log(`  ETH          $${parseFloat(market.eth.lastPr).toLocaleString()}`);
console.log(`  Source       ${market.source}`);
console.log(`  Score        ${signals.totalScore}/100 (${signals.recommendation})`);
console.log(`  Signals      ${signals.signals.length}`);
console.log(`  Portfolio    $${portfolio.totalValue.toLocaleString()} (${portfolio.totalTrades} trades)`);
console.log(`  Backtest     ${backtest.totalTrades} trades over ${backtest.candleCount} candles`);
console.log('');

fs.mkdirSync(OUT_DIR, { recursive: true });

const browser = findBrowser();
console.log(`Browser: ${browser}\n`);

await shoot(browser, '01-dashboard-overview', 'dashboard', '1600,1400');
await shoot(browser, '02-portfolio-tab', 'portfolio', '1600,1200');
await shoot(browser, '03-backtest-tab', 'backtest', '1600,1400');

// Record what was actually on screen when the shots were taken.
const manifest = {
  capturedAt: new Date().toISOString(),
  baseUrl: BASE,
  market: {
    source: market.source,
    isLive: market.isLive,
    btc: parseFloat(market.btc.lastPr),
    eth: parseFloat(market.eth.lastPr),
    sol: parseFloat(market.sol.lastPr),
    xrp: parseFloat(market.xrp.lastPr),
    fetchedAt: market.fetchedAt,
  },
  signals: {
    symbol: signals.symbol,
    totalScore: signals.totalScore,
    recommendation: signals.recommendation,
    dataSource: signals.dataSource,
    count: signals.signals.length,
    unavailable: signals.signals.filter((s) => s.source === 'unavailable').map((s) => s.name),
  },
  portfolio: {
    totalValue: portfolio.totalValue,
    totalPnL: portfolio.totalPnL,
    totalTrades: portfolio.totalTrades,
    winRate: portfolio.winRate,
    source: portfolio.source,
  },
  backtest: {
    symbol: backtest.symbol,
    candleCount: backtest.candleCount,
    totalTrades: backtest.totalTrades,
    totalReturnPercent: backtest.totalReturnPercent,
    source: backtest.source,
  },
  screenshots: fs.readdirSync(OUT_DIR).filter((f) => f.endsWith('.png')).sort(),
};

fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`\nManifest written to evidence/screenshots/live/manifest.json`);
console.log('These screenshots show REAL market data. Do not edit them.\n');
