/**
 * Bitget Agent Hub Integration
 * 
 * Integrates Bitget's MCP server and Skill Hub for market data and analysis
 * https://github.com/Bitget-AI/agent_hub
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface BitgetTicker {
  symbol: string;
  lastPr: string;
  high24h: string;
  low24h: string;
  change24h: string;
  vol24h: string;
  usdt24h: string;
}

export interface BitgetMarketData {
  timestamp: number;
  tickers: Record<string, BitgetTicker>;
}

export interface BitgetAnalysis {
  skill: string;
  analysis: string;
  confidence: number;
  timestamp: number;
}

/**
 * Bitget Agent Hub Integration
 * 
 * Uses bgc CLI tool for market data access
 * No API key required for public market data
 */
export class BitgetIntegration {
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private cacheTTL: number = 30000; // 30 seconds

  /**
   * Get ticker data for a symbol
   * Uses public API directly (no bgc CLI required for market data)
   */
  async getTicker(symbol: string): Promise<BitgetTicker> {
    const cacheKey = `ticker:${symbol}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data as BitgetTicker;
    }

    // Use public API directly (no authentication needed)
    const data = await this.fetchFromPublicAPI(symbol);
    if (data) {
      this.cache.set(cacheKey, { data, timestamp: Date.now() });
      return data;
    }
    
    throw new Error('Failed to fetch ticker data from Bitget');
  }

  /**
   * Get multiple tickers
   */
  async getTickers(symbols: string[]): Promise<Record<string, BitgetTicker>> {
    const results: Record<string, BitgetTicker> = {};
    
    await Promise.all(
      symbols.map(async (symbol) => {
        try {
          results[symbol] = await this.getTicker(symbol);
        } catch (error) {
          console.error(`[BITGET] Failed to fetch ${symbol}:`, error);
        }
      })
    );

    return results;
  }

  /**
   * Get market overview for major tokens
   */
  async getMarketOverview(): Promise<BitgetMarketData> {
    const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'BNBUSDT'];
    const tickers = await this.getTickers(symbols);

    return {
      timestamp: Date.now(),
      tickers,
    };
  }

  /**
   * Run Bitget Skill Hub analysis
   * Skills: macro-analyst, market-intel, news-briefing, sentiment-analyst, technical-analysis
   */
  async runSkillAnalysis(
    skill: 'macro-analyst' | 'market-intel' | 'sentiment-analyst' | 'technical-analysis',
    symbol: string
  ): Promise<BitgetAnalysis> {
    const cacheKey = `skill:${skill}:${symbol}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTTL * 10) {
      return cached.data as BitgetAnalysis;
    }

    try {
      // Skill Hub uses natural language prompts
      // This is a simplified integration - full implementation would use MCP server
      const prompt = this.buildSkillPrompt(skill, symbol);
      
      // In production, this would call the MCP server or bgc skill command
      // For now, we simulate the integration structure
      const analysis: BitgetAnalysis = {
        skill,
        analysis: `[${skill}] Analysis for ${symbol} - Full integration requires MCP server setup`,
        confidence: 0.75,
        timestamp: Date.now(),
      };

      this.cache.set(cacheKey, { data: analysis, timestamp: Date.now() });
      return analysis;
    } catch (error) {
      console.error('[BITGET] Skill analysis failed:', error);
      throw error;
    }
  }

  /**
   * Build skill-specific prompts for Bitget Skill Hub
   */
  private buildSkillPrompt(skill: string, symbol: string): string {
    const prompts: Record<string, string> = {
      'macro-analyst': `Analyze macro conditions affecting ${symbol}: Fed policy, yield curve, BTC vs DXY/Nasdaq/Gold correlation`,
      'market-intel': `Provide on-chain and institutional intelligence for ${symbol}: ETF flows, whale activity, DeFi TVL`,
      'sentiment-analyst': `Analyze sentiment for ${symbol}: Fear & Greed Index, long/short ratios, funding rates`,
      'technical-analysis': `Technical analysis for ${symbol}: 23 indicators across Trend, Volatility, Oscillator, Volume, Momentum, S/R`,
    };

    return prompts[skill] || '';
  }

  /**
   * Get account assets (requires API key)
   */
  async getAccountAssets(): Promise<any> {
    try {
      const { stdout } = await execAsync('bgc account get_account_assets');
      return JSON.parse(stdout);
    } catch (error) {
      console.error('[BITGET] Account query failed (API key required):', error);
      throw new Error('Bitget API key required for account operations');
    }
  }

  /**
   * Place spot order (requires API key)
   */
  async placeOrder(params: {
    symbol: string;
    side: 'buy' | 'sell';
    orderType: 'limit' | 'market';
    price?: string;
    size: string;
  }): Promise<any> {
    const orderJson = JSON.stringify([{
      symbol: params.symbol,
      side: params.side,
      orderType: params.orderType,
      price: params.price,
      size: params.size,
    }]);

    try {
      const { stdout } = await execAsync(
        `bgc spot spot_place_order --orders '${orderJson}'`
      );
      return JSON.parse(stdout);
    } catch (error) {
      console.error('[BITGET] Order placement failed:', error);
      throw error;
    }
  }

  /**
   * Check if bgc CLI is installed
   */
  async isInstalled(): Promise<boolean> {
    try {
      await execAsync('bgc --version');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Fetch from Bitget public API (no authentication required)
   */
  private async fetchFromPublicAPI(symbol: string): Promise<BitgetTicker | null> {
    try {
      const response = await fetch(`https://api.bitget.com/api/spot/v1/market/ticker?symbol=${symbol}`);
      const result = await response.json();
      
      if (result.code === '00000' && result.data) {
        const data = result.data;
        return {
          symbol: symbol,
          lastPr: String(data.close || data.lastPr || data.last || '0'),
          high24h: String(data.high24h || data.high || '0'),
          low24h: String(data.low24h || data.low || '0'),
          change24h: String(data.chg24h || data.change24h || data.change || '0'),
          vol24h: String(data.vol || data.vol24h || '0'),
          usdt24h: String(data.quoteVol || data.usdt24h || data.amount || '0'),
        };
      }
      
      console.error('[BITGET] API error:', result);
      return null;
    } catch (error) {
      console.error('[BITGET] Fetch failed:', error.message);
      return null;
    }
  }

  /**
   * Get installation instructions
   */
  getInstallationInstructions(): string {
    return `
# Install Bitget Agent Hub packages
npx bitget-hub upgrade-all --target claude

# Or install individual packages
npm install -g bitget-client
npm install -g bitget-skill-hub

# Configure API keys (required for trading, optional for market data)
export BITGET_API_KEY="your-api-key"
export BITGET_SECRET_KEY="your-secret-key"
export BITGET_PASSPHRASE="your-passphrase"

# Test market data (no API key needed)
bgc spot spot_get_ticker --symbol BTCUSDT
`.trim();
  }
}

// Singleton instance
export const bitget = new BitgetIntegration();
