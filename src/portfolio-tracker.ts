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
  pnl?: number | null;
  pnlPercent?: number | null;
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
  /** Fees paid on this closed trade, if any. */
  fees?: number;
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
  /** Symbols with an open position but no live price. Excluded from totals. */
  skippedPositions: string[];
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
  const skippedPositions: string[] = [];

  const positionsWithPnL = positions.map((pos) => {
    // A position with no live mark cannot contribute to totals. Including it
    // would poison every downstream number with NaN, so it is skipped and
    // reported instead.
    const hasMark = Number.isFinite(pos.currentPrice) && pos.currentPrice > 0;
    if (!hasMark) {
      skippedPositions.push(pos.symbol);
      return { ...pos, currentPrice: null, pnl: null, pnlPercent: null, priced: false };
    }

    const { pnl, pnlPercent } = calculatePositionPnL(pos);
    unrealizedPnL += pnl;
    totalPositionValue += pos.currentPrice * pos.amount;
    return { ...pos, pnl, pnlPercent, priced: true };
  });

  // Portfolio value is cash plus the live marked value of open positions.
  const totalValue = totalPositionValue + cash;
  const totalPnL = unrealizedPnL + realizedPnL;
  const costBasis = totalValue - totalPnL;
  const totalPnLPercent = costBasis > 0 ? (totalPnL / costBasis) * 100 : 0;

  const allocation = positionsWithPnL
    .filter((pos) => pos.priced)
    .map((pos) => ({
      symbol: pos.symbol,
      percentage: totalPositionValue > 0 ? ((pos.currentPrice! * pos.amount) / totalPositionValue) * 100 : 0,
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

  // Infinity is honest but serialises to "null" in JSON, which reads as a bug.
  // Report the ratio when it is meaningful and 0 when there is nothing to lose.
  const profitFactor = avgLoss > 0 ? avgWin / avgLoss : 0;

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
    skippedPositions,
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
  /** Realized PnL accumulated by closed trades. */
  realizedPnL?: number;
}

/**
 * Validate a ticker symbol. Guards against values that would end up in an
 * outbound API URL or a price lookup key.
 */
export function isValidSymbol(symbol: unknown): symbol is string {
  return typeof symbol === 'string' && /^[A-Z0-9]{2,20}$/.test(symbol);
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

  s.tradeHistory.forEach((t: any, i: number) => {
    if (typeof t?.pnl !== 'number' || !Number.isFinite(t.pnl)) {
      throw new Error(`tradeHistory[${i}].pnl must be a finite number`);
    }
  });

  const realizedPnL =
    typeof s.realizedPnL === 'number' && Number.isFinite(s.realizedPnL)
      ? s.realizedPnL
      : s.tradeHistory.reduce((sum: number, t: any) => sum + t.pnl, 0);

  return {
    createdAt: s.createdAt ?? new Date().toISOString(),
    updatedAt: s.updatedAt ?? new Date().toISOString(),
    cash: s.cash,
    positions: s.positions,
    tradeHistory: s.tradeHistory,
    realizedPnL,
  };
}

/**
 * Open a position against available cash. Mutates the state and returns the
 * new position. Throws if the symbol is invalid, the inputs are nonsensical,
 * or there is not enough cash.
 *
 * Unit checks are intentionally strict: amount is in units of the asset,
 * entryPrice is in quote currency (USDT).
 */
export function openPosition(
  state: PortfolioState,
  input: { symbol: string; amount: number; entryPrice: number; side?: 'long' | 'short'; openedAt?: number }
): PortfolioState {
  const symbol = String(input.symbol || '').toUpperCase();
  if (!isValidSymbol(symbol)) throw new Error(`Invalid symbol: ${input.symbol}`);
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error('amount must be a positive number');
  if (!Number.isFinite(input.entryPrice) || input.entryPrice <= 0) throw new Error('entryPrice must be a positive number');

  const side = input.side ?? 'long';
  if (side !== 'long' && side !== 'short') throw new Error('side must be "long" or "short"');

  const cost = input.amount * input.entryPrice;
  if (cost > state.cash) {
    throw new Error(`Insufficient cash: need $${cost.toFixed(2)}, have $${state.cash.toFixed(2)}`);
  }

  state.positions.push({
    symbol,
    amount: input.amount,
    entryPrice: input.entryPrice,
    side,
    openedAt: input.openedAt ?? Date.now(),
  });
  state.cash -= cost;
  state.updatedAt = new Date().toISOString();
  return state;
}

/**
 * Close an open position at a given price, realizing PnL.
 * Returns the resulting trade record.
 */
export function closePosition(
  state: PortfolioState,
  input: { symbol: string; exitPrice: number; closedAt?: number; feeRate?: number }
): TradeRecord {
  const symbol = String(input.symbol || '').toUpperCase();
  if (!Number.isFinite(input.exitPrice) || input.exitPrice <= 0) throw new Error('exitPrice must be a positive number');

  const index = state.positions.findIndex((p) => p.symbol === symbol);
  if (index === -1) throw new Error(`No open position for ${symbol}`);

  const pos = state.positions[index];
  const closedAt = input.closedAt ?? Date.now();
  const feeRate = input.feeRate ?? 0;

  const gross =
    pos.side === 'long'
      ? (input.exitPrice - pos.entryPrice) * pos.amount
      : (pos.entryPrice - input.exitPrice) * pos.amount;
  const fees = (pos.entryPrice + input.exitPrice) * pos.amount * feeRate;
  const pnl = gross - fees;

  const trade: TradeRecord = {
    symbol,
    side: pos.side,
    amount: pos.amount,
    entryPrice: pos.entryPrice,
    exitPrice: input.exitPrice,
    openedAt: pos.openedAt,
    closedAt,
    pnl,
    fees,
  };

  state.positions.splice(index, 1);
  // Capital returns at market value, then the realized PnL is applied on top.
  // Crediting `proceeds + pnl` would count the profit twice.
  state.cash += pos.amount * input.exitPrice - fees;
  state.realizedPnL = (state.realizedPnL ?? 0) + pnl;
  state.tradeHistory.push(trade);
  state.updatedAt = new Date().toISOString();

  return trade;
}

/**
 * Persist state to disk atomically (write temp, then rename) so a crash
 * mid-write cannot leave a half-written portfolio behind.
 */
export function savePortfolioState(state: PortfolioState, filePath: string, fs: any): void {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, filePath);
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
    realizedPnL: 0,
  };
}
