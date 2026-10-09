/**
 * Technical Indicators for the Signal Engine
 *
 * Pure functions over OHLCV candles. All indicators are computed from real
 * market data supplied by the caller; nothing here fabricates values.
 */

export interface PriceData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Exponential Moving Average over a full series.
 * Returns one EMA value per input price (seeded with the first price).
 */
export function emaSeries(prices: number[], period: number): number[] {
  if (prices.length === 0) return [];

  const multiplier = 2 / (period + 1);
  const out: number[] = [prices[0]];

  for (let i = 1; i < prices.length; i++) {
    out.push((prices[i] - out[i - 1]) * multiplier + out[i - 1]);
  }

  return out;
}

/**
 * Simple Moving Average of the last `period` values.
 */
export function sma(prices: number[], period: number): number {
  if (prices.length < period) return 0;
  const slice = prices.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

/**
 * Wilder-smoothed RSI over closing prices.
 *
 * Uses Wilder's smoothing (the standard), not a simple average, so the result
 * matches what exchanges and TradingView report.
 *
 * @returns RSI in 0-100, or null when there is insufficient data.
 *          Never returns a placeholder like 50 to avoid implying a real reading.
 */
export function calculateRSI(prices: number[], period = 14): number | null {
  if (prices.length < period + 1) return null;

  let gainSum = 0;
  let lossSum = 0;

  // Seed averages from the first `period` changes.
  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gainSum += change;
    else lossSum += Math.abs(change);
  }

  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;

  // Wilder smoothing across the remainder.
  for (let i = period + 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export interface MACDResult {
  macd: number;
  signal: number;
  histogram: number;
}

/**
 * MACD with a real signal line.
 *
 * The signal line is the EMA of the MACD series (not a scaled approximation),
 * which is the actual definition.
 *
 * @returns MACD result, or null when there is insufficient data.
 */
export function calculateMACD(
  prices: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
): MACDResult | null {
  if (prices.length < slowPeriod + signalPeriod) return null;

  const fast = emaSeries(prices, fastPeriod);
  const slow = emaSeries(prices, slowPeriod);

  // MACD line: fast EMA minus slow EMA, aligned to the tail.
  const macdSeries: number[] = [];
  for (let i = 0; i < prices.length; i++) {
    macdSeries.push(fast[i] - slow[i]);
  }

  // Signal line: EMA of the MACD series.
  const signalSeries = emaSeries(macdSeries, signalPeriod);

  const macd = macdSeries[macdSeries.length - 1];
  const signal = signalSeries[signalSeries.length - 1];

  // Round first, then derive the histogram from the rounded values so the
  // returned object is internally consistent (macd - signal === histogram).
  const macdR = Math.round(macd * 10000) / 10000;
  const signalR = Math.round(signal * 10000) / 10000;

  return {
    macd: macdR,
    signal: signalR,
    histogram: Math.round((macdR - signalR) * 10000) / 10000,
  };
}

/**
 * Average True Range over candles (Wilder smoothing).
 * @returns ATR in price units, or null when there is insufficient data.
 */
export function calculateATR(candles: PriceData[], period = 14): number | null {
  if (candles.length < period + 1) return null;

  const trueRanges: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const highLow = candles[i].high - candles[i].low;
    const highClose = Math.abs(candles[i].high - candles[i - 1].close);
    const lowClose = Math.abs(candles[i].low - candles[i - 1].close);
    trueRanges.push(Math.max(highLow, highClose, lowClose));
  }

  // Wilder smoothing.
  let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
  }

  return atr;
}

/**
 * Volume trend: latest candle volume versus the average of prior candles.
 * @returns ratio (1.0 = in line with average), or null when unavailable.
 */
export function volumeRatio(candles: PriceData[], lookback = 20): number | null {
  if (candles.length < lookback + 1) return null;

  const current = candles[candles.length - 1].volume;
  const prior = candles.slice(-lookback - 1, -1);
  const avg = prior.reduce((sum, c) => sum + c.volume, 0) / prior.length;

  if (avg === 0) return null;
  return current / avg;
}

/**
 * Position within a range as a percentage (0 = at low, 100 = at high).
 */
export function rangePosition(price: number, low: number, high: number): number {
  if (high <= low) return 50;
  return ((price - low) / (high - low)) * 100;
}

/** Map an RSI reading to a directional score (0-100). */
export function getRSISignal(rsi: number): { score: number; interpretation: string } {
  if (rsi < 20) return { score: 85, interpretation: 'Oversold' };
  if (rsi < 30) return { score: 70, interpretation: 'Approaching oversold' };
  if (rsi < 45) return { score: 55, interpretation: 'Neutral-bearish' };
  if (rsi < 55) return { score: 50, interpretation: 'Neutral' };
  if (rsi < 65) return { score: 45, interpretation: 'Neutral-bullish' };
  if (rsi < 75) return { score: 30, interpretation: 'Approaching overbought' };
  return { score: 15, interpretation: 'Overbought' };
}

/** Map MACD output to a directional score (0-100). */
export function getMACDSignal(
  macd: number,
  histogram: number
): { score: number; interpretation: string } {
  if (macd > 0 && histogram > 0) return { score: 75, interpretation: 'Bullish momentum' };
  if (macd > 0 && histogram < 0) return { score: 55, interpretation: 'Bullish but weakening' };
  if (macd < 0 && histogram < 0) return { score: 25, interpretation: 'Bearish momentum' };
  return { score: 45, interpretation: 'Bearish but weakening' };
}
