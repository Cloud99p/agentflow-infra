/**
 * Portfolio Tracker for AgentFlow Infra
 * 
 * Tracks holdings, PnL, allocation, and performance metrics
 */

export interface Position {
  symbol: string;
  amount: number;
  entryPrice: number;
  currentPrice: number;
  side: 'long' | 'short';
  openedAt: number;
  pnl?: number;
  pnlPercent?: number;
}

export interface PortfolioMetrics {
  totalValue: number;
  totalPnL: number;
  totalPnLPercent: number;
  realizedPnL: number;
  unrealizedPnL: number;
  positions: Position[];
  allocation: { symbol: string; percentage: number }[];
  winRate: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdown: number;
}

/**
 * Calculate position PnL
 */
export function calculatePositionPnL(position: Position): { pnl: number; pnlPercent: number } {
  if (position.side === 'long') {
    const pnl = (position.currentPrice - position.entryPrice) * position.amount;
    const pnlPercent = ((position.currentPrice - position.entryPrice) / position.entryPrice) * 100;
    return { pnl, pnlPercent };
  } else {
    const pnl = (position.entryPrice - position.currentPrice) * position.amount;
    const pnlPercent = ((position.entryPrice - position.currentPrice) / position.entryPrice) * 100;
    return { pnl, pnlPercent };
  }
}

/**
 * Calculate portfolio metrics
 */
export function calculatePortfolioMetrics(
  positions: Position[],
  realizedPnL: number = 0,
  tradeHistory: { pnl: number; timestamp: number }[] = []
): PortfolioMetrics {
  // Calculate unrealized PnL
  let unrealizedPnL = 0;
  let totalPositionValue = 0;

  const positionsWithPnL = positions.map(pos => {
    const { pnl, pnlPercent } = calculatePositionPnL(pos);
    unrealizedPnL += pnl;
    const positionValue = pos.currentPrice * pos.amount;
    totalPositionValue += positionValue;
    return { ...pos, pnl, pnlPercent };
  });

  const totalValue = totalPositionValue + realizedPnL;
  const totalPnL = unrealizedPnL + realizedPnL;
  const totalPnLPercent = totalPositionValue > 0 ? (totalPnL / totalPositionValue) * 100 : 0;

  // Calculate allocation
  const allocation = positionsWithPnL.map(pos => ({
    symbol: pos.symbol,
    percentage: totalPositionValue > 0 ? ((pos.currentPrice * pos.amount) / totalPositionValue) * 100 : 0
  }));

  // Calculate win rate and trade stats
  const winningTrades = tradeHistory.filter(t => t.pnl > 0);
  const losingTrades = tradeHistory.filter(t => t.pnl <= 0);
  const winRate = tradeHistory.length > 0 ? (winningTrades.length / tradeHistory.length) * 100 : 0;

  const avgWin = winningTrades.length > 0 
    ? winningTrades.reduce((sum, t) => sum + t.pnl, 0) / winningTrades.length 
    : 0;
  const avgLoss = losingTrades.length > 0 
    ? Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0) / losingTrades.length) 
    : 0;

  const profitFactor = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0;

  // Calculate Sharpe Ratio (simplified)
  const returns = tradeHistory.map(t => t.pnl / totalValue);
  const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const stdDev = returns.length > 1 
    ? Math.sqrt(returns.map(r => Math.pow(r - avgReturn, 2)).reduce((a, b) => a + b, 0) / returns.length)
    : 0;
  const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0; // Annualized

  // Calculate max drawdown
  let peak = 0;
  let maxDrawdown = 0;
  let cumulativePnL = 0;
  tradeHistory.forEach(trade => {
    cumulativePnL += trade.pnl;
    if (cumulativePnL > peak) peak = cumulativePnL;
    const drawdown = peak - cumulativePnL;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  });

  return {
    totalValue,
    totalPnL,
    totalPnLPercent,
    realizedPnL,
    unrealizedPnL,
    positions: positionsWithPnL,
    allocation,
    winRate,
    totalTrades: tradeHistory.length,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    avgWin,
    avgLoss,
    profitFactor,
    sharpeRatio,
    maxDrawdown
  };
}

/**
 * Generate mock portfolio data for demo
 */
export function generateMockPortfolio(): PortfolioMetrics {
  const mockPositions: Position[] = [
    {
      symbol: 'BTCUSDT',
      amount: 0.05,
      entryPrice: 63500,
      currentPrice: 64174,
      side: 'long',
      openedAt: Date.now() - 86400000
    },
    {
      symbol: 'ETHUSDT',
      amount: 2.5,
      entryPrice: 1720,
      currentPrice: 1734,
      side: 'long',
      openedAt: Date.now() - 43200000
    },
    {
      symbol: 'SOLUSDT',
      amount: 50,
      entryPrice: 142,
      currentPrice: 138,
      side: 'long',
      openedAt: Date.now() - 21600000
    }
  ];

  const mockTradeHistory = Array.from({ length: 25 }, (_, i) => ({
    pnl: (Math.random() - 0.45) * 200, // Slightly positive bias
    timestamp: Date.now() - (25 - i) * 86400000
  }));

  return calculatePortfolioMetrics(mockPositions, 1250, mockTradeHistory);
}
