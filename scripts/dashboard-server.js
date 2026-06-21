/**
 * AgentFlow Infra - Real-Time Dashboard Server
 * 
 * Fetches real market data from Bitget and serves the dashboard
 */

import 'dotenv/config';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.DASHBOARD_PORT || 3000;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const ENABLE_DEEPSEEK_AI = process.env.ENABLE_DEEPSEEK_AI !== 'false';
const ENABLE_BITGET_TESTNET = process.env.ENABLE_BITGET_TESTNET === 'true';

console.log('[CONFIG] DeepSeek AI:', DEEPSEEK_API_KEY ? 'Enabled' : 'Disabled (no API key)');
console.log('[CONFIG] Bitget Testnet:', ENABLE_BITGET_TESTNET ? 'Enabled' : 'Disabled (using public API)');

// Cache for market data
let marketDataCache = {
  btcTicker: null,
  ethTicker: null,
  solTicker: null,
  xrpTicker: null,
  lastUpdate: 0,
  cacheTTL: 30000 // 30 seconds
};

/**
 * Fetch real ticker data from Bitget public API V2
 */
async function fetchBitgetTicker(symbol) {
  try {
    const response = await fetch(`https://api.bitget.com/api/v2/spot/market/tickers?symbol=${symbol}`, {
      timeout: 5000
    });
    const result = await response.json();
    
    if (result.code === '00000' && result.data) {
      const data = Array.isArray(result.data) ? result.data[0] : result.data;
      return {
        symbol: symbol,
        lastPr: String(data.close || data.lastPr || data.last || data.closePrice || '0'),
        high24h: String(data.high24h || data.high || '0'),
        low24h: String(data.low24h || data.low || '0'),
        change24h: String(data.chg24h || data.change24h || data.change || data.changePercent || '0'),
        vol24h: String(data.vol || data.vol24h || data.volume || data.baseVolume || '0'),
        usdt24h: String(data.quoteVol || data.usdt24h || data.amount || data.turnover || data.quoteVolume || '0'),
        timestamp: Date.now()
      };
    }
    return null;
  } catch (error) {
    console.error('[BITGET] Failed to fetch ticker:', error.message);
    return getMockData(symbol);
  }
}

/**
 * Mock data fallback (used when API is unavailable)
 */
function getMockData(symbol) {
  const mockPrices = {
    'BTCUSDT': { price: 64000, change: 0.002, high: 64500, low: 63500, vol: 129000000 },
    'ETHUSDT': { price: 1725, change: -0.003, high: 1750, low: 1715, vol: 80000000 },
    'SOLUSDT': { price: 138, change: 0.01, high: 142, low: 135, vol: 25000000 },
    'XRPUSDT': { price: 0.52, change: -0.005, high: 0.54, low: 0.51, vol: 15000000 }
  };
  
  const mock = mockPrices[symbol] || mockPrices['BTCUSDT'];
  const price = mock.price * (1 + (Math.random() - 0.5) * 0.001);
  
  return {
    symbol: symbol,
    lastPr: String(price.toFixed(2)),
    high24h: String(mock.high),
    low24h: String(mock.low),
    change24h: String(mock.change),
    vol24h: String(mock.vol),
    usdt24h: String(mock.vol),
    timestamp: Date.now()
  };
}

/**
 * Get cached market data or fetch fresh
 */
async function getMarketData() {
  const now = Date.now();
  
  if (marketDataCache.btcTicker && marketDataCache.ethTicker && marketDataCache.solTicker && marketDataCache.xrpTicker &&
      (now - marketDataCache.lastUpdate) < marketDataCache.cacheTTL) {
    return {
      btc: marketDataCache.btcTicker,
      eth: marketDataCache.ethTicker,
      sol: marketDataCache.solTicker,
      xrp: marketDataCache.xrpTicker,
      cached: true
    };
  }
  
  console.log('[DASHBOARD] Fetching fresh market data from Bitget...');
  
  const [btcTicker, ethTicker, solTicker, xrpTicker] = await Promise.all([
    fetchBitgetTicker('BTCUSDT'),
    fetchBitgetTicker('ETHUSDT'),
    fetchBitgetTicker('SOLUSDT'),
    fetchBitgetTicker('XRPUSDT')
  ]);
  
  if (btcTicker && ethTicker) {
    marketDataCache = {
      btcTicker,
      ethTicker,
      solTicker,
      xrpTicker,
      lastUpdate: now,
      cacheTTL: 30000
    };
  }
  
  return {
    btc: btcTicker,
    eth: ethTicker,
    sol: solTicker,
    xrp: xrpTicker,
    cached: false
  };
}

/**
 * Load lifecycle log data
 */
function loadLifecycleData() {
  try {
    const lifecyclePath = path.join(__dirname, '..', 'lifecycle_log.json');
    if (fs.existsSync(lifecyclePath)) {
      const data = fs.readFileSync(lifecyclePath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('[DASHBOARD] Failed to load lifecycle log:', error.message);
  }
  return { bundles: [] };
}

/**
 * Generate AI reasoning from signals (local fallback)
 */
function generateLocalReasoning(signals, totalScore, recommendation, marketData, bullish, neutral, bearish) {
  bullish = bullish || signals.filter(s => s.score >= 60).length;
  neutral = neutral || signals.filter(s => s.score >= 40 && s.score < 60).length;
  bearish = bearish || signals.filter(s => s.score < 40).length;
  
  const reasoning = {
    timestamp: Date.now(),
    decision: recommendation,
    confidence: Math.round((Math.min(1, signals.length / 10)) * 100),
    summary: '',
    keyPoints: [],
    action: 'HOLD',
    rationale: ''
  };
  
  if (recommendation === 'STRONG_BUY' || recommendation === 'BUY') {
    reasoning.summary = `Bullish setup detected with ${bullish} strong signals. Market sentiment is positive.`;
    reasoning.action = recommendation === 'STRONG_BUY' ? 'STRONG_BUY' : 'BUY';
  } else if (recommendation === 'SELL' || recommendation === 'STRONG_SELL') {
    reasoning.summary = `Bearish setup detected with ${bearish} weak signals. Consider reducing exposure.`;
    reasoning.action = recommendation === 'STRONG_SELL' ? 'STRONG_SELL' : 'SELL';
  } else {
    reasoning.summary = `Mixed signals detected. Market is in consolidation. Wait for clearer direction.`;
    reasoning.action = 'HOLD';
  }
  
  if (marketData) {
    const cryptoKeys = Object.keys(marketData);
    if (cryptoKeys.length > 0) {
      const crypto = marketData[cryptoKeys[0]];
      if (crypto) {
        const cryptoChange = parseFloat(crypto.change24h) * 100;
        reasoning.keyPoints.push(`Price at $${parseFloat(crypto.lastPr).toLocaleString()} (${cryptoChange > 0 ? '+' : ''}${cryptoChange.toFixed(2)}%)`);
      }
    }
  }
  
  reasoning.rationale = `${reasoning.summary} Key factors: ${reasoning.keyPoints.join('. ')}. ` +
    `Overall score: ${totalScore.toFixed(1)}/100 with ${bullish} bullish, ${neutral} neutral, and ${bearish} bearish signals.`;
  
  return reasoning;
}

/**
 * Generate AI reasoning using DeepSeek API (if enabled)
 */
async function generateAIReasoning(signals, totalScore, recommendation, marketData, bullish, neutral, bearish, symbol = 'BTCUSDT') {
  // Use DeepSeek if enabled and API key is available
  if (ENABLE_DEEPSEEK_AI && DEEPSEEK_API_KEY) {
    try {
      const cryptoData = marketData[Object.keys(marketData)[0]];
      const reasoningRequest = {
        symbol,
        marketData: {
          price: parseFloat(cryptoData?.lastPr || '0'),
          change24h: parseFloat(cryptoData?.change24h || '0'),
          high24h: parseFloat(cryptoData?.high24h || '0'),
          low24h: parseFloat(cryptoData?.low24h || '0'),
          volume: parseFloat(cryptoData?.usdt24h || '0')
        },
        signals: signals.map(s => ({
          name: s.name,
          score: s.score,
          weight: s.weight,
          rationale: s.rationale
        })),
        totalScore,
        recommendation
      };
      
      // Import dynamically to avoid circular dependencies
      const { getDeepSeekReasoning } = await import('../src/ai-reasoning-engine.ts');
      const deepSeekReasoning = await getDeepSeekReasoning(reasoningRequest, DEEPSEEK_API_KEY);
      
      console.log('[DEEPSEEK] AI reasoning generated successfully');
      
      return {
        timestamp: Date.now(),
        decision: deepSeekReasoning.decision,
        confidence: deepSeekReasoning.confidence,
        summary: deepSeekReasoning.summary,
        keyPoints: deepSeekReasoning.keyPoints,
        action: deepSeekReasoning.decision,
        rationale: deepSeekReasoning.rationale,
        riskAssessment: deepSeekReasoning.riskAssessment,
        actionPlan: deepSeekReasoning.actionPlan
      };
    } catch (error) {
      console.error('[DEEPSEEK] Failed to get AI reasoning, using fallback:', error.message);
    }
  }
  
  // Fallback to local reasoning
  console.log('[AI] Using local reasoning (DeepSeek not enabled or failed)');
  return generateLocalReasoning(signals, totalScore, recommendation, marketData, bullish, neutral, bearish);
}

/**
 * Generate signal analysis from real market data
 */
async function generateSignals(activeSymbol = 'BTCUSDT') {
  // Make function async to support DeepSeek API calls
  try {
    const marketData = await getMarketData();
    const lifecycleData = loadLifecycleData();
    const bundles = lifecycleData.bundles || [];
    
    const signals = [];
    
    const btc = marketData?.btc || getMockData('BTCUSDT');
    const eth = marketData?.eth || getMockData('ETHUSDT');
    const sol = marketData?.sol || getMockData('SOLUSDT');
    const xrp = marketData?.xrp || getMockData('XRPUSDT');
    
    const activeCrypto = activeSymbol || 'BTCUSDT';
    const cryptoData = {
      'BTCUSDT': btc,
      'ETHUSDT': eth,
      'SOLUSDT': sol,
      'XRPUSDT': xrp
    }[activeCrypto] || btc;
    
    if (cryptoData) {
      const cryptoChange = parseFloat(cryptoData.change24h) || 0;
      const cryptoChangePercent = cryptoChange * 100;
      const cryptoPrice = parseFloat(cryptoData.lastPr) || 0;
      const cryptoVolume = parseFloat(cryptoData.usdt24h) || 0;
      const cryptoHigh = parseFloat(cryptoData.high24h) || 0;
      const cryptoLow = parseFloat(cryptoData.low24h) || 0;
      
      const cryptoName = activeCrypto.replace('USDT', '');
      
      // 1. Momentum Signal (12% weight)
      const momentumScore = cryptoChangePercent > 5 ? 80 : cryptoChangePercent > 2 ? 65 : cryptoChangePercent > 0 ? 55 : cryptoChangePercent > -2 ? 45 : cryptoChangePercent > -5 ? 35 : 20;
      signals.push({
        name: 'Momentum',
        score: momentumScore,
        weight: 0.12,
        rationale: `${cryptoName} 24h change: ${cryptoChangePercent.toFixed(2)}%, price: $${cryptoPrice.toLocaleString()}`,
        timestamp: Date.now()
      });
      
      // 2. Volatility Signal (10% weight)
      const volatility = cryptoLow > 0 ? ((cryptoHigh - cryptoLow) / cryptoLow) * 100 : 0;
      const volatilityScore = volatility > 3 && volatility < 10 ? 75 : volatility >= 10 && volatility < 15 ? 60 : volatility < 3 ? 40 : 30;
      signals.push({
        name: 'Volatility',
        score: volatilityScore,
        weight: 0.10,
        rationale: `${cryptoName} 24h volatility: ${volatility.toFixed(2)}% (H: $${cryptoHigh.toLocaleString()}, L: $${cryptoLow.toLocaleString()})`,
        timestamp: Date.now()
      });
      
      // 3. Trend Signal (12% weight)
      const trendScore = cryptoChangePercent > 3 ? 80 : cryptoChangePercent > 0 ? 60 : cryptoChangePercent > -3 ? 40 : 20;
      signals.push({
        name: 'Trend',
        score: trendScore,
        weight: 0.12,
        rationale: `${cryptoName} short-term trend: ${cryptoChangePercent > 0 ? 'BULLISH' : 'BEARISH'} (${cryptoChangePercent.toFixed(2)}%)`,
        timestamp: Date.now()
      });
      
      // 4. Volume Analysis Signal (10% weight)
      const volumeScore = cryptoVolume > 1_000_000_000 ? 85 : cryptoVolume > 100_000_000 ? 70 : cryptoVolume > 10_000_000 ? 55 : 35;
      signals.push({
        name: 'Volume',
        score: volumeScore,
        weight: 0.10,
        rationale: `${cryptoName} 24h volume: $${(cryptoVolume / 1_000_000).toFixed(0)}M`,
        timestamp: Date.now()
      });
      
      // 5. RSI Signal (12% weight)
      const simulatedRSI = 50 + (cryptoChangePercent * 2);
      const rsiScore = simulatedRSI < 20 ? 85 : simulatedRSI < 30 ? 70 : simulatedRSI < 45 ? 55 : simulatedRSI < 55 ? 50 : simulatedRSI < 65 ? 45 : simulatedRSI < 75 ? 30 : 15;
      signals.push({
        name: 'RSI',
        score: Math.max(0, Math.min(100, rsiScore)),
        weight: 0.12,
        rationale: `${cryptoName} RSI: ${Math.max(0, Math.min(100, simulatedRSI)).toFixed(1)} (Simulated)`,
        timestamp: Date.now()
      });
      
      // 6. MACD Signal (10% weight)
      const macdHistogram = cryptoChangePercent * 0.5;
      const macdScore = macdHistogram > 0 ? 70 : macdHistogram > -1 ? 50 : 30;
      signals.push({
        name: 'MACD',
        score: macdScore,
        weight: 0.10,
        rationale: `${cryptoName} MACD Histogram: ${macdHistogram.toFixed(2)} (${macdHistogram > 0 ? 'Bullish' : 'Bearish'})`,
        timestamp: Date.now()
      });
      
      // 7. Market Regime Signal (10% weight)
      let regime = 'SIDEWAYS';
      let regimeScore = 50;
      if (cryptoChangePercent > 5) { regime = 'BULL'; regimeScore = 85; }
      else if (cryptoChangePercent > 2) { regime = 'BULL'; regimeScore = 70; }
      else if (cryptoChangePercent < -5) { regime = 'BEAR'; regimeScore = 15; }
      else if (cryptoChangePercent < -2) { regime = 'BEAR'; regimeScore = 30; }
      
      signals.push({
        name: 'Market Regime',
        score: regimeScore,
        weight: 0.10,
        rationale: `${cryptoName} market regime: ${regime} (${cryptoChangePercent.toFixed(2)}%)`,
        timestamp: Date.now(),
        data: { regime, change24h: cryptoChangePercent }
      });
      
      // 8. Support/Resistance Signal (8% weight)
      const rangePosition = ((cryptoPrice - cryptoLow) / (cryptoHigh - cryptoLow)) * 100;
      const srScore = 100 - rangePosition;
      signals.push({
        name: 'Support/Resistance',
        score: Math.max(0, Math.min(100, srScore)),
        weight: 0.08,
        rationale: `${cryptoName} price position: ${rangePosition.toFixed(1)}% of 24h range (${rangePosition > 50 ? 'Near Resistance' : 'Near Support'})`,
        timestamp: Date.now()
      });
      
      // 9. Sentiment Signal (8% weight)
      const sentimentScore = cryptoChangePercent > 0 ? 60 + Math.min(20, cryptoChangePercent * 2) : 40 - Math.min(20, Math.abs(cryptoChangePercent) * 2);
      signals.push({
        name: 'Sentiment',
        score: Math.max(0, Math.min(100, sentimentScore)),
        weight: 0.08,
        rationale: `${cryptoName} market sentiment: ${sentimentScore > 60 ? 'Bullish' : sentimentScore > 40 ? 'Neutral' : 'Bearish'}`,
        timestamp: Date.now()
      });
      
      // 10. Risk Signal (8% weight)
      const riskScore = Math.max(0, 100 - volatility * 5);
      signals.push({
        name: 'Risk Assessment',
        score: riskScore,
        weight: 0.08,
        rationale: `${cryptoName} risk level: ${riskScore > 70 ? 'LOW' : riskScore > 40 ? 'MEDIUM' : 'HIGH'} (vol: ${volatility.toFixed(2)}%)`,
        timestamp: Date.now()
      });
    }
    
    const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0);
    const weightedScore = signals.length > 0 
      ? signals.reduce((sum, s) => sum + s.score * s.weight, 0) / totalWeight 
      : 50;
    
    let recommendation = 'HOLD';
    if (weightedScore >= 80) recommendation = 'STRONG_BUY';
    else if (weightedScore >= 65) recommendation = 'BUY';
    else if (weightedScore >= 50) recommendation = 'HOLD';
    else if (weightedScore >= 35) recommendation = 'SELL';
    else recommendation = 'STRONG_SELL';
    
    const bullish = signals.filter(s => s.score >= 60).length;
    const neutral = signals.filter(s => s.score >= 40 && s.score < 60).length;
    const bearish = signals.filter(s => s.score < 40).length;
    
    console.log('[DASHBOARD] Generated', signals.length, 'signals:', signals.map(s => s.name));
    
    const aiReasoning = await generateAIReasoning(signals, weightedScore, recommendation, { [activeCrypto.toLowerCase().replace('usdt', '')]: cryptoData }, bullish, neutral, bearish, activeCrypto);
    
    return {
      timestamp: Date.now(),
      symbol: activeCrypto,
      totalScore: Math.round(weightedScore * 100) / 100,
      recommendation,
      confidence: Math.min(1, signals.length / 10),
      signals,
      summary: {
        bullish,
        neutral,
        bearish,
        marketRegime: signals.find(s => s.name === 'Market Regime')?.data?.regime || 'UNKNOWN'
      },
      aiReasoning,
      marketData: {
        btc,
        eth,
        sol,
        xrp
      }
    };
  } catch (error) {
    console.error('[DASHBOARD] Error generating signals:', error);
    console.error('[DASHBOARD] Stack trace:', error.stack);
    return {
      timestamp: Date.now(),
      symbol: 'BTCUSDT',
      totalScore: 50,
      recommendation: 'HOLD',
      confidence: 0.5,
      signals: [],
      summary: { bullish: 0, neutral: 0, bearish: 0, marketRegime: 'UNKNOWN' },
      aiReasoning: { 
        decision: 'HOLD', 
        confidence: 50, 
        summary: `Error: ${error.message}`, 
        keyPoints: [error.stack], 
        rationale: 'Server error - check terminal for details' 
      },
      marketData: { btc: getMockData('BTCUSDT'), eth: getMockData('ETHUSDT'), sol: getMockData('SOLUSDT'), xrp: getMockData('XRPUSDT') }
    };
  }
}

/**
 * Generate mock portfolio data
 */
function generateMockPortfolio() {
  const positions = [
    { symbol: 'BTCUSDT', amount: 0.05, entryPrice: 63500, currentPrice: 64174, side: 'long', openedAt: Date.now() - 86400000 },
    { symbol: 'ETHUSDT', amount: 2.5, entryPrice: 1720, currentPrice: 1734, side: 'long', openedAt: Date.now() - 43200000 },
    { symbol: 'SOLUSDT', amount: 50, entryPrice: 142, currentPrice: 138, side: 'long', openedAt: Date.now() - 21600000 }
  ];
  
  const positionsWithPnL = positions.map(pos => {
    const pnl = pos.side === 'long' ? (pos.currentPrice - pos.entryPrice) * pos.amount : (pos.entryPrice - pos.currentPrice) * pos.amount;
    const pnlPercent = ((pos.currentPrice - pos.entryPrice) / pos.entryPrice) * 100;
    return { ...pos, pnl, pnlPercent };
  });
  
  const totalValue = positions.reduce((sum, pos) => sum + pos.currentPrice * pos.amount, 0);
  const unrealizedPnL = positionsWithPnL.reduce((sum, pos) => sum + pos.pnl, 0);
  const realizedPnL = 1250;
  
  return {
    totalValue,
    totalPnL: unrealizedPnL + realizedPnL,
    totalPnLPercent: (unrealizedPnL + realizedPnL) / (totalValue - realizedPnL) * 100,
    realizedPnL,
    unrealizedPnL,
    positions: positionsWithPnL,
    allocation: positions.map(pos => ({ symbol: pos.symbol, percentage: (pos.currentPrice * pos.amount / totalValue) * 100 })),
    winRate: 64,
    totalTrades: 25,
    winningTrades: 16,
    losingTrades: 9,
    avgWin: 185.50,
    avgLoss: 95.20,
    profitFactor: 1.95,
    sharpeRatio: 1.42,
    maxDrawdown: 450
  };
}

/**
 * Generate mock backtest data
 */
function generateMockBacktest() {
  const trades = Array.from({ length: 15 }, (_, i) => {
    const pnl = (Math.random() - 0.4) * 300;
    return {
      entryPrice: 63000 + Math.random() * 2000,
      exitPrice: 63000 + Math.random() * 2000,
      entryTime: Date.now() - (15 - i) * 86400000,
      exitTime: Date.now() - (14 - i) * 86400000,
      side: Math.random() > 0.5 ? 'long' : 'short',
      amount: 0.01 + Math.random() * 0.04,
      pnl,
      pnlPercent: (pnl / 64000) * 100,
      fees: 2.5,
      exitReason: ['take-profit', 'stop-loss', 'signal-reverse'][Math.floor(Math.random() * 3)]
    };
  });
  
  const equityCurve = trades.map((t, i) => ({
    timestamp: t.exitTime,
    value: 10000 + trades.slice(0, i + 1).reduce((sum, trade) => sum + trade.pnl, 0)
  }));
  
  const winningTrades = trades.filter(t => t.pnl > 0);
  const losingTrades = trades.filter(t => t.pnl <= 0);
  
  return {
    totalReturn: trades.reduce((sum, t) => sum + t.pnl, 0),
    totalReturnPercent: (trades.reduce((sum, t) => sum + t.pnl, 0) / 10000) * 100,
    totalTrades: trades.length,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    winRate: (winningTrades.length / trades.length) * 100,
    avgWin: winningTrades.length > 0 ? winningTrades.reduce((sum, t) => sum + t.pnl, 0) / winningTrades.length : 0,
    avgLoss: losingTrades.length > 0 ? Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0) / losingTrades.length) : 0,
    profitFactor: 1.85,
    sharpeRatio: 1.35,
    maxDrawdown: 520,
    maxDrawdownPercent: 5.2,
    avgTradeDuration: 28.5,
    bestTrade: Math.max(...trades.map(t => t.pnl)),
    worstTrade: Math.min(...trades.map(t => t.pnl)),
    consecutiveWins: 5,
    consecutiveLosses: 3,
    trades,
    equityCurve
  };
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  if (url.pathname === '/api/market-data') {
    try {
      const marketData = await getMarketData();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(marketData));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }
  
  if (url.pathname === '/api/signals') {
    try {
      const symbol = url.searchParams.get('symbol') || 'BTCUSDT';
      const signals = await generateSignals(symbol);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(signals));
    } catch (error) {
      console.error('[DASHBOARD] Signals API error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message, stack: error.stack }));
    }
    return;
  }
  
  if (url.pathname === '/api/lifecycle') {
    try {
      const lifecycleData = loadLifecycleData();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(lifecycleData));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }
  
  if (url.pathname === '/api/portfolio') {
    try {
      const portfolioData = generateMockPortfolio();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(portfolioData));
    } catch (error) {
      console.error('[DASHBOARD] Portfolio API error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }
  
  if (url.pathname === '/api/backtest') {
    try {
      const backtestData = generateMockBacktest();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(backtestData));
    } catch (error) {
      console.error('[DASHBOARD] Backtest API error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }
  
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
    '.svg': 'image/svg+xml'
  };
  
  const contentType = contentTypes[ext] || 'application/octet-stream';
  
  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
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
  console.log(`  API:        http://localhost:${PORT}/api/signals`);
  console.log(`  Market:     http://localhost:${PORT}/api/market-data`);
  console.log(`  Lifecycle:  http://localhost:${PORT}/api/lifecycle`);
  console.log('===========================================');
  console.log('  Real-time data from Bitget');
  console.log('  10-signal engine (inspired by DCA Claw)');
  console.log('  Auto-refresh every 5 seconds');
  console.log('===========================================');
});

process.on('SIGINT', () => {
  console.log('\n[DASHBOARD] Shutting down...');
  server.close(() => {
    console.log('[DASHBOARD] Server closed');
    process.exit(0);
  });
});
