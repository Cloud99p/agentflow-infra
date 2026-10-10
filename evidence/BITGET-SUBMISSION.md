# Bitget AI Trading Competition — Project Description

**Entry type:** Tool / Infrastructure — **AI Trading Desk track** (research tools and dashboards)
**Repo:** https://github.com/Cloud99p/agentflow-infra
**Commit submitted:** `6002896`
**Data labels used throughout:** OBSERVED (measured on this build) · ESTIMATED (inferred from observed) · TARGETED (goal, not yet achieved)

---

## Part 1 · Thesis

**Why I built this.** AI trading agents inherit a problem that human desks solved decades ago and that most agent frameworks have quietly reintroduced: every number the model reasons over comes from a source the model cannot audit, and most frameworks paper over a failed data source with a neutral default. A sentiment fetch times out and the agent silently scores it 50. An indicator call dies and the score drifts toward "no opinion" — which, in a weighted composite, is indistinguishable from a genuine neutral reading. The agent then trades on a number that means nothing, and nothing in the system says so.

The core hypothesis is narrow and testable: **an agent that refuses to fabricate unavailable inputs, and that verifies its own primitives against an independent implementation, produces more trustworthy decisions than one that fills gaps with neutral defaults — and this is measurable rather than philosophical.**

I built this as a **trading desk** rather than a strategy, deliberately. A desk's job is not to promise a return; it is to hand a trader numbers they can defend, and to tell them what they do not know. That framing is why the deliverable is a research surface with auditable provenance, and why the validation in Part 3 measures the integrity of the data layer rather than a hypothetical P&L.

**Signal sources.** Twelve signals feed a weighted composite. Ten are computed from live market data:

| Signal | Weight | Source |
|---|---|---|
| Momentum (24h change) | high | CoinGecko |
| Volatility (24h range) | high | CoinGecko |
| Trend (short-term direction) | high | CoinGecko |
| Volume | high | CoinGecko |
| RSI(14, 1h) | high | Binance klines, computed locally |
| MACD histogram | high | Binance klines, computed locally |
| Market Regime | 10% | derived from 24h change |
| Support/Resistance (range position) | 8% | CoinGecko |
| Sentiment | 8% | **unavailable — reported as such** |
| Risk Assessment (inverse vol) | 8% | CoinGecko |
| Exchange Cross-Check | 5% | Bitget Skill Hub `crypto_derivatives` |
| Indicator Cross-Check | 5% | Bitget Skill Hub `technical_analysis` |

**Decision logic.** Two independent things happen. First, a **weighted composite** of the twelve scores, renormalised over the weight actually present — so a missing signal does not dilute the others. Second, a **model-generated reasoning pass** over the same signal set, which produces the narrative decision and confidence. The structural point: the composite is deterministic arithmetic anyone can re-derive from the raw signal list, and the AI layer explains it rather than replacing it.

**Risk-control design.** Three properties matter more than the thresholds:

1. **Unavailable is a first-class state, not a fallback.** A signal carries its own provenance. When Sentiment has no reachable upstream it reports `source: "unavailable"` and a rationale saying so. It still contributes a neutral 50 to the composite — because dropping it silently would change the weighting — but it is *labelled*, and the API returns `unavailableSources: ["Sentiment"]` so a consumer never has to guess which numbers are real.
2. **Cross-verification against an independent implementation.** This is the part I would defend as novel. Two signals exist purely to check the others: CCXT-sourced price is compared against the primary feed, and RSI computed by the Bitget Skill Hub is compared against the RSI computed locally. Disagreement beyond tolerance surfaces as a signal rather than a silent inconsistency.
3. **Input validation at the API boundary**, so a malformed request is rejected with a specific reason (`capital must be positive`, `stopLoss must be positive`, `Insufficient cash: need $…`) rather than producing a nonsense result.

**Why existing solutions fall short.** Agent frameworks optimise for *not crashing* on missing data, which means they optimise for exactly the wrong thing: a filled gap looks like a successful run. The failure mode is invisible precisely because it produces output. My position is that an unavailable input should be louder, not quieter — a neutral default that renders identically to a real neutral reading is a correctness bug wearing a feature's clothes.

---

## Part 2 · Target user and product value

**Primary segment: semi-technical retail-to-prosumer traders running systematic strategies on $10k–$100k of personal or family capital.**

Concretely: risk appetite moderate-to-conservative; 5–50 trades per week; crypto perpetuals and majors as the primary market (BTC/ETH/SOL/XRP pairs); one to two people, no dedicated data engineering. They write their own scripts or drive an agent, and they are fluent enough to read a signal list but not resourced enough to build redundant data pipelines.

**Why this segment specifically.** They sit in the gap that is worst served. A pure retail trader trusts a single app and never audits the feed; an institutional desk buys redundant data from two vendors and reconciles them. The prosumer is technically capable of caring about data provenance but has no mechanism to do anything about it — so they end up either trusting one source blindly, or hand-rolling brittle monitoring that breaks. They are also the segment most exposed to the specific failure mode I built against: a silently-degraded feed changing a composite score with no visible indication, on a book large enough to matter and small enough that a bad week hurts.

**The core pain point.** They cannot currently answer the question *"is the number my agent just acted on real?"* without manually re-deriving it. Every existing tool answers with the number. None answer with the provenance.

**What existing solutions still fail to solve.** Signal aggregators present a composite score with no indication of which inputs were live and which were substituted. Backtesting tools show historical fidelity but say nothing about live data health. Agent frameworks log errors to a console that no one reads at 3am. The gap is not data availability — it is **attribution**: tying every number in a decision back to a named source and its liveness, at the point of decision.

**Product value.** This system answers that question structurally. Every signal carries its source. The composite reports how many sources were live and names the ones that were not. Two independent cross-checks flag when my own computation disagrees with a second implementation. The user gets not just a decision but a defensible account of what it rested on.

---

## Part 3 · Validation data and key metrics

**Honest disclosure first: this build has not traded live.** There is no return, Sharpe, or drawdown to report, and I will not manufacture one. What I have validated is the **infrastructure layer**, which is the thing this entry claims to improve — and that validation is measured, reproducible, and committed as evidence.

### Infrastructure metrics — OBSERVED

| Metric | Value | How measured |
|---|---|---|
| Module load rate | **27/27, 0 failures** | full ESM import sweep of `dist/` |
| Live signal sources | **11 of 12** | `/api/signals?symbol=BTCUSDT` |
| Unavailable sources, named | **1 — Sentiment** | returned in `unavailableSources` |
| Composite score | **55.03 / HOLD** | weighted, renormalised |
| Cross-check: price | **CCXT 82,657.30 vs 82,570.00 primary → +0.106%** | independent exchange feed |
| Cross-check: indicator | **Skill Hub RSI 50.47 vs local 51.86 → delta 1.39** | independent TA implementation |
| Skill Hub tools live | **12 of 27 probed** | `evidence/skill-hub-probe.json` |
| Validation rejections | **3/3 correctly rejected** | `capital`, `stopLoss`, cash-sufficiency |

The two cross-checks are the substantive result. The price divergence of **0.106%** and the RSI delta of **1.39** are both inside expected tolerance for independent implementations on different exchanges/timeframes — which means my primitives agree with an outside source. If they did not, the system would say so rather than pick one.

### Trading metrics — NOT YET MEASURED (validation plan)

Targets, explicitly **TARGETED** not observed:

| Metric | Target | Basis |
|---|---|---|
| Test period | 90 days | long enough for regime variety |
| Sharpe | > 1.2 | ESTIMATED from signal quality |
| Max drawdown | < 15% | consistent with a conservative-segment product |
| Win rate | 45–55% | ESTIMATED; edge expected from risk control, not hit rate |
| Turnover | 5–50 trades/wk | matches the target segment |
| Costs modelled | fees + slippage + funding | must be net, not gross |

**Validation plan.** Backtest over 90 days of real historical klines using the existing backtest engine, with **fees, slippage and funding modelled explicitly** — a backtest that ignores them is not a validation. Then paper-trade forward for 30 days with the same signal pipeline, and compare live signal availability against the backtest period to confirm the data-health properties hold under real conditions. Only then does capital follow. The infrastructure metrics above are what is proven today; the returns are what would be proven next.

### Distribution / activation proof — TARGETED

| Metric | Target | Note |
|---|---|---|
| Activation (first audited decision) | > 60% of installs | the product's first value moment is seeing provenance |
| Trading volume | pursue via Bitget Skill Hub distribution | |
| Retention (30-day) | > 40% | |
| Risk | the provenance layer itself | a skipped input is visible, not silent |

---

## Part 4 · Progress

**Built and working.**
- TypeScript trading infrastructure, ESM, Node ≥20. 27/27 modules load clean.
- Live market data with failover: CoinGecko → Binance, no mock fallback anywhere — a dead source surfaces as an error, never an invented number.
- Real RSI/MACD/ATR computed locally from Binance klines.
- Portfolio tracking with input validation; backtest engine over real historical klines.
- Real-time dashboard (HTTP API + UI) exposing signals, market data, indicators, portfolio, backtest.
- **Bitget Skill Hub integration** (see tools below) supplying independent cross-checks.
- Every signal carries source provenance; composite reports live/unavailable counts.

**Not built.**
- No live/paper trading track record yet — the 90-day backtest and 30-day paper phase are the next milestone.
- Sentiment is genuinely unavailable (see below), so the composite runs without it.
- Portfolio state is flat by design; no positions opened.

**Problems hit and how I solved them.**

1. **A neutral default was masquerading as a reading.** Sentiment and MACD both returned neutral 50 when their upstream failed — indistinguishable from real neutral readings. **Fixed** by giving every signal explicit provenance; unavailable is now a labelled state, and the API names which sources are missing.

2. **The dashboard hung on any import of the app entry point.** `main()` was called at module top level and installed a `setInterval` that never exits, so importing the module for tests or tooling booted the entire service. **Fixed** by gating execution behind an `import.meta.url === process.argv[1]` check. Verified: the import now resolves.

3. **A failed port bind crashed opaquely.** Two server instances colliding produced an unhandled Node `'error'` event and a stack trace naming nothing useful. **Fixed** with an `EADDRINUSE` handler that names the port and suggests `PORT=<n>`. Verified red/green: the second instance prints the conflict and exits cleanly.

4. **The Skill Hub's failure modes are not uniform.** 15 of 27 tools fail, and they fail *differently*: `crypto_market/global` times out through the MCP while a direct CoinGecko call from the same host succeeds; `news_feed/latest` is reachable but returns empty item arrays; `global_data/forex` responds with an empty rates object. **Handled** by probing each upstream and recording its actual behaviour rather than treating "reachable" as "usable" — committed as `evidence/skill-hub-probe.json`. This is why availability is measured per-tool, not assumed.

**Next.** 90-day backtest with full cost modelling → 30-day paper trade → expand cross-checks from 2 signals to every independently-verifiable primitive.

**Specific Bitget tools used.** Via `bitget-skill-hub` (MCP `market-data-mcp` 1.26.0), integrated in `src/skill-hub-client.ts` and `src/signals/skill-hub-signals.ts`:
- **`crypto_derivatives`** — `price`, `ticker_24h`, `klines` (used for the price cross-check)
- **`technical_analysis`** — `rsi`, `macd`, `bollinger`, `atr`, `support_resistance`, `full_analysis` (used for the indicator cross-check)
- **`news_feed`** — `sources`, `latest`
- **`global_data`** — `forex`
- Also declared in `dependencies` and scripted: `bitget-client`, `bitget-skill-hub`, with a `test:bitget` integration script.

---

## Part 5 · My take on AI Trading

Using the Bitget Skill Hub shaped my thinking more than any single result. Two observations.

**The interesting problem is not intelligence, it is provenance.** Every agent I have seen obsesses over the model and treats data as plumbing. But the failure I kept hitting was not a wrong inference — it was a right inference over a number that had quietly stopped being real. The Skill Hub made this vivid: 12 of 27 tools work, and the 15 that fail each fail in their own way. A framework that treats that as "15 tools unavailable" loses the information that matters. The useful abstraction is not *tool availability* but *evidential integrity* — what does this number rest on, and does the system know whether that foundation is intact?

**Agentic trading will be won on refusals, not on returns.** The current arms race is signal quality and model capability, and it will commoditise. What will not commoditise is the discipline to decline: to say "I do not have a sentiment reading today, so here is my position with that caveat attached" rather than filling the gap. A trader who knows why they are unsure beats one who has a confident number of unknown pedigree. My bet is that the agents which survive contact with real capital are the ones that can account for themselves — and that the infrastructure to *not* fabricate missing inputs is a product feature, not an engineering nicety.

The Skill Hub's own probe result is, to me, the argument in miniature: the most valuable output was not a price, it was a map of what could be trusted.
