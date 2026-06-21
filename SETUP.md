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

### Bitget Testnet Trading

When you enable Bitget testnet:

- **Real trading simulation** with testnet funds
- **Live order execution** on Bitget testnet
- **Portfolio tracking** with real positions
- **No real money at risk**

**Without Testnet:** Uses public Bitget API for market data + mock portfolio

**With Testnet:** Full trading simulation with real API

---

## API Keys

### DeepSeek API

1. Go to https://platform.deepseek.com/
2. Sign up / Log in
3. Navigate to API Keys
4. Create a new key
5. Copy to `.env` as `DEEPSEEK_API_KEY`

**Cost:** Very affordable (~$0.001-0.01 per analysis)

### Bitget Testnet

1. Go to https://testnet.bitget.com/
2. Sign up for testnet account
3. Go to API Management
4. Create API key with:
   - Read permissions
   - Trade permissions
5. Copy credentials to `.env`:
   - `BITGET_API_KEY`
   - `BITGET_SECRET_KEY`
   - `BITGET_PASSPHRASE`

**Testnet Funds:** You'll get free test USDT to trade with

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

## Next Steps

1. **Configure DeepSeek API** for better AI analysis
2. **Get Bitget Testnet keys** for real trading tests
3. **Customize signals** in `src/signals/signal-engine.ts`
4. **Add your strategies** to backtest
5. **Submit to hackathon!** 🏆

---

**Questions?** Check the main README.md or open an issue!
