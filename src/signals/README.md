# 📊 Multi-Signal Scoring Engine

**Inspired by:** [DCA Claw](https://github.com/Argeneau12e/DCA_claw) by Samuel Oduntan (@Argeneau12e)

This signal engine is adapted from the battle-tested 17-signal scoring system used in DCA Claw.

---

## Architecture

Each signal:
1. **Independent** - No cross-signal dependencies
2. **Normalized** - Outputs 0-100 score
3. **Weighted** - Configurable importance
4. **Explainable** - Plain-English rationale

---

## Implemented Signals

### Momentum Signals
- `momentum-signal.ts` - Price momentum (1h, 4h, 1d, 1w)
- `volume-signal.ts` - Volume analysis & anomalies
- `volatility-signal.ts` - ATR-based volatility scoring

### Trend Signals
- `trend-signal.ts` - Multi-timeframe trend detection
- `support-resistance.ts` - Key S/R levels
- `market-regime-signal.ts` - Bull/bear/sideways detection

### Market Structure Signals
- `funding-rate-signal.ts` - Perpetual funding analysis
- `open-interest-signal.ts` - OI changes
- `liquidation-signal.ts` - Liquidation heatmaps
- `orderbook-signal.ts` - Orderbook imbalance
- `spread-signal.ts` - Bid-ask spread analysis

### Sentiment & On-Chain Signals
- `sentiment-signal.ts` - Social sentiment (Bitget Skill Hub)
- `onchain-signal.ts` - On-chain metrics
- `whale-signal.ts` - Large holder activity

### Risk & Correlation Signals
- `correlation-signal.ts` - BTC/ETH correlation
- `seasonality-signal.ts` - Time-based patterns
- `risk-signal.ts` - Overall risk assessment

---

## Usage

```typescript
import { SignalEngine } from './signal-engine';

const engine = new SignalEngine({
  weights: {
    momentum: 0.15,
    volume: 0.10,
    volatility: 0.10,
    trend: 0.15,
    // ... etc
  }
});

const scores = await engine.scan('BTCUSDT');
console.log(scores);
// {
//   totalScore: 72.5,
//   signals: [...],
//   recommendation: 'BUY',
//   confidence: 0.78
// }
```

---

## Signal Score Interpretation

| Score Range | Interpretation | Action |
|-------------|---------------|--------|
| 80-100 | Very Bullish | Strong Buy |
| 60-79 | Bullish | Buy |
| 40-59 | Neutral | Hold/Wait |
| 20-39 | Bearish | Sell |
| 0-19 | Very Bearish | Strong Sell |

---

## Credits

**Original Concept:** DCA Claw's 17-signal engine  
**Author:** Samuel Oduntan (@Argeneau12e)  
**Repo:** https://github.com/Argeneau12e/DCA_claw  
**License:** MIT (same as AgentFlow)

This implementation adapts the core concepts with:
- Bitget integration for market data
- Enhanced AI reasoning layer
- Cryptographic audit trail for each signal

---

## Future Enhancements

- [ ] Bayesian win probability model (from DCA Claw)
- [ ] Machine learning weight optimization
- [ ] Real-time signal dashboard
- [ ] Backtesting framework
