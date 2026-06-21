# AgentFlow Infra - Setup Guide

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment (Optional)

**The dashboard works WITHOUT any API keys!** But for AI features:

```bash
cp .env.example .env
nano .env  # Or use your preferred editor
```

Edit `.env`:

```env
# DeepSeek API for AI Reasoning (Recommended)
# Get your key at: https://platform.deepseek.com/
DEEPSEEK_API_KEY=sk-your-deepseek-api-key-here
ENABLE_DEEPSEEK_AI=true

# AI Cache Settings (saves credits!)
# How long to cache AI reasoning before refreshing
DEEPSEEK_CACHE_TTL=300000  # 5 minutes (default)

# Dashboard Configuration
DASHBOARD_PORT=3000
```

### 3. Start Dashboard

```bash
npm run dashboard
```

Open **http://localhost:3000**

---

## What Works Without API Keys

✅ **Real-time Bitget market data** (BTC, ETH, SOL, XRP prices)
✅ **All 10 technical signals** (Momentum, RSI, MACD, etc.)
✅ **Portfolio tracking** (mock data for demo)
✅ **Backtesting view** (mock data for demo)
✅ **Dashboard auto-refresh** (every 5 seconds)
✅ **Crypto selector** (switch between BTC/ETH/SOL/XRP)

⚠️ **AI Reasoning** uses local fallback (still functional, just not DeepSeek-powered)

---

## What You Get WITH API Keys

### DeepSeek API Key

✅ **Professional AI analysis** - Expert trading insights
✅ **Detailed rationale** - Why BUY/HOLD/SELL
✅ **Action plans** - Specific steps to take
✅ **Risk assessment** - Risk level and factors
✅ **Smart caching** - Updates every 5 minutes (saves 95% on costs!)

**Cost:** ~$0.50-1/day with caching (vs $10-20/day without)

**Get your key:** https://platform.deepseek.com/

---

## Features

### AI Reasoning with DeepSeek

When you configure your DeepSeek API key, the dashboard will use advanced AI to analyze signals and provide:

- **Detailed market analysis** from an expert trading AI
- **Actionable recommendations** with confidence scores
- **Risk assessment** for each trade
- **Step-by-step action plans**

**Without DeepSeek:** Uses local rule-based reasoning (still works great!)

**With DeepSeek:** Gets professional-grade AI analysis

### Bitget Demo Trading (Simulation Mode)

**Note:** Bitget uses **Demo Trading** (simulation mode) instead of a separate testnet.

When you use Bitget Demo Trading:

- **Practice with virtual funds** (50,000 USDT provided)
- **Real market conditions** - mirrors live prices
- **Test strategies risk-free** - no real money involved
- **Available by default** - no activation needed

**How to Access:**
- **Website:** Hover over "Futures" → Click "Demo Trading"
- **App:** Futures → "..." icon → Demo Trading

**Without Demo:** Uses public Bitget API for market data + mock portfolio

**With Demo:** Full trading simulation with virtual funds

---

## API Keys

### DeepSeek API

1. Go to https://platform.deepseek.com/
2. Sign up / Log in
3. Navigate to API Keys
4. Create a new key
5. Copy to `.env` as `DEEPSEEK_API_KEY`

**Cost:** Very affordable (~$0.001-0.01 per analysis)

### Bitget Demo Trading & API

**Important:** Bitget doesn't have a separate testnet. They use **Demo Trading** (simulation mode).

**Option 1: Demo Trading (Recommended for Testing)**

1. Go to https://www.bitget.com/
2. Sign up for account
3. **Access Demo Trading:**
   - **Website:** Hover over "Futures" → Click "Demo Trading"
   - **App:** Futures → "..." icon → Demo Trading
4. **Virtual Funds:** 50,000 USDT provided automatically
5. **Supported Pairs:**
   - USDT-M: BTCUSDT, ETHUSDT, ADAUSDT, XRPUSDT, etc.
   - Coin-M: BTCUSD, ETHUSD
   - USDC-M: BTCPERP, ETPERP
6. **No API keys needed** - Demo is available by default

**Option 2: API Integration (For Development)**

For API testing and integration:

1. Go to https://www.bitget.com/
2. Sign up and complete verification
3. Go to **Profile** → **API Management**
4. **Create API Key:**
   - ✅ **Read** permissions (market data)
   - ✅ **Trade** permissions (order testing)
   - ❌ **Withdraw** permissions (NEVER enable!)
5. **Copy to `.env`:**
   ```env
   BITGET_API_KEY=your-api-key
   BITGET_SECRET_KEY=your-secret-key
   BITGET_PASSPHRASE=your-passphrase
   ```

**⚠️ Safety Tips:**
- Use Demo Trading for strategy testing (virtual funds)
- Use small amounts for API testing on mainnet
- Never enable withdraw permissions on API keys
- Test thoroughly before using real funds

---

## Dashboard Features

### Signal Engine (10 Signals)

1. **Momentum** (12%) - 24h price momentum
2. **Volatility** (10%) - Price volatility analysis
3. **Trend** (12%) - Short-term trend direction
4. **Volume** (10%) - Trading volume analysis
5. **RSI** (12%) - Overbought/Oversold indicator
6. **MACD** (10%) - Momentum convergence/divergence
7. **Market Regime** (10%) - BULL/BEAR/SIDEWAYS
8. **Support/Resistance** (8%) - Price position in range
9. **Sentiment** (8%) - Market sentiment
10. **Risk Assessment** (8%) - Overall risk level

### Portfolio Tracking

- Total portfolio value
- Realized + Unrealized PnL
- Win rate and profit factor
- Position allocation
- Equity curve

### Backtesting

- Historical strategy testing
- Win rate analysis
- Sharpe ratio
- Max drawdown
- Trade-by-trade breakdown

---

## Troubleshooting

### Dashboard won't start

```bash
# Check Node version (need 18+)
node --version

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### API errors

- Check your internet connection
- Verify API keys in `.env`
- Check Bitget API status: https://status.bitget.com/

### DeepSeek not working

- Verify API key is correct
- Check ENABLE_DEEPSEEK_AI=true in `.env`
- Check console for error messages

---

## 📋 Commands Reference

### Dashboard

```bash
# Start dashboard
npm run dashboard

# Open in browser
# http://localhost:3000
```

### Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run tests
npm test

# Test Bitget integration
npm run test:bitget
```

### Full Setup

```bash
# Dashboard with lifecycle sync
npm run dashboard:full

# Clean build
npm run clean && npm run build
```

### Utilities

```bash
# Lint code
npm run lint

# Clean dist folder
npm run clean
```

---

## ❓ FAQ

**Q: Do I need API keys?**  
A: No! The dashboard works without any API keys. DeepSeek AI key is optional for enhanced AI analysis.

**Q: How much does DeepSeek cost?**  
A: With 5-minute caching, about $0.50-1/day. Without caching, $10-20/day.

**Q: Can I use this for real trading?**  
A: Currently uses mock data for portfolio/backtest. Real trading integration coming in Phase 2.

**Q: How do I add more cryptos?**  
A: Edit `scripts/dashboard-server.js` - add to `getMockData()` and `getMarketData()` functions.

**Q: Dashboard not updating?**  
A: Hard refresh with Ctrl+Shift+R. Check browser console (F12) for errors.

---

## Next Steps

1. **Configure DeepSeek API** for better AI analysis
2. **Get Bitget Testnet keys** for real trading tests
3. **Customize signals** in `src/signals/signal-engine.ts`
4. **Add your strategies** to backtest
5. **Submit to hackathon!** 🏆

---

**Questions?** Check the main README.md or open an issue!

**Happy Trading! 🚀**
