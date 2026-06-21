/**
 * Backtesting Engine for AgentFlow Infra
 * 
 * Tests trading strategies on historical data
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
}

export interface BacktestConfig {
  initialCapital: number;
  positionSize: number; // Percentage of capital
  takeProfit: number; // Percentage
  stopLoss: number; // Percentage
  maxTrades?: number;
  feeRate?: number; // Trading fee percentage
}

/**
 * Run backtest on price data
 */
export function runBacktest(
  priceData: { timestamp: number; price: number; signal?: number }[],
  config: BacktestConfig
): BacktestMetrics {
  const {
    initialCapital,
    positionSize,
    takeProfit,
    stopLoss,
    maxTrades = 100,
    feeRate = 0.001 // 0.1% default fee
  } = config;

  let capital = initialCapital;
  let position: { entryPrice: number; entryTime: number; side: 'long' | 'short'; amount: number } | null = null;
  const trades: BacktestTrade[] = [];
  const equityCurve: { timestamp: number; value: number }[] = [];
  let peakEquity = initialCapital;
  let maxDrawdown = 0;

  for (let i = 0; i < priceData.length; i++) {
    const { timestamp, price, signal } = priceData[i];
    const currentEquity = position ? capital + (position.side === 'long' ? (price - position.entryPrice) * position.amount : (position.entryPrice - price) * position.amount) : capital;

    // Track equity curve
    equityCurve.push({ timestamp, value: currentEquity });

    // Track max drawdown
    if (currentEquity > peakEquity) peakEquity = currentEquity;
    const drawdown = peakEquity - currentEquity;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;

    // Check for exit conditions
    if (position) {
      let exitReason: BacktestTrade['exitReason'] = 'signal-reverse';
      let shouldExit = false;

      if (position.side === 'long') {
        if (price >= position.entryPrice * (1 + takeProfit / 100)) {
          exitReason = 'take-profit';
          shouldExit = true;
        } else if (price <= position.entryPrice * (1 - stopLoss / 100)) {
          exitReason = 'stop-loss';
          shouldExit = true;
        } else if (signal !== undefined && signal < 40) {
          exitReason = 'signal-reverse';
          shouldExit = true;
        }
      } else {
        if (price <= position.entryPrice * (1 - takeProfit / 100)) {
          exitReason = 'take-profit';
          shouldExit = true;
        } else if (price >= position.entryPrice * (1 + stopLoss / 100)) {
          exitReason = 'stop-loss';
          shouldExit = true;
        } else if (signal !== undefined && signal > 60) {
          exitReason = 'signal-reverse';
          shouldExit = true;
        }
      }

      if (shouldExit) {
        const pnl = position.side === 'long' 
          ? (price - position.entryPrice) * position.amount 
          : (position.entryPrice - price) * position.amount;
        const fees = (position.entryPrice + price) * position.amount * feeRate;
        const netPnl = pnl - fees;
        const pnlPercent = (netPnl / (position.entryPrice * position.amount)) * 100;

        capital += netPnl;

        trades.push({
          entryPrice: position.entryPrice,
          exitPrice: price,
          entryTime: position.entryTime,
          exitTime: timestamp,
          side: position.side,
          amount: position.amount,
          pnl: netPnl,
          pnlPercent,
          fees,
          exitReason
        });

        position = null;
      }
    }

    // Check for entry conditions
    if (!position && signal !== undefined && trades.length < maxTrades) {
      if (signal >= 60) {
        // Long entry
        const tradeCapital = capital * (positionSize / 100);
        const amount = tradeCapital / price;
        position = {
          entryPrice: price,
          entryTime: timestamp,
          side: 'long',
          amount
        };
      } else if (signal <= 40) {
        // Short entry
        const tradeCapital = capital * (positionSize / 100);
        const amount = tradeCapital / price;
        position = {
          entryPrice: price,
          entryTime: timestamp,
          side: 'short',
          amount
        };
      }
    }
  }

  // Close any open position at the end
  if (position && priceData.length > 0) {
    const finalPrice = priceData[priceData.length - 1].price;
    const pnl = position.side === 'long' 
      ? (finalPrice - position.entryPrice) * position.amount 
      : (position.entryPrice - finalPrice) * position.amount;
    const fees = (position.entryPrice + finalPrice) * position.amount * feeRate;
    capital += pnl - fees;

    trades.push({
      entryPrice: position.entryPrice,
      exitPrice: finalPrice,
      entryTime: position.entryTime,
      exitTime: priceData[priceData.length - 1].timestamp,
      side: position.side,
      amount: position.amount,
      pnl: pnl - fees,
      pnlPercent: ((pnl - fees) / (position.entryPrice * position.amount)) * 100,
      fees,
      exitReason: 'time-exit'
    });
  }

  // Calculate metrics
  const winningTrades = trades.filter(t => t.pnl > 0);
  const losingTrades = trades.filter(t => t.pnl <= 0);
  const winRate = trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0;
  const avgWin = winningTrades.length > 0 ? winningTrades.reduce((sum, t) => sum + t.pnl, 0) / winningTrades.length : 0;
  const avgLoss = losingTrades.length > 0 ? Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0) / losingTrades.length) : 0;
  const profitFactor = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0;

  const returns = trades.map(t => t.pnl / initialCapital);
  const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const stdDev = returns.length > 1 
    ? Math.sqrt(returns.map(r => Math.pow(r - avgReturn, 2)).reduce((a, b) => a + b, 0) / returns.length)
    : 0;
  const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

  const avgTradeDuration = trades.length > 0 
    ? trades.reduce((sum, t) => sum + (t.exitTime - t.entryTime), 0) / trades.length / 3600000 // hours
    : 0;

  const bestTrade = trades.length > 0 ? Math.max(...trades.map(t => t.pnl)) : 0;
  const worstTrade = trades.length > 0 ? Math.min(...trades.map(t => t.pnl)) : 0;

  // Calculate consecutive wins/losses
  let maxConsecutiveWins = 0;
  let maxConsecutiveLosses = 0;
  let currentWins = 0;
  let currentLosses = 0;
  trades.forEach(t => {
    if (t.pnl > 0) {
      currentWins++;
      currentLosses = 0;
      maxConsecutiveWins = Math.max(maxConsecutiveWins, currentWins);
    } else {
      currentLosses++;
      currentWins = 0;
      maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentLosses);
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
    maxDrawdownPercent: (maxDrawdown / peakEquity) * 100,
    avgTradeDuration,
    bestTrade,
    worstTrade,
    consecutiveWins: maxConsecutiveWins,
    consecutiveLosses: maxConsecutiveLosses,
    trades,
    equityCurve
  };
}

/**
 * Generate mock backtest data for demo
 */
export function generateMockBacktest(): BacktestMetrics {
  // Generate 30 days of mock price data with signals
  const priceData = [];
  let price = 64000;
  const now = Date.now();
  
  for (let i = 30; i >= 0; i--) {
    const timestamp = now - i * 86400000;
    price = price * (1 + (Math.random() - 0.48) * 0.03); // Slight upward bias
    const signal = 30 + Math.random() * 40; // Random signal 30-70
    priceData.push({ timestamp, price, signal });
  }

  return runBacktest(priceData, {
    initialCapital: 10000,
    positionSize: 20,
    takeProfit: 5,
    stopLoss: 3,
    maxTrades: 50,
    feeRate: 0.001
  });
}
