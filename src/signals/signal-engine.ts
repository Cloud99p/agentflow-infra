/**
 * Multi-Signal Scoring Engine
 * 
 * Inspired by DCA Claw's 17-signal engine
 * @see https://github.com/Argeneau12e/DCA_claw
 * @author Samuel Oduntan (@Argeneau12e) - Original concept
 * @author Cloud99p - AgentFlow implementation
 */

import { bitget } from '../bitget-integration';

export interface Signal {
  name: string;
  score: number; // 0-100
  weight: number; // 0-1
  rationale: string;
  timestamp: number;
  data?: any;
}

export interface SignalResult {
  symbol: string;
  totalScore: number;
  weightedScore: number;
  recommendation: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL';
  confidence: number;
  signals: Signal[];
  timestamp: number;
}

export interface SignalEngineConfig {
  weights?: Record<string, number>;
  minSignals?: number;
  bitgetEnabled?: boolean;
}

export class SignalEngine {
  private config: SignalEngineConfig;
  private defaultWeights: Record<string, number> = {
    momentum: 0.15,
    volume: 0.10,
    volatility: 0.10,
    trend: 0.15,
    supportResistance: 0.10,
    fundingRate: 0.08,
    openInterest: 0.07,
    sentiment: 0.10,
    marketRegime: 0.10,
    risk: 0.05,
  };

  constructor(config: SignalEngineConfig = {}) {
    this.config = {
      weights: this.defaultWeights,
      minSignals: 5,
      bitgetEnabled: true,
      ...config,
    };
  }

  /**
   * Scan a symbol and return composite signal score
   */
  async scan(symbol: string): Promise<SignalResult> {
    console.log(`[SIGNAL_ENGINE] Scanning ${symbol}...`);

    const signals: Signal[] = [];

    // Run all signals in parallel
    const signalPromises = [
      this.momentumSignal(symbol),
      this.volumeSignal(symbol),
      this.volatilitySignal(symbol),
      this.trendSignal(symbol),
      this.supportResistanceSignal(symbol),
      this.fundingRateSignal(symbol),
      this.openInterestSignal(symbol),
      this.sentimentSignal(symbol),
      this.marketRegimeSignal(symbol),
      this.riskSignal(symbol),
    ];

    const results = await Promise.allSettled(signalPromises);

    // Collect successful signals
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        signals.push(result.value);
      } else {
        console.error(`[SIGNAL_ENGINE] Signal ${index} failed:`, result.reason);
      }
    });

    // Calculate weighted score
    const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0);
    const weightedScore =
      signals.reduce((sum, s) => sum + s.score * s.weight, 0) / totalWeight;

    // Determine recommendation
    const recommendation = this.getRecommendation(weightedScore);
    const confidence = this.calculateConfidence(signals);

    return {
      symbol,
      totalScore: weightedScore,
      weightedScore,
      recommendation,
      confidence,
      signals,
      timestamp: Date.now(),
    };
  }

  /**
   * Momentum Signal (15% weight)
   * Measures price momentum across multiple timeframes
   */
  private async momentumSignal(symbol: string): Promise<Signal> {
    try {
      const ticker = await bitget.getTicker(symbol);
      const price = parseFloat(ticker.lastPr);
      const change24h = parseFloat(ticker.change24h);

      // Simple momentum scoring
      let score = 50;
      if (change24h > 5) score = 80;
      else if (change24h > 2) score = 65;
      else if (change24h > 0) score = 55;
      else if (change24h > -2) score = 45;
      else if (change24h > -5) score = 35;
      else score = 20;

      return {
        name: 'Momentum',
        score,
        weight: this.config.weights!.momentum || 0.15,
        rationale: `24h change: ${change24h.toFixed(2)}%, price: $${price.toLocaleString()}`,
        timestamp: Date.now(),
        data: { price, change24h },
      };
    } catch (error) {
      throw new Error(`Momentum signal failed: ${error}`);
    }
  }

  /**
   * Volume Signal (10% weight)
   * Analyzes volume patterns and anomalies
   */
  private async volumeSignal(symbol: string): Promise<Signal> {
    try {
      const ticker = await bitget.getTicker(symbol);
      const volume24h = parseFloat(ticker.vol24h);
      const usdtVolume = parseFloat(ticker.usdt24h);

      // Volume scoring (simplified - would need historical data for proper analysis)
      const score = usdtVolume > 100_000_000 ? 75 : usdtVolume > 10_000_000 ? 60 : 50;

      return {
        name: 'Volume',
        score,
        weight: this.config.weights!.volume || 0.10,
        rationale: `24h volume: $${(usdtVolume / 1_000_000).toFixed(2)}M`,
        timestamp: Date.now(),
        data: { volume24h, usdtVolume },
      };
    } catch (error) {
      throw new Error(`Volume signal failed: ${error}`);
    }
  }

  /**
   * Volatility Signal (10% weight)
   * ATR-based volatility scoring
   */
  private async volatilitySignal(symbol: string): Promise<Signal> {
    try {
      const ticker = await bitget.getTicker(symbol);
      const high24h = parseFloat(ticker.high24h);
      const low24h = parseFloat(ticker.low24h);
      const volatility = ((high24h - low24h) / low24h) * 100;

      // Moderate volatility is good for DCA (not too choppy, not too flat)
      let score = 50;
      if (volatility > 3 && volatility < 10) score = 75;
      else if (volatility >= 10 && volatility < 15) score = 60;
      else if (volatility < 3) score = 40;
      else score = 30; // Too volatile

      return {
        name: 'Volatility',
        score,
        weight: this.config.weights!.volatility || 0.10,
        rationale: `24h volatility: ${volatility.toFixed(2)}% (range: $${low24h.toLocaleString()} - $${high24h.toLocaleString()})`,
        timestamp: Date.now(),
        data: { high24h, low24h, volatility },
      };
    } catch (error) {
      throw new Error(`Volatility signal failed: ${error}`);
    }
  }

  /**
   * Trend Signal (15% weight)
   * Multi-timeframe trend detection
   */
  private async trendSignal(symbol: string): Promise<Signal> {
    try {
      const ticker = await bitget.getTicker(symbol);
      const change24h = parseFloat(ticker.change24h);

      // Simplified trend (would need historical data for proper MA analysis)
      let score = 50;
      if (change24h > 3) score = 80;
      else if (change24h > 0) score = 60;
      else if (change24h > -3) score = 40;
      else score = 20;

      return {
        name: 'Trend',
        score,
        weight: this.config.weights!.trend || 0.15,
        rationale: `Short-term trend: ${change24h > 0 ? 'BULLISH' : 'BEARISH'} (${change24h.toFixed(2)}%)`,
        timestamp: Date.now(),
        data: { change24h },
      };
    } catch (error) {
      throw new Error(`Trend signal failed: ${error}`);
    }
  }

  /**
   * Support/Resistance Signal (10% weight)
   * Key S/R level analysis
   */
  private async supportResistanceSignal(symbol: string): Promise<Signal> {
    try {
      const ticker = await bitget.getTicker(symbol);
      const price = parseFloat(ticker.lastPr);
      const high24h = parseFloat(ticker.high24h);
      const low24h = parseFloat(ticker.low24h);

      // Position within 24h range
      const rangePosition = (price - low24h) / (high24h - low24h) * 100;

      // Near low = good buy opportunity
      const score = 100 - rangePosition;

      return {
        name: 'Support/Resistance',
        score,
        weight: this.config.weights!.supportResistance || 0.10,
        rationale: `Price position in 24h range: ${rangePosition.toFixed(1)}% (${rangePosition > 50 ? 'near resistance' : 'near support'})`,
        timestamp: Date.now(),
        data: { price, high24h, low24h, rangePosition },
      };
    } catch (error) {
      throw new Error(`Support/Resistance signal failed: ${error}`);
    }
  }

  /**
   * Funding Rate Signal (8% weight)
   * Perpetual funding analysis
   */
  private async fundingRateSignal(symbol: string): Promise<Signal> {
    // Simplified - would need actual funding rate data
    return {
      name: 'Funding Rate',
      score: 50,
      weight: this.config.weights!.fundingRate || 0.08,
      rationale: 'Funding rate data not available (requires futures API)',
      timestamp: Date.now(),
      data: null,
    };
  }

  /**
   * Open Interest Signal (7% weight)
   * OI changes analysis
   */
  private async openInterestSignal(symbol: string): Promise<Signal> {
    // Simplified - would need actual OI data
    return {
      name: 'Open Interest',
      score: 50,
      weight: this.config.weights!.openInterest || 0.07,
      rationale: 'Open interest data not available (requires derivatives API)',
      timestamp: Date.now(),
      data: null,
    };
  }

  /**
   * Sentiment Signal (10% weight)
   * Social sentiment via Bitget Skill Hub
   */
  private async sentimentSignal(symbol: string): Promise<Signal> {
    try {
      if (!this.config.bitgetEnabled) {
        return {
          name: 'Sentiment',
          score: 50,
          weight: this.config.weights!.sentiment || 0.10,
          rationale: 'Bitget integration disabled',
          timestamp: Date.now(),
        };
      }

      const sentiment = await bitget.runSkillAnalysis('sentiment-analyst', symbol);

      return {
        name: 'Sentiment (Bitget)',
        score: sentiment.confidence * 100,
        weight: this.config.weights!.sentiment || 0.10,
        rationale: sentiment.analysis,
        timestamp: Date.now(),
        data: { confidence: sentiment.confidence },
      };
    } catch (error) {
      return {
        name: 'Sentiment',
        score: 50,
        weight: this.config.weights!.sentiment || 0.10,
        rationale: `Sentiment analysis failed: ${error}`,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Market Regime Signal (10% weight)
   * Bull/bear/sideways detection
   */
  private async marketRegimeSignal(symbol: string): Promise<Signal> {
    try {
      const ticker = await bitget.getTicker(symbol);
      const change24h = parseFloat(ticker.change24h);

      // Simplified regime detection
      let regime: string;
      let score: number;

      if (change24h > 5) {
        regime = 'BULL';
        score = 85;
      } else if (change24h > 2) {
        regime = 'BULL';
        score = 70;
      } else if (change24h > -2) {
        regime = 'SIDEWAYS';
        score = 50;
      } else if (change24h > -5) {
        regime = 'BEAR';
        score = 30;
      } else {
        regime = 'BEAR';
        score = 15;
      }

      return {
        name: 'Market Regime',
        score,
        weight: this.config.weights!.marketRegime || 0.10,
        rationale: `Market regime: ${regime} (${change24h.toFixed(2)}%)`,
        timestamp: Date.now(),
        data: { regime, change24h },
      };
    } catch (error) {
      throw new Error(`Market regime signal failed: ${error}`);
    }
  }

  /**
   * Risk Signal (5% weight)
   * Overall risk assessment
   */
  private async riskSignal(symbol: string): Promise<Signal> {
    try {
      const ticker = await bitget.getTicker(symbol);
      const volatility = ((parseFloat(ticker.high24h) - parseFloat(ticker.low24h)) / parseFloat(ticker.low24h)) * 100;

      // Lower risk = higher score
      const score = Math.max(0, 100 - volatility * 5);

      return {
        name: 'Risk Assessment',
        score,
        weight: this.config.weights!.risk || 0.05,
        rationale: `Risk level: ${score > 70 ? 'LOW' : score > 40 ? 'MEDIUM' : 'HIGH'} (volatility: ${volatility.toFixed(2)}%)`,
        timestamp: Date.now(),
        data: { volatility, riskLevel: score > 70 ? 'LOW' : score > 40 ? 'MEDIUM' : 'HIGH' },
      };
    } catch (error) {
      throw new Error(`Risk signal failed: ${error}`);
    }
  }

  /**
   * Get recommendation from score
   */
  private getRecommendation(score: number): SignalResult['recommendation'] {
    if (score >= 80) return 'STRONG_BUY';
    if (score >= 60) return 'BUY';
    if (score >= 40) return 'HOLD';
    if (score >= 20) return 'SELL';
    return 'STRONG_SELL';
  }

  /**
   * Calculate confidence based on signal agreement
   */
  private calculateConfidence(signals: Signal[]): number {
    if (signals.length < this.config.minSignals!) {
      return 0.3;
    }

    const scores = signals.map((s) => s.score);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((sum, s) => sum + Math.pow(s - avg, 2), 0) / scores.length;
    const stdDev = Math.sqrt(variance);

    // Lower stdDev = higher agreement = higher confidence
    const baseConfidence = Math.min(1, signals.length / 10);
    const agreementFactor = Math.max(0.5, 1 - stdDev / 50);

    return Math.round(baseConfidence * agreementFactor * 100) / 100;
  }
}
