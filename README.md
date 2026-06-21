# AgentFlow Infra 🤖

## AI-Powered Trading Infrastructure with Real-Time Dashboard

**Production-grade trading infrastructure** featuring a live dashboard, DeepSeek AI analysis, 10 technical signals, and Bitget integration. Built for the **Bitget AI Trading Hackathon S1**.

---

## 🎯 What It Is

AgentFlow Infra is a **comprehensive trading analysis platform** with:

- 📊 **Live Dashboard** - Real-time market data, signals, and AI reasoning
- 🤖 **DeepSeek AI Integration** - Professional-grade trading analysis
- 📈 **10 Technical Signals** - Momentum, RSI, MACD, Volume, Volatility, and more
- 💼 **Portfolio Tracking** - PnL, allocation, win rate metrics
- 🔬 **Backtesting Engine** - Strategy performance analysis
- 🌐 **Multi-Crypto Support** - BTC, ETH, SOL, XRP

---

## 🚀 Quick Start

```bash
# Clone
git clone https://github.com/Cloud99p/agentflow-infra.git
cd agentflow-infra

# Install
npm install

# Configure (optional - works without API keys!)
cp .env.example .env
# Edit .env with your DeepSeek API key for AI features

# Run Dashboard
npm run dashboard

# Open browser
# http://localhost:3000
```

---

## 📊 Dashboard Features

### **Real-Time Market Data**
- ✅ **Bitget V2 API Integration** - Live prices, no API key needed
- ✅ **Multi-Crypto Support** - BTC, ETH, SOL, XRP
- ✅ **Auto-Refresh** - Updates every 5 seconds
- ✅ **Price Display** - 24h change, high, low, volume

### **10 Technical Signals** (Inspired by [DCA Claw](https://github.com/Argeneau12e/DCA_claw))
**Credit: Samuel Oduntan (@Argeneau12e, @Little_Sam_1428)**

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

### **AI Reasoning Panel**
- 🤖 **DeepSeek AI Integration** - Professional trading analysis
- 📝 **Detailed Rationale** - Why the AI recommends BUY/HOLD/SELL
- 🎯 **Action Plan** - Specific steps to take
- ⚠️ **Risk Assessment** - Risk level and factors
- 💾 **Smart Caching** - Updates every 5 minutes (saves 95% on API costs!)

### **Portfolio Tracking**
- 💰 **Total Value** - Portfolio worth
- 📊 **PnL** - Realized + Unrealized
- 🎯 **Win Rate** - Success rate
- 📈 **Allocation** - Asset distribution
- 📉 **Equity Curve** - Performance over time

### **Backtesting View**
- 🔬 **Strategy Testing** - Historical performance
- 📊 **Metrics** - Sharpe ratio, max drawdown, profit factor
- 📈 **Equity Curve** - Growth chart
- 📋 **Trade History** - Individual trade analysis

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Dashboard UI                             │
│  (React/HTML + Chart.js - Auto-refreshes every 5s)         │
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

## 🔧 Configuration

### Environment Variables (Optional)

Create `.env` file:

```env
# DeepSeek API for AI Reasoning (Recommended)
# Get key: https://platform.deepseek.com/
DEEPSEEK_API_KEY=sk-your-key-here
ENABLE_DEEPSEEK_AI=true

# Dashboard Settings
DASHBOARD_PORT=3000

# AI Cache (saves credits!)
# How long to cache AI reasoning before refreshing
DEEPSEEK_CACHE_TTL=300000
```

### Without API Keys

The dashboard **works perfectly without any API keys**:
- ✅ Market data from Bitget public API (free, no auth)
- ✅ All 10 technical signals
- ✅ Portfolio tracking (mock data)
- ✅ Backtesting (mock data)
- ⚠️ AI reasoning uses local fallback (still functional!)

---

## 📁 Project Structure

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
├── evidence/              # Hackathon evidence
│   ├── test-runs/         # Test run JSON files
│   └── screenshots/       # Dashboard screenshots
├── .env.example           # Environment template
├── SETUP.md              # Setup guide
└── package.json
```

---

## 🎓 Educational Features

### **Learn Trading Analysis**
- See how 10 different signals analyze the market
- Understand weighted scoring systems
- Learn AI reasoning patterns

### **Learn Technical Indicators**
- RSI (Relative Strength Index)
- MACD (Moving Average Convergence Divergence)
- Volatility analysis
- Volume analysis

### **Learn Risk Management**
- Position sizing
- Risk/reward ratios
- Portfolio allocation
- Drawdown control

---

## 🏆 Hackathon Submission

**Built for:** Bitget AI Trading Hackathon S1

**Key Features:**
- ✅ Bitget V2 API integration (real-time market data)
- ✅ 10-signal scoring engine (inspired by DCA Claw)
- ✅ DeepSeek AI reasoning (professional analysis)
- ✅ Live dashboard (auto-refresh every 5s)
- ✅ Portfolio tracking
- ✅ Backtesting engine
- ✅ Multi-crypto support (BTC/ETH/SOL/XRP)

**Evidence:** See `evidence/` folder for:
- Test run JSON files (13+ runs)
- Dashboard screenshots
- Performance metrics

---

## 🚀 Usage Examples

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

### Full Dashboard + Lifecycle Sync
```bash
npm run dashboard:full
```

---

## 💡 Tips

### **Dashboard Refresh**
- Auto-refreshes every 5 seconds
- Press `Ctrl+Shift+R` for hard refresh
- Check browser console (F12) for logs

### **AI Reasoning**
- Updates every 5 minutes (cached to save credits)
- Switch crypto (BTC/ETH/SOL/XRP) to get new analysis
- Check terminal for `[DEEPSEEK]` logs

### **Cost Optimization**
- AI caching saves 95% on API costs
- Default: 5-minute cache (~288 calls/day vs 17,280)
- Adjust `DEEPSEEK_CACHE_TTL` in `.env`

---

## 🤝 Credits

- **Signal Engine:** Inspired by [DCA Claw](https://github.com/Argeneau12e/DCA_claw) by Samuel Oduntan (@Argeneau12e)
- **AI Model:** DeepSeek Chat API
- **Market Data:** Bitget V2 API
- **Built with:** Node.js, TypeScript, Chart.js

---

## 📄 License

MIT - See LICENSE file

---

## 🆘 Support

- **Setup Guide:** See `SETUP.md`
- **Issues:** Open GitHub issue
- **Docs:** Check inline code comments

**Happy Trading! 🚀**
