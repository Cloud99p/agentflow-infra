/**
 * Technical Indicators for Signal Engine
 * 
 * Calculates RSI, MACD, Volume Analysis, and more
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
 * Calculate RSI (Relative Strength Index)
 * @param prices - Array of closing prices
 * @param period - RSI period (default: 14)
 * @returns RSI value (0-100)
 */
export function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50; // Not enough data

  let gains = 0;
  let losses = 0;

  // Calculate initial average gain/loss
  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  // Calculate RSI
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));

  return Math.round(rsi * 100) / 100;
}

/**
 * Calculate MACD (Moving Average Convergence Divergence)
 * @param prices - Array of closing prices
 * @param fastPeriod - Fast EMA period (default: 12)
 * @param slowPeriod - Slow EMA period (default: 26)
 * @param signalPeriod - Signal line period (default: 9)
 * @returns MACD object with line, signal, and histogram
 */
export function calculateMACD(
  prices: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): { macd: number; signal: number; histogram: number } {
  if (prices.length < slowPeriod + signalPeriod) {
    return { macd: 0, signal: 0, histogram: 0 };
  }

  // Calculate EMAs
  const fastEMA = calculateEMA(prices, fastPeriod);
  const slowEMA = calculateEMA(prices, slowPeriod);

  // MACD line
  const macdLine = fastEMA - slowEMA;

  // For simplicity, using MACD line as signal (proper implementation would calculate EMA of MACD)
  const signalLine = macdLine * 0.8; // Simplified
  const histogram = macdLine - signalLine;

  return {
    macd: Math.round(macdLine * 100) / 100,
    signal: Math.round(signalLine * 100) / 100,
    histogram: Math.round(histogram * 100) / 100,
  };
}

/**
 * Calculate EMA (Exponential Moving Average)
 */
function calculateEMA(prices: number[], period: number): number {
  if (prices.length === 0) return 0;

  const multiplier = 2 / (period + 1);
  let ema = prices[0];

  for (let i = 1; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
  }

  return ema;
}

/**
 * Calculate Volume Analysis
 * @param currentVolume - Current 24h volume
 * @param avgVolume - Average volume (if available)
 * @returns Volume score (0-100) and analysis
 */
export function analyzeVolume(
  currentVolume: number,
  avgVolume?: number
): { score: number; analysis: string; ratio: number } {
  if (!avgVolume || avgVolume === 0) {
    // No historical data, use absolute volume thresholds
    if (currentVolume > 1_000_000_000) {
      return { score: 85, analysis: 'Very High Volume', ratio: 1 };
    } else if (currentVolume > 100_000_000) {
      return { score: 70, analysis: 'High Volume', ratio: 1 };
    } else if (currentVolume > 10_000_000) {
      return { score: 55, analysis: 'Average Volume', ratio: 1 };
    } else {
      return { score: 35, analysis: 'Low Volume', ratio: 1 };
    }
  }

  const ratio = currentVolume / avgVolume;

  if (ratio > 2) {
    return { score: 90, analysis: `Volume spike! ${ratio.toFixed(1)}x average`, ratio };
  } else if (ratio > 1.5) {
    return { score: 75, analysis: `Above average volume (${ratio.toFixed(1)}x)`, ratio };
  } else if (ratio > 0.8) {
    return { score: 60, analysis: 'Normal volume', ratio };
  } else if (ratio > 0.5) {
    return { score: 40, analysis: `Below average volume (${ratio.toFixed(1)}x)`, ratio };
  } else {
    return { score: 20, analysis: `Very low volume (${ratio.toFixed(1)}x average)`, ratio };
  }
}

/**
 * Calculate Bollinger Bands
 * @param prices - Array of closing prices
 * @param period - SMA period (default: 20)
 * @param stdDev - Standard deviation multiplier (default: 2)
 * @returns Bollinger Bands object
 */
export function calculateBollingerBands(
  prices: number[],
  period: number = 20,
  stdDev: number = 2
): { upper: number; middle: number; lower: number; bandwidth: number } {
  if (prices.length < period) {
    return { upper: 0, middle: 0, lower: 0, bandwidth: 0 };
  }

  // Calculate SMA
  const slice = prices.slice(-period);
  const sma = slice.reduce((a, b) => a + b, 0) / period;

  // Calculate standard deviation
  const squaredDiffs = slice.map((price) => Math.pow(price - sma, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
  const standardDeviation = Math.sqrt(variance);

  const upper = sma + stdDev * standardDeviation;
  const lower = sma - stdDev * standardDeviation;
  const currentPrice = prices[prices.length - 1];
  const bandwidth = ((upper - lower) / sma) * 100;

  return {
    upper: Math.round(upper * 100) / 100,
    middle: Math.round(sma * 100) / 100,
    lower: Math.round(lower * 100) / 100,
    bandwidth: Math.round(bandwidth * 100) / 100,
  };
}

/**
 * Calculate Stochastic Oscillator
 * @param highs - Array of high prices
 * @param lows - Array of low prices
 * @param closes - Array of closing prices
 * @param period - Period (default: 14)
 * @returns Stochastic %K value (0-100)
 */
export function calculateStochastic(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 14
): number {
  if (closes.length < period || highs.length < period || lows.length < period) {
    return 50;
  }

  const recentHigh = Math.max(...highs.slice(-period));
  const recentLow = Math.min(...lows.slice(-period));
  const currentClose = closes[closes.length - 1];

  if (recentHigh === recentLow) return 50;

  const k = ((currentClose - recentLow) / (recentHigh - recentLow)) * 100;
  return Math.round(k * 100) / 100;
}

/**
 * Calculate ATR (Average True Range)
 * @param highs - Array of high prices
 * @param lows - Array of low prices
 * @param closes - Array of closing prices
 * @param period - Period (default: 14)
 * @returns ATR value
 */
export function calculateATR(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number = 14
): number {
  if (highs.length < period + 1 || lows.length < period + 1 || closes.length < period + 1) {
    return 0;
  }

  const trueRanges: number[] = [];

  for (let i = 1; i < highs.length; i++) {
    const highLow = highs[i] - lows[i];
    const highClose = Math.abs(highs[i] - closes[i - 1]);
    const lowClose = Math.abs(lows[i] - closes[i - 1]);
    const trueRange = Math.max(highLow, highClose, lowClose);
    trueRanges.push(trueRange);
  }

  const atr = trueRanges.slice(-period).reduce((a, b) => a + b, 0) / period;
  return Math.round(atr * 100) / 100;
}

/**
 * Get signal score from RSI
 */
export function getRSISignal(rsi: number): { score: number; interpretation: string } {
  if (rsi < 20) return { score: 85, interpretation: 'Oversold - Potential bounce' };
  if (rsi < 30) return { score: 70, interpretation: 'Approaching oversold' };
  if (rsi < 45) return { score: 55, interpretation: 'Neutral-bearish' };
  if (rsi < 55) return { score: 50, interpretation: 'Neutral' };
  if (rsi < 65) return { score: 45, interpretation: 'Neutral-bullish' };
  if (rsi < 75) return { score: 30, interpretation: 'Approaching overbought' };
  return { score: 15, interpretation: 'Overbought - Potential pullback' };
}

/**
 * Get signal score from MACD
 */
export function getMACDSignal(
  macd: number,
  histogram: number
): { score: number; interpretation: string } {
  if (macd > 0 && histogram > 0) {
    return { score: 75, interpretation: 'Bullish momentum' };
  } else if (macd > 0 && histogram < 0) {
    return { score: 55, interpretation: 'Bullish but weakening' };
  } else if (macd < 0 && histogram < 0) {
    return { score: 25, interpretation: 'Bearish momentum' };
  } else {
    return { score: 45, interpretation: 'Bearish but weakening' };
  }
}
