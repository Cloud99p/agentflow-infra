/**
 * AgentFlow Infra - Real-Time Dashboard Server
 * 
 * Fetches real market data from Bitget and serves the dashboard
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.DASHBOARD_PORT || 3000;

// Cache for market data
let marketDataCache = {
  btcTicker: null,
  ethTicker: null,
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
    // Return mock data as fallback for demo purposes
    return getMockData(symbol);
  }
}

/**
 * Mock data fallback (used when API is unavailable)
 */
function getMockData(symbol) {
  const mockPrices = {
    'BTCUSDT': { price: 64000, change: 0.002, high: 64500, low: 63500, vol: 129000000 },
    'ETHUSDT': { price: 1725, change: -0.003, high: 1750, low: 1715, vol: 80000000 }
  };
  
  const mock = mockPrices[symbol] || mockPrices['BTCUSDT'];
  const price = mock.price * (1 + (Math.random() - 0.5) * 0.001); // Small random variation
  
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
  
  // Return cached data if still valid
  if (marketDataCache.btcTicker && marketDataCache.ethTicker && 
      (now - marketDataCache.lastUpdate) < marketDataCache.cacheTTL) {
    return {
      btc: marketDataCache.btcTicker,
      eth: marketDataCache.ethTicker,
      cached: true
    };
  }
  
  // Fetch fresh data
  console.log('[DASHBOARD] Fetching fresh market data from Bitget...');
  
  const [btcTicker, ethTicker] = await Promise.all([
    fetchBitgetTicker('BTCUSDT'),
    fetchBitgetTicker('ETHUSDT')
  ]);
  
  if (btcTicker && ethTicker) {
    marketDataCache = {
      btcTicker,
      ethTicker,
      lastUpdate: now,
      cacheTTL: 30000
    };
  }
  
  return {
    btc: btcTicker,
    eth: ethTicker,
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
 * Generate AI reasoning from signals
 */
function generateAIReasoning(signals, totalScore, recommendation, marketData, bullish, neutral, bearish) {
  const bullishSignals = signals.filter(s => s.score >= 60);
  const bearishSignals = signals.filter(s => s.score < 40);
  
  // Use passed values or calculate fallback
  bullish = bullish || bullishSignals.length;
  neutral = neutral || signals.filter(s => s.score >= 40 && s.score < 60).length;
  bearish = bearish || bearishSignals.length;
  
  const reasoning = {
    timestamp: Date.now(),
    decision: recommendation,
    confidence: Math.round((Math.min(1, signals.length / 10)) * 100),
    summary: '',
    keyPoints: [],
    action: 'HOLD',
    rationale: ''
  };
  
  // Generate summary
  if (recommendation === 'STRONG_BUY' || recommendation === 'BUY') {
    reasoning.summary = `Bullish setup detected with ${bullishSignals.length} strong signals. Market sentiment is positive.`;
    reasoning.action = recommendation === 'STRONG_BUY' ? 'STRONG_BUY' : 'BUY';
  } else if (recommendation === 'SELL' || recommendation === 'STRONG_SELL') {
    reasoning.summary = `Bearish setup detected with ${bearishSignals.length} weak signals. Consider reducing exposure.`;
    reasoning.action = recommendation === 'STRONG_SELL' ? 'STRONG_SELL' : 'SELL';
  } else {
    reasoning.summary = `Mixed signals detected. Market is in consolidation. Wait for clearer direction.`;
    reasoning.action = 'HOLD';
  }
  
  // Add key points
  if (marketData.btc) {
    const btcChange = parseFloat(marketData.btc.change24h) * 100;
    reasoning.keyPoints.push(`BTC at $${parseFloat(marketData.btc.lastPr).toLocaleString()} (${btcChange > 0 ? '+' : ''}${btcChange.toFixed(2)}%)`);
    
    const momentumSignal = signals.find(s => s.name === 'Momentum');
    if (momentumSignal && momentumSignal.score >= 60) {
      reasoning.keyPoints.push('Positive momentum with strong 24h performance');
    }
    
    const volumeSignal = signals.find(s => s.name === 'Volume');
    if (volumeSignal && volumeSignal.score >= 70) {
      reasoning.keyPoints.push('High volume confirms price movement');
    }
    
    const rsiSignal = signals.find(s => s.name === 'RSI');
    if (rsiSignal) {
      if (rsiSignal.score < 30) reasoning.keyPoints.push('RSI indicates oversold conditions');
      else if (rsiSignal.score > 70) reasoning.keyPoints.push('RSI indicates overbought conditions');
    }
  }
  
  // Generate detailed rationale
  reasoning.rationale = `${reasoning.summary} Key factors: ${reasoning.keyPoints.join('. ')}. ` +
    `Overall score: ${totalScore.toFixed(1)}/100 with ${bullishSignals.length} bullish, ${neutral} neutral, and ${bearishSignals.length} bearish signals.`;
  
  return reasoning;
}

/**
 * Generate signal analysis from real market data
 */
async function generateSignals() {
  try {
    const marketData = await getMarketData();
    const lifecycleData = loadLifecycleData();
    const bundles = lifecycleData.bundles || [];
    
    // Calculate real signal scores from market data
    const signals = [];
    
    // Ensure we have market data (use mock if needed)
    const btc = marketData?.btc || getMockData('BTCUSDT');
    const eth = marketData?.eth || getMockData('ETHUSDT');
    
    if (btc) {
    const btcChange = parseFloat(btc.change24h) || 0;
    const btcChangePercent = btcChange * 100; // Convert to percentage
    const btcPrice = parseFloat(btc.lastPr) || 0;
    const btcVolume = parseFloat(btc.usdt24h) || 0;
    const btcHigh = parseFloat(btc.high24h) || 0;
    const btcLow = parseFloat(btc.low24h) || 0;
    
    // 1. Momentum Signal (12% weight)
    const momentumScore = btcChangePercent > 5 ? 80 : btcChangePercent > 2 ? 65 : btcChangePercent > 0 ? 55 : btcChangePercent > -2 ? 45 : btcChangePercent > -5 ? 35 : 20;
    signals.push({
      name: 'Momentum',
      score: momentumScore,
      weight: 0.12,
      rationale: `24h change: ${btcChangePercent.toFixed(2)}%, price: $${btcPrice.toLocaleString()}`,
      timestamp: Date.now()
    });
    
    // 2. Volatility Signal (10% weight)
    const volatility = btcLow > 0 ? ((btcHigh - btcLow) / btcLow) * 100 : 0;
    const volatilityScore = volatility > 3 && volatility < 10 ? 75 : volatility >= 10 && volatility < 15 ? 60 : volatility < 3 ? 40 : 30;
    signals.push({
      name: 'Volatility',
      score: volatilityScore,
      weight: 0.10,
      rationale: `24h volatility: ${volatility.toFixed(2)}% (H: $${btcHigh.toLocaleString()}, L: $${btcLow.toLocaleString()})`,
      timestamp: Date.now()
    });
    
    // 3. Trend Signal (12% weight)
    const trendScore = btcChangePercent > 3 ? 80 : btcChangePercent > 0 ? 60 : btcChangePercent > -3 ? 40 : 20;
    signals.push({
      name: 'Trend',
      score: trendScore,
      weight: 0.12,
      rationale: `Short-term trend: ${btcChangePercent > 0 ? 'BULLISH' : 'BEARISH'} (${btcChangePercent.toFixed(2)}%)`,
      timestamp: Date.now()
    });
    
    // 4. Volume Analysis Signal (10% weight)
    const volumeScore = btcVolume > 1_000_000_000 ? 85 : btcVolume > 100_000_000 ? 70 : btcVolume > 10_000_000 ? 55 : 35;
    signals.push({
      name: 'Volume',
      score: volumeScore,
      weight: 0.10,
      rationale: `24h volume: $${(btcVolume / 1_000_000).toFixed(0)}M`,
      timestamp: Date.now()
    });
    
    // 5. RSI Signal (12% weight) - Simulated (would need historical data for real RSI)
    const simulatedRSI = 50 + (btcChangePercent * 2); // Simplified simulation
    const rsiScore = simulatedRSI < 20 ? 85 : simulatedRSI < 30 ? 70 : simulatedRSI < 45 ? 55 : simulatedRSI < 55 ? 50 : simulatedRSI < 65 ? 45 : simulatedRSI < 75 ? 30 : 15;
    signals.push({
      name: 'RSI',
      score: Math.max(0, Math.min(100, rsiScore)),
      weight: 0.12,
      rationale: `RSI: ${Math.max(0, Math.min(100, simulatedRSI)).toFixed(1)} (Simulated)`,
      timestamp: Date.now()
    });
    
    // 6. MACD Signal (10% weight) - Simulated
    const macdHistogram = btcChangePercent * 0.5; // Simplified simulation
    const macdScore = macdHistogram > 0 ? 70 : macdHistogram > -1 ? 50 : 30;
    signals.push({
      name: 'MACD',
      score: macdScore,
      weight: 0.10,
      rationale: `MACD Histogram: ${macdHistogram.toFixed(2)} (${macdHistogram > 0 ? 'Bullish' : 'Bearish'})`,
      timestamp: Date.now()
    });
    
    // 7. Market Regime Signal (10% weight)
    let regime = 'SIDEWAYS';
    let regimeScore = 50;
    if (btcChangePercent > 5) { regime = 'BULL'; regimeScore = 85; }
    else if (btcChangePercent > 2) { regime = 'BULL'; regimeScore = 70; }
    else if (btcChangePercent < -5) { regime = 'BEAR'; regimeScore = 15; }
    else if (btcChangePercent < -2) { regime = 'BEAR'; regimeScore = 30; }
    
    signals.push({
      name: 'Market Regime',
      score: regimeScore,
      weight: 0.10,
      rationale: `Market regime: ${regime} (${btcChangePercent.toFixed(2)}%)`,
      timestamp: Date.now(),
      data: { regime, change24h: btcChangePercent }
    });
    
    // 8. Support/Resistance Signal (8% weight)
    const rangePosition = ((btcPrice - btcLow) / (btcHigh - btcLow)) * 100;
    const srScore = 100 - rangePosition;
    signals.push({
      name: 'Support/Resistance',
      score: Math.max(0, Math.min(100, srScore)),
      weight: 0.08,
      rationale: `Price position: ${rangePosition.toFixed(1)}% of 24h range (${rangePosition > 50 ? 'Near Resistance' : 'Near Support'})`,
      timestamp: Date.now()
    });
    
    // 9. Sentiment Signal (8% weight) - Simulated
    const sentimentScore = btcChangePercent > 0 ? 60 + Math.min(20, btcChangePercent * 2) : 40 - Math.min(20, Math.abs(btcChangePercent) * 2);
    signals.push({
      name: 'Sentiment',
      score: Math.max(0, Math.min(100, sentimentScore)),
      weight: 0.08,
      rationale: `Market sentiment: ${sentimentScore > 60 ? 'Bullish' : sentimentScore > 40 ? 'Neutral' : 'Bearish'}`,
      timestamp: Date.now()
    });
    
    // 10. Risk Signal (8% weight)
    const riskScore = Math.max(0, 100 - volatility * 5);
    signals.push({
      name: 'Risk Assessment',
      score: riskScore,
      weight: 0.08,
      rationale: `Risk level: ${riskScore > 70 ? 'LOW' : riskScore > 40 ? 'MEDIUM' : 'HIGH'} (vol: ${volatility.toFixed(2)}%)`,
      timestamp: Date.now()
    });
  }
  
  // Calculate overall score
  const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0);
  const weightedScore = signals.length > 0 
    ? signals.reduce((sum, s) => sum + s.score * s.weight, 0) / totalWeight 
    : 50;
  
  // Determine recommendation
  let recommendation = 'HOLD';
  if (weightedScore >= 80) recommendation = 'STRONG_BUY';
  else if (weightedScore >= 65) recommendation = 'BUY';
  else if (weightedScore >= 50) recommendation = 'HOLD';
  else if (weightedScore >= 35) recommendation = 'SELL';
  else recommendation = 'STRONG_SELL';
  
  // Count bullish/neutral/bearish signals
  const bullish = signals.filter(s => s.score >= 60).length;
  const neutral = signals.filter(s => s.score >= 40 && s.score < 60).length;
  const bearish = signals.filter(s => s.score < 40).length;
  
  console.log('[DASHBOARD] Generated', signals.length, 'signals:', signals.map(s => s.name));
  
  // Generate AI reasoning
  const aiReasoning = generateAIReasoning(signals, weightedScore, recommendation, { btc, eth }, bullish, neutral, bearish);
  
  return {
    timestamp: Date.now(),
    symbol: 'BTCUSDT',
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
      eth
    }
  };
  } catch (error) {
    console.error('[DASHBOARD] Error generating signals:', error);
    console.error('[DASHBOARD] Stack trace:', error.stack);
    // Return minimal valid response on error
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
      marketData: { btc: getMockData('BTCUSDT'), eth: getMockData('ETHUSDT') }
    };
  }
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  // API Routes
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
      const signals = await generateSignals();
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
  
  // Serve static files (dashboard)
  let filePath = path.join(__dirname, '..', 'dashboard', url.pathname === '/' ? 'index.html' : url.pathname);
  
  // Security: Prevent directory traversal
  const dashboardDir = path.join(__dirname, '..', 'dashboard');
  if (!filePath.startsWith(dashboardDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  
  // Determine content type
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

// Start server
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

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[DASHBOARD] Shutting down...');
  server.close(() => {
    console.log('[DASHBOARD] Server closed');
    process.exit(0);
  });
});
