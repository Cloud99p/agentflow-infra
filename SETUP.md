# AgentFlow Infra - Setup Guide

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment (Optional)

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` with your API keys:

```bash
# DeepSeek API for AI Reasoning (Optional but recommended)
# Get your key at: https://platform.deepseek.com/
DEEPSEEK_API_KEY=sk-your-deepseek-api-key-here

# Bitget Testnet API (Optional - for real trading tests)
# Get your keys at: https://testnet.bitget.com/
BITGET_API_KEY=your-bitget-testnet-api-key
BITGET_SECRET_KEY=your-bitget-testnet-secret-key
BITGET_PASSPHRASE=your-bitget-testnet-passphrase

# Dashboard Configuration
DASHBOARD_PORT=3000

# Feature Flags
ENABLE_DEEPSEEK_AI=true
ENABLE_BITGET_TESTNET=false
```

### 3. Start Dashboard

```bash
npm run dashboard
```

Open http://localhost:3000

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
