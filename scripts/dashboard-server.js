/**
 * AgentFlow Infra - Real-Time Dashboard Server
 *
 * Serves the dashboard and its API. ALL market data is real:
 *   - prices/candles  -> src/market-data.ts  (CoinGecko -> Binance -> Bitget failover)
 *   - RSI/MACD etc.   -> src/technical-indicators.ts (computed from real Binance klines)
 *   - portfolio       -> portfolio_state.json (persisted, marked to live prices)
 *   - backtest        -> src/backtest-engine.ts over real historical klines
 *
 * There is no mock fallback. If every live source is down the API returns an
 * explicit error with `isLive: false`, never invented numbers.
 */

import 'dotenv/config';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { MarketDataProvider } from '../dist/market-data.js';
import { calculateRSI, calculateMACD, calculateATR } from '../dist/technical-indicators.js';
import { SkillHubSignals } from '../dist/signals/skill-hub-signals.js';
import {
  calculatePortfolioMetrics,
  validatePortfolioState,
  emptyPortfolioState,
  openPosition,
  closePosition,
  savePortfolioState,
  isValidSymbol,
} from '../dist/portfolio-tracker.js';
import { runBacktest, defaultBacktestConfig } from '../dist/backtest-engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.DASHBOARD_PORT || 3000;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const ENABLE_DEEPSEEK_AI = process.env.ENABLE_DEEPSEEK_AI !== 'false';
const DEEPSEEK_CACHE_TTL = 300000; // 5 minutes cache

const PYTHON_OR_NODE_NOTE = 'Real market data (no simulation)';

const provider = new MarketDataProvider({ cacheTtlMs: 15000 });
// Independent cross-checks via the Bitget Skill Hub. Cached internally so a
// dashboard refresh does not refetch every upstream.
const skillHubSignals = new SkillHubSignals({ ttlMs: 60000 });
const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT'];
const STATE_PATH = path.join(__dirname, '..', 'portfolio_state.json');

let aiReasoningCache = { data: null, timestamp: 0, symbol: null };

console.log('[CONFIG] DeepSeek AI:', DEEPSEEK_API_KEY ? 'Enabled' : 'Disabled (no API key)');
console.log('[CONFIG] Market data:', PYTHON_OR_NODE_NOTE);

/**
 * Load the persisted portfolio state. Creates an empty one on first run.
 * A corrupt file throws loudly rather than silently showing zeroes.
 */
function loadPortfolioState() {
  if (!fs.existsSync(STATE_PATH)) {
    const empty = emptyPortfolioState();
    fs.writeFileSync(STATE_PATH, JSON.stringify(empty, null, 2));
    console.log(`[PORTFOLIO] Created empty state at ${STATE_PATH}`);
    return empty;
  }

  const raw = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  return validatePortfolioState(raw);
}

/**
 * Build a live portfolio snapshot. Positions are marked to real prices; any
 * symbol that cannot be priced is reported as unpriced instead of guessed.
 */
async function buildPortfolio() {
  const state = loadPortfolioState();
  const symbols = [...new Set(state.positions.map((p) => p.symbol))];
  const errors = [];
  let tickers = {};

  if (symbols.length > 0) {
    try {
      const snap = await provider.getSnapshot(symbols);
      tickers = snap.tickers;
    } catch (err) {
      errors.push(`live prices unavailable: ${err.message}`);
    }
  }

  const positions = [];
  for (const p of state.positions) {
    const ticker = tickers[p.symbol];
    if (!ticker) {
      errors.push(`no live price for ${p.symbol} - position excluded from totals`);
      continue;
    }
    positions.push({
      symbol: p.symbol,
      amount: p.amount,
      entryPrice: p.entryPrice,
      currentPrice: parseFloat(ticker.lastPr),
      side: p.side,
      openedAt: p.openedAt,
    });
  }

  const metrics = calculatePortfolioMetrics(
    positions,
    state.realizedPnL ?? state.tradeHistory.reduce((s, t) => s + (t.pnl || 0), 0),
    state.tradeHistory.map((t) => ({ pnl: t.pnl, timestamp: t.closedAt || t.exitTime || 0 })),
    state.cash
  );

  return {
    ...metrics,
    isLive: errors.length === 0,
    source: errors.length === 0 ? 'live-prices + portfolio_state.json' : 'partial',
    errors,
    updatedAt: state.updatedAt,
  };
}

/**
 * Run a real backtest over real candles for the requested symbol.
 */
async function buildBacktest(symbol = 'BTCUSDT', interval = '1d', limit = 200, overrides = {}) {
  const candles = await provider.getCandles(symbol, interval, limit);
  const config = { ...defaultBacktestConfig(), ...overrides };
  return runBacktest(candles, config, {
    symbol,
    interval,
    source: 'binance',
  });
}

/**
 * Read and parse a JSON request body, with a size cap so a malformed or
 * hostile client cannot exhaust memory.
 */
function readJsonBody(req, maxBytes = 100_000) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > maxBytes) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Request body is not valid JSON'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Real technical indicators computed from real candles.
 */
async function buildIndicators(symbol = 'BTCUSDT', interval = '1d', limit = 200) {
  const candles = await provider.getCandles(symbol, interval, limit);
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);

  const rsi = calculateRSI(closes);
  const macd = calculateMACD(closes);
  const atr = calculateATR(highs, lows, closes);

  if (rsi === null) throw new Error(`Not enough candles for RSI (${candles.length})`);

  return {
    symbol,
    interval,
    candleCount: candles.length,
    lastClose: closes[closes.length - 1],
    periodStart: candles[0].timestamp,
    periodEnd: candles[candles.length - 1].timestamp,
    rsi,
    macd,
    atr,
    source: 'binance',
    isLive: true,
  };
}

/**
 * Generate the 10-signal analysis from real data only.
 * RSI and MACD are computed from real candles, not derived from the 24h change.
 */
async function generateSignals(activeSymbol = 'BTCUSDT') {
  const snap = await provider.getSnapshot(SYMBOLS);
  const dataSource = snap.source;

  const group = {};
  for (const s of SYMBOLS) {
    if (snap.tickers[s]) group[s] = snap.tickers[s];
  }

  const cryptoData = snap.tickers[activeSymbol];
  if (!cryptoData) throw new Error(`No live ticker for ${activeSymbol}`);

  const signals = [];
  const cryptoName = activeSymbol.replace('USDT', '');
  const changePercent = parseFloat(cryptoData.change24h) * 100;
  const price = parseFloat(cryptoData.lastPr);
  const volume = parseFloat(cryptoData.usdt24h);
  const high = parseFloat(cryptoData.high24h);
  const low = parseFloat(cryptoData.low24h);

  const momentumScore =
    changePercent > 5 ? 80 : changePercent > 2 ? 65 : changePercent > 0 ? 55 : changePercent > -2 ? 45 : changePercent > -5 ? 35 : 20;
  signals.push({
    name: 'Momentum',
    score: momentumScore,
    weight: 0.12,
    rationale: `${cryptoName} 24h change: ${changePercent.toFixed(2)}%, price: $${price.toLocaleString()}`,
    timestamp: Date.now(),
    source: dataSource,
  });

  const volatility = low > 0 ? ((high - low) / low) * 100 : 0;
  const volatilityScore =
    volatility > 3 && volatility < 10 ? 75 : volatility >= 10 && volatility < 15 ? 60 : volatility < 3 ? 40 : 30;
  signals.push({
    name: 'Volatility',
    score: volatilityScore,
    weight: 0.1,
    rationale: `${cryptoName} 24h volatility: ${volatility.toFixed(2)}% (H: $${high.toLocaleString()}, L: $${low.toLocaleString()})`,
    timestamp: Date.now(),
    source: dataSource,
  });

  const trendScore = changePercent > 3 ? 80 : changePercent > 0 ? 60 : changePercent > -3 ? 40 : 20;
  signals.push({
    name: 'Trend',
    score: trendScore,
    weight: 0.12,
    rationale: `${cryptoName} short-term trend: ${changePercent > 0 ? 'BULLISH' : 'BEARISH'} (${changePercent.toFixed(2)}%)`,
    timestamp: Date.now(),
    source: dataSource,
  });

  const volumeScore = volume > 1_000_000_000 ? 85 : volume > 100_000_000 ? 70 : volume > 10_000_000 ? 55 : 35;
  signals.push({
    name: 'Volume',
    score: volumeScore,
    weight: 0.1,
    rationale: `${cryptoName} 24h volume: $${(volume / 1_000_000).toFixed(0)}M`,
    timestamp: Date.now(),
    source: dataSource,
  });

  // Real indicators from real candles. If they cannot be computed the signal
  // reports a neutral score and says it is unavailable - it never fakes a value.
  let rsi = null;
  let macd = null;
  try {
    const candles = await provider.getCandles(activeSymbol, '1h', 300);
    const closes = candles.map((c) => c.close);
    rsi = calculateRSI(closes);
    macd = calculateMACD(closes);
  } catch (err) {
    console.warn(`[DASHBOARD] Indicator fetch failed for ${activeSymbol}: ${err.message}`);
  }

  if (rsi !== null) {
    const rsiScore = rsi < 20 ? 85 : rsi < 30 ? 70 : rsi < 45 ? 55 : rsi < 55 ? 50 : rsi < 65 ? 45 : rsi < 75 ? 30 : 15;
    signals.push({
      name: 'RSI',
      score: rsiScore,
      weight: 0.12,
      rationale: `${cryptoName} RSI(14, 1h): ${rsi.toFixed(1)} - ${
        rsi < 30 ? 'oversold' : rsi > 70 ? 'overbought' : 'neutral'
      }`,
      timestamp: Date.now(),
      source: 'binance',
      data: { rsi, interval: '1h', period: 14 },
    });
  } else {
    signals.push({
      name: 'RSI',
      score: 50,
      weight: 0.12,
      rationale: `${cryptoName} RSI unavailable (no candle data) - neutral score, no fabricated value`,
      timestamp: Date.now(),
      source: 'unavailable',
      data: { available: false },
    });
  }

  if (macd) {
    const hist = macd.histogram;
    const macdScore = hist > 0 ? 70 : hist > -1 ? 50 : 30;
    signals.push({
      name: 'MACD',
      score: macdScore,
      weight: 0.1,
      rationale: `${cryptoName} MACD histogram: ${hist.toFixed(4)} at $${price.toLocaleString()} (${
        hist > 0 ? 'Bullish' : 'Bearish'
      })`,
      timestamp: Date.now(),
      source: 'binance',
      data: macd,
    });
  } else {
    signals.push({
      name: 'MACD',
      score: 50,
      weight: 0.1,
      rationale: `${cryptoName} MACD unavailable (no candle data) - neutral score, no fabricated value`,
      timestamp: Date.now(),
      source: 'unavailable',
      data: { available: false },
    });
  }

  let regime = 'SIDEWAYS';
  let regimeScore = 50;
  if (changePercent > 5) {
    regime = 'BULL';
    regimeScore = 85;
  } else if (changePercent > 2) {
    regime = 'BULL';
    regimeScore = 70;
  } else if (changePercent < -5) {
    regime = 'BEAR';
    regimeScore = 15;
  } else if (changePercent < -2) {
    regime = 'BEAR';
    regimeScore = 30;
  }
  signals.push({
    name: 'Market Regime',
    score: regimeScore,
    weight: 0.1,
    rationale: `${cryptoName} market regime: ${regime} (${changePercent.toFixed(2)}%)`,
    timestamp: Date.now(),
    source: dataSource,
    data: { regime, change24h: changePercent },
  });

  const rangePosition = high > low ? ((price - low) / (high - low)) * 100 : 50;
  signals.push({
    name: 'Support/Resistance',
    score: Math.max(0, Math.min(100, 100 - rangePosition)),
    weight: 0.08,
    rationale: `${cryptoName} price position: ${rangePosition.toFixed(1)}% of 24h range (${
      rangePosition > 50 ? 'Near Resistance' : 'Near Support'
    })`,
    timestamp: Date.now(),
    source: dataSource,
    data: { rangePosition },
  });

  // Sentiment has no configured live source. Reported as neutral and labelled,
  // rather than derived from price and presented as sentiment.
  signals.push({
    name: 'Sentiment',
    score: 50,
    weight: 0.08,
    rationale: `${cryptoName} sentiment source not configured - neutral score, no fabricated reading`,
    timestamp: Date.now(),
    source: 'unavailable',
    data: { available: false },
  });

  signals.push({
    name: 'Risk Assessment',
    score: Math.max(0, 100 - volatility * 5),
    weight: 0.08,
    rationale: `${cryptoName} risk level: ${
      Math.max(0, 100 - volatility * 5) > 70 ? 'LOW' : Math.max(0, 100 - volatility * 5) > 40 ? 'MEDIUM' : 'HIGH'
    } (vol: ${volatility.toFixed(2)}%)`,
    timestamp: Date.now(),
    source: dataSource,
  });

  const totalWeight = signals.reduce((s, x) => s + x.weight, 0);
  const weightedScore = totalWeight > 0 ? signals.reduce((s, x) => s + x.score * x.weight, 0) / totalWeight : 50;

  let recommendation = 'HOLD';
  if (weightedScore >= 80) recommendation = 'STRONG_BUY';
  else if (weightedScore >= 65) recommendation = 'BUY';
  else if (weightedScore >= 50) recommendation = 'HOLD';
  else if (weightedScore >= 35) recommendation = 'SELL';
  else recommendation = 'STRONG_SELL';

  const bullish = signals.filter((s) => s.score >= 60).length;
  const neutral = signals.filter((s) => s.score >= 40 && s.score < 60).length;
  const bearish = signals.filter((s) => s.score < 40).length;

  // Bitget Skill Hub cross-checks. These corroborate our own numbers against a
  // second, independent implementation. Each reports its own availability, so a
  // dead upstream shows as `unavailable` rather than a neutral score pretending
  // to be a reading. Which upstreams are reachable is measured, see
  // evidence/skill-hub-probe.json.
  try {
    const crossChecks = await skillHubSignals.crossCheckPrice(activeSymbol, price);
    signals.push({
      name: 'Exchange Cross-Check',
      score: crossChecks.score ?? 50,
      weight: 0.05,
      rationale: crossChecks.available
        ? crossChecks.rationale
        : `${cryptoName} price cross-check unavailable: ${crossChecks.reason}`,
      timestamp: Date.now(),
      source: crossChecks.available ? 'skill-hub:crypto_derivatives' : 'unavailable',
      data: { available: crossChecks.available, reason: crossChecks.reason, evidence: crossChecks.evidence ?? null },
    });
  } catch (err) {
    console.warn(`[DASHBOARD] Exchange cross-check failed: ${err.message}`);
    signals.push({
      name: 'Exchange Cross-Check',
      score: 50,
      weight: 0.05,
      rationale: `${cryptoName} price cross-check errored - neutral, not fabricated`,
      timestamp: Date.now(),
      source: 'unavailable',
      data: { available: false },
    });
  }

  try {
    const taCheck = await skillHubSignals.crossCheckIndicators(activeSymbol, '1d');
    let note = taCheck.available ? taCheck.rationale : `${cryptoName} indicator cross-check unavailable: ${taCheck.reason}`;
    // Compare against the local RSI already computed above, when both exist.
    const independentRsi = taCheck.evidence?.rsi;
    if (taCheck.available && rsi !== null && Number.isFinite(independentRsi)) {
      note += ` | local RSI ${rsi.toFixed(2)} (delta ${Math.abs(independentRsi - rsi).toFixed(2)})`;
    }
    signals.push({
      name: 'Indicator Cross-Check',
      score: taCheck.score ?? 50,
      weight: 0.05,
      rationale: note,
      timestamp: Date.now(),
      source: taCheck.available ? 'skill-hub:technical_analysis' : 'unavailable',
      data: {
        available: taCheck.available,
        localRsi: rsi,
        reason: taCheck.reason,
        evidence: taCheck.evidence ?? null,
      },
    });
  } catch (err) {
    console.warn(`[DASHBOARD] Indicator cross-check failed: ${err.message}`);
    signals.push({
      name: 'Indicator Cross-Check',
      score: 50,
      weight: 0.05,
      rationale: `${cryptoName} indicator cross-check errored - neutral, not fabricated`,
      timestamp: Date.now(),
      source: 'unavailable',
      data: { available: false },
    });
  }

  const aiReasoning = await generateAIReasoning(
    signals,
    weightedScore,
    recommendation,
    { [activeSymbol.toLowerCase().replace('usdt', '')]: cryptoData },
    bullish,
    neutral,
    bearish,
    activeSymbol
  );

  return {
    timestamp: Date.now(),
    symbol: activeSymbol,
    totalScore: Math.round(weightedScore * 100) / 100,
    recommendation,
    confidence: Math.min(1, signals.length / 10),
    signals,
    summary: {
      bullish,
      neutral,
      bearish,
      marketRegime: signals.find((s) => s.name === 'Market Regime')?.data?.regime || 'UNKNOWN',
      liveSourceCount: signals.filter((s) => s.source && s.source !== 'unavailable').length,
      unavailableSources: signals.filter((s) => s.source === 'unavailable').map((s) => s.name),
    },
    aiReasoning,
    marketData: group,
    dataSource,
    isLive: true,
  };
}

/**
 * Local reasoning fallback (deterministic, derived from the real signals).
 * Labelled as local so it is never mistaken for model output.
 */
function generateLocalReasoning(signals, totalScore, recommendation, marketData, bullish, neutral, bearish) {
  const strongSignals = signals.filter((s) => s.score >= 65);
  const weakSignals = signals.filter((s) => s.score < 40);

  return {
    decision: recommendation,
    confidence: Math.round(totalScore),
    summary: `Composite score ${totalScore.toFixed(1)}/100 based on ${signals.length} live signals (${bullish} bullish, ${neutral} neutral, ${bearish} bearish).`,
    keyPoints: [
      ...strongSignals.slice(0, 3).map((s) => `Bullish: ${s.name} at ${s.score}/100 - ${s.rationale}`),
      ...weakSignals.slice(0, 3).map((s) => `Bearish: ${s.name} at ${s.score}/100 - ${s.rationale}`),
    ],
    rationale: `Weighted composite of ${signals.length} signals yields ${totalScore.toFixed(1)}/100, mapping to ${recommendation}.`,
    generatedBy: 'local-rules',
    isAIGenerated: false,
  };
}

/**
 * DeepSeek AI reasoning over the real signals, with caching.
 */
async function generateAIReasoning(signals, totalScore, recommendation, marketData, bullish, neutral, bearish, symbol = 'BTCUSDT') {
  if (!ENABLE_DEEPSEEK_AI || !DEEPSEEK_API_KEY) {
    return generateLocalReasoning(signals, totalScore, recommendation, marketData, bullish, neutral, bearish);
  }

  const now = Date.now();
  if (
    aiReasoningCache.data &&
    aiReasoningCache.symbol === symbol &&
    now - aiReasoningCache.timestamp < DEEPSEEK_CACHE_TTL
  ) {
    return aiReasoningCache.data;
  }

  try {
    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content:
              'You are a trading analyst. Respond with JSON only: {decision, confidence, summary, keyPoints: [], rationale}. decision is one of STRONG_BUY, BUY, HOLD, SELL, STRONG_SELL.',
          },
          {
            role: 'user',
            content: JSON.stringify({ symbol, totalScore, recommendation, signals, marketData }),
          },
        ],
        temperature: 0.3,
      }),
    });

    if (!res.ok) throw new Error(`DeepSeek HTTP ${res.status}`);

    const json = await res.json();
    const content = json.choices?.[0]?.message?.content ?? '';
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('DeepSeek returned no JSON object');

    const parsed = JSON.parse(match[0]);
    const result = { ...parsed, generatedBy: 'deepseek', isAIGenerated: true };
    aiReasoningCache = { data: result, timestamp: now, symbol };
    return result;
  } catch (err) {
    console.error('[DEEPSEEK] Failed, using local reasoning:', err.message);
    return generateLocalReasoning(signals, totalScore, recommendation, marketData, bullish, neutral, bearish);
  }
}

/**
 * Load lifecycle log data.
 */
function loadLifecycleData() {
  try {
    const lifecyclePath = path.join(__dirname, '..', 'lifecycle_log.json');
    const raw = fs.readFileSync(lifecyclePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { bundles: [] };
  }
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (url.pathname === '/api/market-data') {
    try {
      const snap = await provider.getSnapshot(SYMBOLS);
      sendJson(res, 200, {
        btc: snap.tickers.BTCUSDT,
        eth: snap.tickers.ETHUSDT,
        sol: snap.tickers.SOLUSDT,
        xrp: snap.tickers.XRPUSDT,
        source: snap.source,
        isLive: snap.isLive,
        errors: snap.errors,
        fetchedAt: snap.fetchedAt,
      });
    } catch (error) {
      // No live data. Say so plainly; never substitute fake prices.
      sendJson(res, 503, {
        error: 'Live market data unavailable',
        detail: error.message,
        isLive: false,
      });
    }
    return;
  }

  if (url.pathname === '/api/signals') {
    try {
      const symbol = url.searchParams.get('symbol') || 'BTCUSDT';
      sendJson(res, 200, await generateSignals(symbol));
    } catch (error) {
      console.error('[DASHBOARD] Signals API error:', error);
      sendJson(res, 503, { error: error.message, isLive: false });
    }
    return;
  }

  if (url.pathname === '/api/indicators') {
    try {
      const symbol = url.searchParams.get('symbol') || 'BTCUSDT';
      const interval = url.searchParams.get('interval') || '1d';
      sendJson(res, 200, await buildIndicators(symbol, interval, 200));
    } catch (error) {
      sendJson(res, 503, { error: error.message, isLive: false });
    }
    return;
  }

  if (url.pathname === '/api/lifecycle') {
    try {
      sendJson(res, 200, loadLifecycleData());
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }

  if (url.pathname === '/api/portfolio/position' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const state = loadPortfolioState();

      openPosition(state, {
        symbol: body.symbol,
        amount: Number(body.amount),
        entryPrice: Number(body.entryPrice),
        side: body.side,
      });

      savePortfolioState(state, STATE_PATH, fs);
      sendJson(res, 200, { ok: true, cash: state.cash, positions: state.positions.length });
    } catch (error) {
      // Validation failures are the client's fault: 400, not 500.
      console.error('[DASHBOARD] Open position rejected:', error.message);
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  if (url.pathname === '/api/portfolio/close' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const state = loadPortfolioState();

      const trade = closePosition(state, {
        symbol: body.symbol,
        exitPrice: Number(body.exitPrice),
        feeRate: body.feeRate,
      });

      savePortfolioState(state, STATE_PATH, fs);
      sendJson(res, 200, { ok: true, trade, cash: state.cash, realizedPnL: state.realizedPnL });
    } catch (error) {
      console.error('[DASHBOARD] Close position rejected:', error.message);
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  if (url.pathname === '/api/portfolio/reset' && req.method === 'POST') {
    try {
      // Test-support endpoint: restores an empty portfolio. Guarded so it can
      // never be triggered by a stray GET or a browser prefetch.
      const state = emptyPortfolioState();
      savePortfolioState(state, STATE_PATH, fs);
      sendJson(res, 200, { ok: true, cash: state.cash });
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }

  if (url.pathname === '/api/portfolio') {
    try {
      sendJson(res, 200, await buildPortfolio());
    } catch (error) {
      console.error('[DASHBOARD] Portfolio API error:', error);
      sendJson(res, 503, { error: error.message, isLive: false });
    }
    return;
  }

  if (url.pathname === '/api/backtest') {
    try {
      const symbol = url.searchParams.get('symbol') || 'BTCUSDT';
      const interval = url.searchParams.get('interval') || '1d';
      const limit = parseInt(url.searchParams.get('limit') || '200', 10);
      const capital = parseFloat(url.searchParams.get('capital') || '10000');
      const takeProfit = parseFloat(url.searchParams.get('takeProfit') || '5');
      const stopLoss = parseFloat(url.searchParams.get('stopLoss') || '3');

      // Validate before touching the network so bad input fails fast and cheaply.
      if (!isValidSymbol(symbol)) throw new Error(`Invalid symbol: ${symbol}`);
      if (!['1m', '5m', '15m', '1h', '4h', '1d'].includes(interval)) {
        throw new Error(`Invalid interval: ${interval}`);
      }
      if (!Number.isFinite(limit) || limit < 10 || limit > 1000) {
        throw new Error('limit must be between 10 and 1000');
      }
      if (!Number.isFinite(capital) || capital <= 0) throw new Error('capital must be positive');
      if (!Number.isFinite(takeProfit) || takeProfit <= 0) throw new Error('takeProfit must be positive');
      if (!Number.isFinite(stopLoss) || stopLoss <= 0) throw new Error('stopLoss must be positive');

      sendJson(
        res,
        200,
        await buildBacktest(symbol, interval, limit, {
          initialCapital: capital,
          takeProfit,
          stopLoss,
        })
      );
    } catch (error) {
      console.error('[DASHBOARD] Backtest API error:', error.message);
      sendJson(res, 400, { error: error.message, isLive: false });
    }
    return;
  }

  // Static dashboard files.
  let filePath = path.join(__dirname, '..', 'dashboard', url.pathname === '/' ? 'index.html' : url.pathname);
  const dashboardDir = path.join(__dirname, '..', 'dashboard');

  if (!filePath.startsWith(dashboardDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
  };

  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'application/octet-stream' });
    res.end(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.writeHead(404);
      res.end('Not Found');
    } else {
      res.writeHead(500);
      res.end('Server Error');
    }
  }
});

server.listen(PORT, () => {
  console.log('===========================================');
  console.log('  AGENTFLOW INFRA - DASHBOARD SERVER');
  console.log('===========================================');
  console.log(`  Dashboard:  http://localhost:${PORT}`);
  console.log(`  Signals:    http://localhost:${PORT}/api/signals`);
  console.log(`  Market:     http://localhost:${PORT}/api/market-data`);
  console.log(`  Indicators: http://localhost:${PORT}/api/indicators`);
  console.log(`  Portfolio:  http://localhost:${PORT}/api/portfolio`);
  console.log(`  Backtest:   http://localhost:${PORT}/api/backtest`);
  console.log('===========================================');
  console.log('  Live data: CoinGecko -> Binance failover');
  console.log('  Real RSI/MACD computed from Binance klines');
  console.log('  No simulated fallback - errors surface instead');
  console.log('===========================================');
});

process.on('SIGINT', () => {
  console.log('\n[DASHBOARD] Shutting down...');
  server.close(() => {
    console.log('[DASHBOARD] Server closed');
    process.exit(0);
  });
});
