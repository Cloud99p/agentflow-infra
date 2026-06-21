# AgentFlow Infra - Project Summary

## Overview

**AgentFlow Infra** is a comprehensive trading analysis platform featuring a live dashboard, DeepSeek AI analysis, 10 technical signals, and Bitget integration.

**Tagline:** AI-Powered Trading Infrastructure with Live Dashboard

**GitHub:** https://github.com/Cloud99p/agentflow-infra

---

## Key Features

### 📊 Live Dashboard
- **Real-Time Market Data** - Bitget V2 API integration (BTC, ETH, SOL, XRP)
- **Auto-Refresh** - Updates every 5 seconds
- **Multi-Crypto Support** - Switch between BTC, ETH, SOL, XRP instantly
- **No API Key Required** - Public endpoints work without authentication

### 🤖 AI Reasoning
- **DeepSeek Integration** - Professional-grade trading analysis
- **Smart Caching** - Updates every 5 minutes (saves 95% on API costs)
- **Detailed Rationale** - Explains BUY/HOLD/SELL recommendations
- **Action Plans** - Specific steps to take
- **Risk Assessment** - Risk level and factors
- **Fallback Mode** - Works without API key using local reasoning

### 📈 10 Technical Signals
**Inspired by [DCA Claw](https://github.com/Argeneau12e/DCA_claw) by Samuel Oduntan (@Argeneau12e)**

| Signal | Weight | Description |
|--------|--------|-------------|
| **Momentum** | 12% | 24h price momentum |
| **Volatility** | 10% | Price volatility analysis |
| **Trend** | 12% | Short-term trend direction |
| **Volume** | 10% | Trading volume analysis |
| **RSI** | 12% | Overbought/Oversold indicator |
| **MACD** | 10% | Momentum convergence/divergence |
| **Market Regime** | 10% | BULL/BEAR/SIDEWAYS detection |
| **Support/Resistance** | 8% | Price position in 24h range |
| **Sentiment** | 8% | Market sentiment analysis |
| **Risk Assessment** | 8% | Overall risk level |

### 💼 Portfolio Tracking
- **Total Value** - Portfolio worth including unrealized PnL
- **PnL Analysis** - Realized + Unrealized gains/losses
- **Win Rate** - Success rate tracking
- **Allocation** - Asset distribution charts
- **Equity Curve** - Performance over time

### 🔬 Backtesting Engine
- **Strategy Testing** - Historical performance analysis
- **Performance Metrics** - Sharpe ratio, max drawdown, profit factor
- **Equity Curve** - Visual portfolio growth
- **Trade History** - Individual trade breakdown

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Dashboard UI                             │
│  (HTML/CSS/JS + Chart.js - Auto-refreshes every 5s)        │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│               Dashboard Server (Node.js)                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Signals   │  │    AI       │  │   Market    │         │
│  │   Engine    │  │  Reasoning  │  │    Data     │         │
│  │  (10 total) │  │  (DeepSeek) │  │  (Bitget)   │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│  ┌─────────────┐  ┌─────────────┐                          │
│  │  Portfolio  │  │  Backtest   │                          │
│  │  Tracker    │  │  Engine     │                          │
│  └─────────────┘  └─────────────┘                          │
└─────────────────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              External APIs                                  │
│  - Bitget V2 (Market Data)                                  │
│  - DeepSeek (AI Analysis)                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| **Dashboard UI** | HTML/CSS/JavaScript + Chart.js |
| **Server** | Node.js (ES Modules) |
| **TypeScript** | Type-safe backend code |
| **Market Data** | Bitget V2 API |
| **AI Analysis** | DeepSeek Chat API |
| **Charts** | Chart.js |
| **Auto-Refresh** | JavaScript setInterval (5s) |

---

## Quick Start

```bash
# Clone
git clone https://github.com/Cloud99p/agentflow-infra.git
cd agentflow-infra

# Install
npm install

# Configure (optional)
cp .env.example .env
# Edit .env with your DeepSeek API key

# Run Dashboard
npm run dashboard

# Open Browser
# http://localhost:3000
```

---

## Configuration

### Environment Variables (Optional)

Create `.env` file:

```env
# DeepSeek API for AI Reasoning (Recommended)
# Get key: https://platform.deepseek.com/
DEEPSEEK_API_KEY=sk-your-key-here
ENABLE_DEEPSEEK_AI=true

# AI Cache (saves credits!)
DEEPSEEK_CACHE_TTL=300000  # 5 minutes (default)

# Dashboard Settings
DASHBOARD_PORT=3000
```

### Without API Keys

The dashboard **works perfectly without any API keys**:
- ✅ Market data from Bitget public API (free, no auth)
- ✅ All 10 technical signals
- ✅ Portfolio tracking (mock data)
- ✅ Backtesting (mock data)
- ⚠️ AI reasoning uses local fallback (still functional!)

---

## Project Structure

```
agentflow-infra/
├── dashboard/              # Dashboard HTML/CSS/JS
│   └── index.html         # Main dashboard UI
├── scripts/               # Server and utilities
│   ├── dashboard-server.js    # Main dashboard server
│   └── test-bitget-integration.ts
├── src/                   # TypeScript source
│   ├── ai-reasoning-engine.ts   # DeepSeek AI integration
│   ├── backtest-engine.ts       # Backtesting logic
│   ├── bitget-integration.ts    # Bitget API
│   ├── portfolio-tracker.ts     # Portfolio tracking
│   ├── signals/
│   │   ├── signal-engine.ts     # 10-signal engine
│   │   └── README.md
│   └── technical-indicators.ts  # RSI, MACD, etc.
├── evidence/              # Test evidence
│   ├── test-runs/         # Test run JSON files
│   └── screenshots/       # Dashboard screenshots
├── .env.example           # Environment template
├── SETUP.md              # Setup guide
├── PROJECT_SUMMARY.md    # This file
└── package.json
```

---

## Cost Optimization

### DeepSeek API Costs

**Without Caching:**
- Calls every 5 seconds = 12 calls/minute
- ~17,280 calls/day
- Cost: ~$10-20/day

**With Caching (5-minute TTL):**
- Calls every 5 minutes = 12 calls/hour
- ~288 calls/day
- Cost: ~$0.50-1/day
- **Savings: 95%**

### Configuration

```env
DEEPSEEK_CACHE_TTL=300000  # 5 minutes (default)
```

Adjust based on your needs:
- Shorter TTL = More frequent updates, higher cost
- Longer TTL = Less frequent updates, lower cost

---

## Usage Examples

### Run Dashboard
```bash
npm run dashboard
# Open http://localhost:3000
```

### Test Bitget Integration
```bash
npm run test:bitget
```

### Build TypeScript
```bash
npm run build
```

### Full Dashboard + Sync
```bash
npm run dashboard:full
```

---

## Tips

### Dashboard Refresh
- Auto-refreshes every 5 seconds
- Press `Ctrl+Shift+R` for hard refresh
- Check browser console (F12) for logs

### AI Reasoning
- Updates every 5 minutes (cached to save credits)
- Switch crypto (BTC/ETH/SOL/XRP) to get new analysis
- Check terminal for `[DEEPSEEK]` logs

### Cost Optimization
- AI caching saves 95% on API costs
- Default: 5-minute cache (~288 calls/day vs 17,280)
- Adjust `DEEPSEEK_CACHE_TTL` in `.env`

---

## Evidence

### Test Runs

**Location:** `evidence/` folder

- ✅ **13+ Test Run JSON Files** - Full capability tests
- ✅ **Mainnet Tests** - Real transaction tests
- ✅ **Bitget Integration Tests** - API verification
- ✅ **Signal Engine Tests** - All 10 signals working

### Screenshots

**Location:** `evidence/screenshots/`

1. **Dashboard Overview** - All 10 signals, AI reasoning
2. **Portfolio View** - Positions, PnL, allocation
3. **Backtest View** - Equity curve, trade history
4. **Crypto Selector** - BTC/ETH/SOL/XRP switching
5. **AI Reasoning Panel** - DeepSeek analysis

---

## Metrics

| Metric | Value |
|--------|-------|
| **Signals** | 10 independent indicators |
| **Cryptos** | 4 (BTC, ETH, SOL, XRP) |
| **Refresh Rate** | 5 seconds |
| **AI Cache** | 5 minutes (95% cost savings) |
| **API Calls Saved** | ~17,000/day → ~300/day |
| **Test Runs** | 13+ successful runs |
| **Code Quality** | TypeScript, no errors |

---

## Credits

### Inspiration

- **Signal Engine:** [DCA Claw](https://github.com/Argeneau12e/DCA_claw) by Samuel Oduntan (@Argeneau12e, @Little_Sam_1428)
- **Concept:** Multi-signal scoring with weighted average

### Technologies

- **DeepSeek:** AI reasoning engine
- **Bitget:** Market data API
- **Chart.js:** Dashboard charts
- **Node.js:** Dashboard server
- **TypeScript:** Type-safe code

---

## License

MIT - See LICENSE file

---

## Support

- **Setup Guide:** See `SETUP.md`
- **Issues:** Open GitHub issue
- **Docs:** Check inline code comments

**Happy Trading! 🚀**
