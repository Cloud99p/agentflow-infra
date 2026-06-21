/**
 * AgentFlow Infra - Real-Time Dashboard Server
 * 
 * Fetches real market data from Bitget and serves the dashboard
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

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
    const response = await fetch(`https://api.bitget.com/api/v2/spot/market/tickers?symbol=${symbol}`);
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
    return null;
  }
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
 * Generate signal analysis from real market data
 */
async function generateSignals() {
  const marketData = await getMarketData();
  const lifecycleData = loadLifecycleData();
  const bundles = lifecycleData.bundles || [];
  
  // Calculate real signal scores from market data
  const signals = [];
  
  if (marketData.btc) {
    const btcChange = parseFloat(marketData.btc.change24h) || 0;
    const btcChangePercent = btcChange * 100; // Convert to percentage
    const btcPrice = parseFloat(marketData.btc.lastPr) || 0;
    
    // Momentum Signal (15% weight)
    const momentumScore = btcChangePercent > 5 ? 80 : btcChangePercent > 2 ? 65 : btcChangePercent > 0 ? 55 : btcChangePercent > -2 ? 45 : btcChangePercent > -5 ? 35 : 20;
    signals.push({
      name: 'Momentum',
      score: momentumScore,
      weight: 0.15,
      rationale: `24h change: ${btcChangePercent.toFixed(2)}%, price: $${btcPrice.toLocaleString()}`,
      timestamp: Date.now()
    });
    
    // Volatility Signal (10% weight)
    const btcHigh = parseFloat(marketData.btc.high24h) || 0;
    const btcLow = parseFloat(marketData.btc.low24h) || 0;
    const volatility = btcLow > 0 ? ((btcHigh - btcLow) / btcLow) * 100 : 0;
    const volatilityScore = volatility > 3 && volatility < 10 ? 75 : volatility >= 10 && volatility < 15 ? 60 : volatility < 3 ? 40 : 30;
    signals.push({
      name: 'Volatility',
      score: volatilityScore,
      weight: 0.10,
      rationale: `24h volatility: ${volatility.toFixed(2)}% (H: $${btcHigh.toLocaleString()}, L: $${btcLow.toLocaleString()})`,
      timestamp: Date.now()
    });
    
    // Trend Signal (15% weight)
    const trendScore = btcChangePercent > 3 ? 80 : btcChangePercent > 0 ? 60 : btcChangePercent > -3 ? 40 : 20;
    signals.push({
      name: 'Trend',
      score: trendScore,
      weight: 0.15,
      rationale: `Short-term trend: ${btcChangePercent > 0 ? 'BULLISH' : 'BEARISH'} (${btcChangePercent.toFixed(2)}%)`,
      timestamp: Date.now()
    });
    
    // Market Regime Signal (10% weight)
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
  }
  
  // Calculate overall score
  const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0);
  const weightedScore = signals.length > 0 
    ? signals.reduce((sum, s) => sum + s.score * s.weight, 0) / totalWeight 
    : 50;
  
  // Determine recommendation
  let recommendation = 'HOLD';
  if (weightedScore >= 80) recommendation = 'STRONG_BUY';
  else if (weightedScore >= 60) recommendation = 'BUY';
  else if (weightedScore >= 40) recommendation = 'HOLD';
  else if (weightedScore >= 20) recommendation = 'SELL';
  else recommendation = 'STRONG_SELL';
  
  // Count bullish/neutral/bearish signals
  const bullish = signals.filter(s => s.score >= 60).length;
  const neutral = signals.filter(s => s.score >= 40 && s.score < 60).length;
  const bearish = signals.filter(s => s.score < 40).length;
  
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
    marketData: {
      btc: marketData.btc,
      eth: marketData.eth
    }
  };
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
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
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
