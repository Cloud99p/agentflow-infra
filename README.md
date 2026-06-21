# AgentFlow Infra 🤖

## Trading Infrastructure for Autonomous AI Agents

**Production-grade execution layer for AI trading agents** with real-time monitoring, cryptographic audit trails, and adaptive learning from outcomes.

---

## 🎯 Why We Built This

AI trading agents fail not because of bad strategies, but because of **bad infrastructure**:

| Problem | AgentFlow Solution |
|---------|-------------------|
| ❌ Unreliable execution | ✅ Battle-tested execution layer (140+ trades proven) |
| ❌ No audit trail | ✅ SHA-256 cryptographic proof chain for every decision |
| ❌ No learning from failures | ✅ Hebbian learning + Knowledge Graph |
| ❌ No real-time monitoring | ✅ Live dashboard with 4-stage lifecycle tracking |
| ❌ Black box decisions | ✅ Transparent AI reasoning with confidence scoring |

**AgentFlow separates "thinking" (agent strategy) from "doing" (execution infrastructure).**

---

## 🏗️ Core Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    AI Trading Agent                         │
│  (Strategy, Signals, Alpha - YOUR CODE)                     │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  AgentFlow Infra                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   AI Agent  │  │  Execution  │  │  Monitoring │         │
│  │  (DeepSeek) │  │   Layer     │  │  Dashboard  │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  Hebbian    │  │  Knowledge  │  │   Proof     │         │
│  │  Learning   │  │   Graph     │  │   Chain     │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              Exchanges / Markets                            │
│  (Bitget, Solana, FTX, Binance, etc.)                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

```bash
# Clone
git clone https://github.com/Cloud99p/agentflow-infra.git
cd agentflow-infra

# Install
npm install

# Configure
cp .env.example .env
# Edit .env with your API keys

# Run dashboard
npm run dashboard

# Execute trade
npx tsx scripts/execute-trade.ts
```

---

## 📊 Features

### 🤖 AI-Powered Execution
- **DeepSeek Integration** - Real-time AI analysis of trade failures
- **Confidence Scoring** - AI confidence (0-1) for every decision
- **Adaptive Retry Logic** - Smart retry with adjusted parameters
- **Fallback Safety** - Local reasoning if AI unavailable

### 🔐 Cryptographic Audit Trail
- **SHA-256 Proof Chain** - Every decision is hashed and chained
- **Tamper-Evident** - Any modification breaks the chain
- **Compliance-Ready** - Full audit trail for regulators
- **Post-Mortem Analysis** - Replay any decision with full context

### 🧠 Adaptive Learning
- **Hebbian Optimization** - Neural weights adapt from outcomes
- **Knowledge Graph** - Pattern recognition across trades
- **Failure Taxonomy** - Ontology-based failure classification
- **Self-Improvement** - System gets smarter with every trade

### 📈 Real-Time Monitoring
- **Live Dashboard** - Web UI with real-time trade status
- **4-Stage Lifecycle** - submitted → processed → confirmed → finalized
- **Success Rate Charts** - Performance over time
- **Tip Efficiency** - Cost optimization tracking

---

## 🛠️ Bitget Agent Hub Integration

AgentFlow integrates with Bitget's Agent Hub for market data and AI-powered analysis:

| Bitget Tool | Integration | Status |
|-------------|-------------|--------|
| **bitget-client (bgc)** | Market data CLI | ✅ Integrated |
| **Skill Hub** | 5 market analysis skills | ✅ Integrated |
| **MCP Server** | AI model integration | ✅ Supported |
| **Agent Hub** | Agent orchestration | ✅ Supported |

### Installation

```bash
# Install Bitget Agent Hub packages
npx bitget-hub upgrade-all --target claude

# Or install individually
npm install -g bitget-client
npm install -g bitget-skill-hub

# Configure API keys (optional for market data, required for trading)
export BITGET_API_KEY="your-api-key"
export BITGET_SECRET_KEY="your-secret-key"
export BITGET_PASSPHRASE="your-passphrase"
```

### Available Skills

| Skill | Description |
|-------|-------------|
| **macro-analyst** | Macro & cross-asset analysis (Fed policy, yield curve, BTC vs DXY/Nasdaq/Gold) |
| **market-intel** | On-chain & institutional intelligence (ETF flows, whale activity, DeFi TVL) |
| **sentiment-analyst** | Sentiment & positioning (Fear & Greed, long/short ratios, funding rates) |
| **technical-analysis** | 23 technical indicators across 6 categories |
| **news-briefing** | News aggregation & narrative synthesis |

### Example: Market Data Integration

```typescript
import { bitget } from 'agentflow-infra';

// Get market overview
const marketData = await bitget.getMarketOverview();
console.log(marketData.tickers['BTCUSDT'].lastPr); // Current BTC price

// Run sentiment analysis
const sentiment = await bitget.runSkillAnalysis('sentiment-analyst', 'BTCUSDT');
console.log(sentiment.analysis); // AI-powered sentiment analysis
console.log(sentiment.confidence); // Confidence score (0-1)
```

### Test Integration

```bash
# Run Bitget integration test
npm run test:bitget
```

---

## 📁 Project Structure

```
agentflow-infra/
├── src/
│   ├── ai-agent.ts              # AI decision layer (DeepSeek)
│   ├── executor.ts              # Trade execution engine
│   ├── hebbian-optimizer.ts     # Neural learning
│   ├── knowledge-graph.ts       # Pattern recognition
│   ├── proof-chain.ts           # Cryptographic audit trail
│   ├── dashboard-server.js      # Real-time monitoring
│   └── index.ts                 # Main entry point
├── scripts/
│   ├── execute-trade.ts         # Single trade execution
│   ├── test-scenarios.ts        # Test trading scenarios
│   ├── export-audit.ts          # Export audit trail
│   └── generate-report.ts       # Performance report
├── dashboard/
│   └── index.html               # Live monitoring UI
├── evidence/                    # Trading records & logs
├── audit_log.json               # Cryptographic proof chain
├── .env.example                 # Configuration template
└── README.md                    # This file
```

---

## 🧪 Testing

```bash
# Run test scenarios (paper trading)
npx tsx scripts/test-scenarios.ts

# Export audit trail
npx tsx scripts/export-audit.ts

# Generate performance report
npx tsx scripts/generate-report.ts
```

### Test Scenarios Include:
- ✅ Normal execution (should succeed)
- ✅ Network congestion (retry with higher gas)
- ✅ Price slippage (adjust limit price)
- ✅ Balance insufficient (abort & alert)
- ✅ API rate limit (wait & retry)

---

## 📊 Performance Metrics

| Metric | Value |
|--------|-------|
| **Total Trades Executed** | 140+ |
| **Success Rate** | 50-60% (realistic market conditions) |
| **AI Decisions** | 20+ with reasoning |
| **Proof Chain Length** | 20+ cryptographic proofs |
| **Avg Execution Latency** | <500ms |
| **Dashboard Refresh** | 5 seconds |

---

## 🔒 Security

- ✅ **Non-custodial** - Users retain API key control
- ✅ **Encrypted storage** - API keys encrypted at rest
- ✅ **Audit trail** - Every action is logged and hashed
- ✅ **Rate limiting** - Built-in protection against API abuse
- ✅ **Fail-safe** - Circuit breakers on abnormal conditions



## 🤝 Contributing

1. Fork the repo
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

## 📞 Support

- **GitHub Issues:** https://github.com/Cloud99p/agentflow-infra/issues
- **Documentation:** https://github.com/Cloud99p/agentflow-infra/wiki
- **Twitter:** @Cloud99p

---

## 🙏 Acknowledgments

Built with:
- **Bitget Agent Hub** - Agent orchestration
- **Bitget US Stocks API** - Market data
- **DeepSeek AI** - Language model for decision analysis
- **Solana** - High-performance blockchain execution

---

**AgentFlow Infra** - Because great agents need great infrastructure. 🤖
