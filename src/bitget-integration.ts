/**
 * Bitget Agent Hub Integration
 *
 * NOTE: the Skill Hub analysis methods that previously lived here returned
 * hardcoded placeholder strings ("Full integration requires MCP server setup")
 * and presented them as analysis. Those have been removed: fabricated analysis
 * is worse than none.
 *
 * Price data now comes from `market-data.ts`, which fails over between
 * CoinGecko/Binance/Bitget. Bitget is still one of the attempted sources there.
 *
 * What remains here is the genuine Bitget capability: authenticated account and
 * order access via the `bgc` CLI, plus local currency conversion. Every method
 * that returns data performs a real call; nothing is simulated.
 *
 * @see https://github.com/Bitget-AI/agent_hub
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { marketData, type Ticker } from './market-data.js';

const execAsync = promisify(exec);

/** Ticker shape returned by the shared market-data provider. */
export type BitgetTicker = Ticker;

export interface BitgetMarketData {
  timestamp: number;
  tickers: Record<string, Ticker>;
  source: string;
  isLive: boolean;
}

/**
 * Bitget account/order integration.
 *
 * Requires the `bgc` CLI and Bitget API credentials for any account action.
 * Market-data reads are NOT handled here — use `market-data.ts`.
 */
export class BitgetIntegration {
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private cacheTTL = 30_000;

  /**
   * Get ticker data for a symbol from the shared live provider.
   * Throws when every live source is unavailable rather than faking a price.
   */
  async getTicker(symbol: string): Promise<Ticker> {
    return marketData.getTicker(symbol);
  }

  /**
   * Get multiple tickers. Rejects only if the whole snapshot fails.
   */
  async getTickers(symbols: string[]): Promise<Record<string, Ticker>> {
    const snap = await marketData.getSnapshot(symbols);
    return snap.tickers;
  }

  /**
   * Market overview for the major pairs.
   */
  async getMarketOverview(): Promise<BitgetMarketData> {
    const snap = await marketData.getSnapshot([
      'BTCUSDT',
      'ETHUSDT',
      'SOLUSDT',
      'XRPUSDT',
      'BNBUSDT',
    ]);

    return {
      timestamp: snap.fetchedAt,
      tickers: snap.tickers,
      source: snap.source,
      isLive: snap.isLive,
    };
  }

  /**
   * Get account assets. Requires Bitget API credentials via the bgc CLI.
   */
  async getAccountAssets(): Promise<any> {
    try {
      const { stdout } = await execAsync('bgc account get_account_assets');
      return JSON.parse(stdout);
    } catch (error: any) {
      throw new Error(
        `Bitget account query failed (requires bgc CLI + API credentials): ${error.message}`
      );
    }
  }

  /**
   * Place a spot order. Requires Bitget API credentials via the bgc CLI.
   */
  async placeOrder(params: {
    symbol: string;
    side: 'buy' | 'sell';
    orderType: 'limit' | 'market';
    price?: string;
    size: string;
  }): Promise<any> {
    const orderJson = JSON.stringify([
      {
        symbol: params.symbol,
        side: params.side,
        orderType: params.orderType,
        price: params.price,
        size: params.size,
      },
    ]);

    try {
      const { stdout } = await execAsync(`bgc spot spot_place_order --orders '${orderJson}'`);
      return JSON.parse(stdout);
    } catch (error: any) {
      throw new Error(`Bitget order placement failed: ${error.message}`);
    }
  }

  /**
   * Check whether the bgc CLI is installed and callable.
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
   * Installation and configuration instructions.
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

/** Singleton instance. */
export const bitget = new BitgetIntegration();
