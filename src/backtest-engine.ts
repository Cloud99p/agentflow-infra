/**
 * Backtesting Engine for AgentFlow Infra
 *
 * Runs a strategy over historical OHLCV candles. Data must be supplied by the
 * caller (fetched from a real exchange); this module never synthesises prices.
 */

export interface BacktestTrade {
  entryPrice: number;
  exitPrice: number;
  entryTime: number;
  exitTime: number;
  side: 'long' | 'short';
  amount: number;
  pnl: number;
  pnlPercent: number;
  fees: number;
  exitReason: 'take-profit' | 'stop-loss' | 'signal-reverse' | 'time-exit';
}

export interface BacktestMetrics {
  totalReturn: number;
  totalReturnPercent: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  avgTradeDuration: number;
  bestTrade: number;
  worstTrade: number;
  consecutiveWins: number;
  consecutiveLosses: number;
  trades: BacktestTrade[];
  equityCurve: { timestamp: number; value: number }[];
  /** Provenance, so the UI can state what was actually tested. */
  symbol: string;
  interval: string;
  candleCount: number;
  periodStart: number;
  periodEnd: number;
  isLive: boolean;
  source: string;
}

export interface BacktestConfig {
  initialCapital: number;
  positionSize: number; // percent of capital per trade
  takeProfit: number; // percent
  stopLoss: number; // percent
  maxTrades?: number;
  feeRate?: number; // fraction, e.g. 0.001 = 0.1%
  /** Signal engine: score 0-100 per candle. Defaults to an RSI-based rule. */
  signalFn?: (index: number) => number | undefined;
}

/** Wilder RSI used to derive default entry/exit signals. */
function wilderRSI(closes: number[], period: number, endIndex: number): number | null {
  if (endIndex < period) return null;

  let gainSum = 0;
  let lossSum = 0;
  for (let i = endIndex - period + 1; i <= endIndex; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gainSum += change;
    else lossSum += Math.abs(change);
  }

  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;

  // Continue Wilder smoothing to the most recent bar for stability.
  for (let i = endIndex + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * Run a backtest over real candles.
 *
 * The default signal is RSI-based: oversold (<30) is a long trigger, overbought
 * (>70) a short trigger, mapped onto the 0-100 score the engine expects.
 */
export function runBacktest(
  candles: { timestamp: number; open: number; high: number; low: number; close: number; volume: number }[],
  config: BacktestConfig,
  meta: { symbol: string; interval: string; source: string } = {
    symbol: 'UNKNOWN',
    interval: '1d',
    source: 'unknown',
  }
): BacktestMetrics {
  if (candles.length === 0) {
    throw new Error('runBacktest requires at least one candle of real market data');
  }

  const {
    initialCapital,
    positionSize,
    takeProfit,
    stopLoss,
    maxTrades = 100,
    feeRate = 0.001,
  } = config;

  const closes = candles.map((c) => c.close);
  const signalAt = (i: number): number | undefined => {
    if (config.signalFn) return config.signalFn(i);
    const rsi = wilderRSI(closes, 14, i);
    if (rsi === null) return undefined;
    // Map RSI 70->25, 50->50, 30->75 so oversold scores high (bullish).
    return Math.max(0, Math.min(100, 100 - rsi));
  };

  let capital = initialCapital;
  let position: {
    entryPrice: number;
    entryTime: number;
    side: 'long' | 'short';
    amount: number;
  } | null = null;

  const trades: BacktestTrade[] = [];
  const equityCurve: { timestamp: number; value: number }[] = [];
  let peakEquity = initialCapital;
  let maxDrawdown = 0;

  for (let i = 0; i < candles.length; i++) {
    const { timestamp, close: price } = candles[i];
    const unrealized = position
      ? position.side === 'long'
        ? (price - position.entryPrice) * position.amount
        : (position.entryPrice - price) * position.amount
      : 0;
    const currentEquity = capital + unrealized;

    equityCurve.push({ timestamp, value: currentEquity });

    if (currentEquity > peakEquity) peakEquity = currentEquity;
    const dd = peakEquity - currentEquity;
    if (dd > maxDrawdown) maxDrawdown = dd;

    const signal = signalAt(i);

    if (position) {
      let exitReason: BacktestTrade['exitReason'] | null = null;

      if (position.side === 'long') {
        if (price >= position.entryPrice * (1 + takeProfit / 100)) exitReason = 'take-profit';
        else if (price <= position.entryPrice * (1 - stopLoss / 100)) exitReason = 'stop-loss';
        else if (signal !== undefined && signal < 40) exitReason = 'signal-reverse';
      } else {
        if (price <= position.entryPrice * (1 - takeProfit / 100)) exitReason = 'take-profit';
        else if (price >= position.entryPrice * (1 + stopLoss / 100)) exitReason = 'stop-loss';
        else if (signal !== undefined && signal > 60) exitReason = 'signal-reverse';
      }

      if (exitReason) {
        const gross =
          position.side === 'long'
            ? (price - position.entryPrice) * position.amount
            : (position.entryPrice - price) * position.amount;
        const fees = (position.entryPrice + price) * position.amount * feeRate;
        const net = gross - fees;
        const pnlPercent = (net / (position.entryPrice * position.amount)) * 100;

        capital += net;

        trades.push({
          entryPrice: position.entryPrice,
          exitPrice: price,
          entryTime: position.entryTime,
          exitTime: timestamp,
          side: position.side,
          amount: position.amount,
          pnl: net,
          pnlPercent,
          fees,
          exitReason,
        });

        position = null;
      }
    }

    if (!position && signal !== undefined && trades.length < maxTrades && i < candles.length - 1) {
      if (signal >= 60 || signal <= 40) {
        const tradeCapital = capital * (positionSize / 100);
        const amount = tradeCapital / price;

        position = {
          entryPrice: price,
          entryTime: timestamp,
          side: signal >= 60 ? 'long' : 'short',
          amount,
        };
      }
    }
  }

  // Close any position still open on the final candle.
  if (position) {
    const last = candles[candles.length - 1];
    const gross =
      position.side === 'long'
        ? (last.close - position.entryPrice) * position.amount
        : (position.entryPrice - last.close) * position.amount;
    const fees = (position.entryPrice + last.close) * position.amount * feeRate;
    capital += gross - fees;

    trades.push({
      entryPrice: position.entryPrice,
      exitPrice: last.close,
      entryTime: position.entryTime,
      exitTime: last.timestamp,
      side: position.side,
      amount: position.amount,
      pnl: gross - fees,
      pnlPercent: ((gross - fees) / (position.entryPrice * position.amount)) * 100,
      fees,
      exitReason: 'time-exit',
    });
  }

  const winningTrades = trades.filter((t) => t.pnl > 0);
  const losingTrades = trades.filter((t) => t.pnl <= 0);
  const winRate = trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0;
  const avgWin = winningTrades.length > 0 ? winningTrades.reduce((s, t) => s + t.pnl, 0) / winningTrades.length : 0;
  const avgLoss =
    losingTrades.length > 0 ? Math.abs(losingTrades.reduce((s, t) => s + t.pnl, 0) / losingTrades.length) : 0;
  const profitFactor = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0;

  const returns = trades.map((t) => t.pnl / initialCapital);
  const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const stdDev =
    returns.length > 1
      ? Math.sqrt(returns.map((r) => Math.pow(r - avgReturn, 2)).reduce((a, b) => a + b, 0) / returns.length)
      : 0;
  const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

  const avgTradeDuration =
    trades.length > 0
      ? trades.reduce((s, t) => s + (t.exitTime - t.entryTime), 0) / trades.length / 3_600_000
      : 0;

  let maxConsecutiveWins = 0;
  let maxConsecutiveLosses = 0;
  let curWins = 0;
  let curLosses = 0;
  trades.forEach((t) => {
    if (t.pnl > 0) {
      curWins++;
      curLosses = 0;
      maxConsecutiveWins = Math.max(maxConsecutiveWins, curWins);
    } else {
      curLosses++;
      curWins = 0;
      maxConsecutiveLosses = Math.max(maxConsecutiveLosses, curLosses);
    }
  });

  return {
    totalReturn: capital - initialCapital,
    totalReturnPercent: ((capital - initialCapital) / initialCapital) * 100,
    totalTrades: trades.length,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    winRate,
    avgWin,
    avgLoss,
    profitFactor,
    sharpeRatio,
    maxDrawdown,
    maxDrawdownPercent: peakEquity > 0 ? (maxDrawdown / peakEquity) * 100 : 0,
    avgTradeDuration,
    bestTrade: trades.length > 0 ? Math.max(...trades.map((t) => t.pnl)) : 0,
    worstTrade: trades.length > 0 ? Math.min(...trades.map((t) => t.pnl)) : 0,
    consecutiveWins: maxConsecutiveWins,
    consecutiveLosses: maxConsecutiveLosses,
    trades,
    equityCurve,
    symbol: meta.symbol,
    interval: meta.interval,
    candleCount: candles.length,
    periodStart: candles[0].timestamp,
    periodEnd: candles[candles.length - 1].timestamp,
    isLive: true,
    source: meta.source,
  };
}

/** Default backtest configuration used by the dashboard. */
export function defaultBacktestConfig(): BacktestConfig {
  return {
    initialCapital: 10000,
    positionSize: 20,
    takeProfit: 5,
    stopLoss: 3,
    maxTrades: 50,
    feeRate: 0.001,
  };
}
