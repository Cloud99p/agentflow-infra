/**
 * Portfolio Tracker for AgentFlow Infra
 *
 * Holds real positions and trade history loaded from a persisted state file,
 * and marks positions to live market prices. No mock data is generated here.
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

export interface TradeRecord {
  symbol: string;
  side: 'long' | 'short';
  amount: number;
  entryPrice: number;
  exitPrice: number;
  openedAt: number;
  closedAt: number;
  pnl: number;
}

export interface PortfolioMetrics {
  totalValue: number;
  totalPnL: number;
  totalPnLPercent: number;
  realizedPnL: number;
  unrealizedPnL: number;
  cash: number;
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
  /** True when backed by a real persisted state file. */
  isLive: boolean;
  /** Where the data came from, for honest display. */
  source: string;
}

/**
 * Calculate position PnL.
 */
export function calculatePositionPnL(position: Position): { pnl: number; pnlPercent: number } {
  if (position.side === 'long') {
    const pnl = (position.currentPrice - position.entryPrice) * position.amount;
    const pnlPercent = ((position.currentPrice - position.entryPrice) / position.entryPrice) * 100;
    return { pnl, pnlPercent };
  }
  const pnl = (position.entryPrice - position.currentPrice) * position.amount;
  const pnlPercent = ((position.entryPrice - position.currentPrice) / position.entryPrice) * 100;
  return { pnl, pnlPercent };
}

/**
 * Calculate portfolio metrics from real positions and trade history.
 *
 * @param positions - Open positions (currentPrice must be a live price)
 * @param realizedPnL - Sum of realized gains/losses from closed trades
 * @param tradeHistory - Closed trades, used for win rate / Sharpe / drawdown
 * @param cash - Uninvested cash balance
 */
export function calculatePortfolioMetrics(
  positions: Position[],
  realizedPnL: number = 0,
  tradeHistory: { pnl: number; timestamp: number }[] = [],
  cash: number = 0
): PortfolioMetrics {
  let unrealizedPnL = 0;
  let totalPositionValue = 0;

  const positionsWithPnL = positions.map((pos) => {
    const { pnl, pnlPercent } = calculatePositionPnL(pos);
    unrealizedPnL += pnl;
    totalPositionValue += pos.currentPrice * pos.amount;
    return { ...pos, pnl, pnlPercent };
  });

  // Portfolio value is cash plus the live marked value of open positions.
  const totalValue = totalPositionValue + cash;
  const totalPnL = unrealizedPnL + realizedPnL;
  const costBasis = totalValue - totalPnL;
  const totalPnLPercent = costBasis > 0 ? (totalPnL / costBasis) * 100 : 0;

  const allocation = positionsWithPnL.map((pos) => ({
    symbol: pos.symbol,
    percentage: totalPositionValue > 0 ? ((pos.currentPrice * pos.amount) / totalPositionValue) * 100 : 0,
  }));

  const winningTrades = tradeHistory.filter((t) => t.pnl > 0);
  const losingTrades = tradeHistory.filter((t) => t.pnl <= 0);
  const winRate = tradeHistory.length > 0 ? (winningTrades.length / tradeHistory.length) * 100 : 0;

  const avgWin =
    winningTrades.length > 0 ? winningTrades.reduce((s, t) => s + t.pnl, 0) / winningTrades.length : 0;
  const avgLoss =
    losingTrades.length > 0
      ? Math.abs(losingTrades.reduce((s, t) => s + t.pnl, 0) / losingTrades.length)
      : 0;

  const profitFactor = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0;

  const returns = tradeHistory.map((t) => (totalValue > 0 ? t.pnl / totalValue : 0));
  const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const stdDev =
    returns.length > 1
      ? Math.sqrt(returns.map((r) => Math.pow(r - avgReturn, 2)).reduce((a, b) => a + b, 0) / returns.length)
      : 0;
  const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

  let peak = 0;
  let maxDrawdown = 0;
  let cumulative = 0;
  tradeHistory.forEach((t) => {
    cumulative += t.pnl;
    if (cumulative > peak) peak = cumulative;
    const dd = peak - cumulative;
    if (dd > maxDrawdown) maxDrawdown = dd;
  });

  return {
    totalValue,
    totalPnL,
    totalPnLPercent,
    realizedPnL,
    unrealizedPnL,
    cash,
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
    maxDrawdown,
    isLive: false,
    source: 'unset',
  };
}

/** Shape of the persisted portfolio state file. */
export interface PortfolioState {
  createdAt: string;
  updatedAt: string;
  cash: number;
  positions: {
    symbol: string;
    amount: number;
    entryPrice: number;
    side: 'long' | 'short';
    openedAt: number;
  }[];
  tradeHistory: TradeRecord[];
}

/**
 * Validate a parsed portfolio state. Throws with a clear message on bad input
 * so a corrupt file surfaces immediately instead of producing silent zeros.
 */
export function validatePortfolioState(raw: unknown): PortfolioState {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Portfolio state must be a JSON object');
  }

  const s = raw as any;

  if (typeof s.cash !== 'number' || !Number.isFinite(s.cash)) {
    throw new Error('Portfolio state: "cash" must be a finite number');
  }
  if (!Array.isArray(s.positions)) {
    throw new Error('Portfolio state: "positions" must be an array');
  }
  if (!Array.isArray(s.tradeHistory)) {
    throw new Error('Portfolio state: "tradeHistory" must be an array');
  }

  s.positions.forEach((p: any, i: number) => {
    if (typeof p?.symbol !== 'string') throw new Error(`positions[${i}].symbol must be a string`);
    if (typeof p?.amount !== 'number' || !Number.isFinite(p.amount) || p.amount <= 0) {
      throw new Error(`positions[${i}].amount must be a positive number`);
    }
    if (typeof p?.entryPrice !== 'number' || !Number.isFinite(p.entryPrice) || p.entryPrice <= 0) {
      throw new Error(`positions[${i}].entryPrice must be a positive number`);
    }
    if (p?.side !== 'long' && p?.side !== 'short') {
      throw new Error(`positions[${i}].side must be "long" or "short"`);
    }
  });

  return {
    createdAt: s.createdAt ?? new Date().toISOString(),
    updatedAt: s.updatedAt ?? new Date().toISOString(),
    cash: s.cash,
    positions: s.positions,
    tradeHistory: s.tradeHistory,
  };
}

/**
 * An empty starting portfolio. Used when no state file exists yet.
 */
export function emptyPortfolioState(): PortfolioState {
  const now = new Date().toISOString();
  return {
    createdAt: now,
    updatedAt: now,
    cash: 10000,
    positions: [],
    tradeHistory: [],
  };
}
