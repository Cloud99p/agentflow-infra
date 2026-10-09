/**
 * Real Market Data Provider
 *
 * Multi-source price/candle provider with explicit failover and honest
 * provenance reporting. Bitget was the original source but is not reachable
 * from all regions (DNS does not resolve for api.bitget.com from some ISPs),
 * so CoinGecko and Binance are used as primary/secondary.
 *
 * Every ticker carries `source` and `isLive` so callers can tell real data
 * from simulated data. Simulated data is NEVER returned silently.
 */

export type TickerSource = 'coingecko' | 'binance' | 'bitget' | 'simulated';

export interface Ticker {
  symbol: string;
  lastPr: string;
  high24h: string;
  low24h: string;
  change24h: string; // fraction, e.g. 0.0082 = +0.82%
  vol24h: string;
  usdt24h: string;
  priceChange24h: string; // absolute change in quote currency
  timestamp: number;
  source: TickerSource;
  isLive: boolean;
}

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface CoinGeckoMarket {
  id: string;
  current_price: number;
  high_24h: number;
  low_24h: number;
  total_volume: number;
  price_change_24h: number;
  price_change_percentage_24h: number;
}

const COINGECKO_IDS: Record<string, string> = {
  BTCUSDT: 'bitcoin',
  ETHUSDT: 'ethereum',
  SOLUSDT: 'solana',
  XRPUSDT: 'ripple',
};

const SUPPORTED_SYMBOLS = Object.keys(COINGECKO_IDS);

type LiveSource = Exclude<TickerSource, 'simulated'>;

/** Default source priority order. Bitget last because it is often unreachable. */
const DEFAULT_SOURCE_ORDER: LiveSource[] = ['coingecko', 'binance', 'bitget'];

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Fetch with an abort-based timeout. Node 18+ global fetch has no timeout option.
 */
async function fetchWithTimeout(url: string, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * CoinGecko batch fetch. One request covers all symbols, so this is the
 * cheapest source and the primary.
 */
async function fetchCoinGecko(symbols: string[]): Promise<Record<string, Ticker> | null> {
  const ids = symbols.map((s) => COINGECKO_IDS[s]).filter(Boolean);
  if (ids.length === 0) return null;

  const url =
    `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd` +
    `&ids=${ids.join(',')}&price_change_percentage=24h`;

  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);

  const rows = (await res.json()) as CoinGeckoMarket[];
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('CoinGecko returned no rows');

  const byId = new Map(rows.map((r) => [r.id, r]));
  const out: Record<string, Ticker> = {};
  const now = Date.now();

  for (const symbol of symbols) {
    const row = byId.get(COINGECKO_IDS[symbol]);
    if (!row || !row.current_price) continue;

    // CoinGecko reports 24h change as an absolute amount and a percentage.
    // Prefer the absolute amount when present so high/low stay consistent.
    const absChange = row.price_change_24h ?? 0;
    const pct = (row.price_change_percentage_24h ?? 0) / 100;

    out[symbol] = {
      symbol,
      lastPr: String(row.current_price),
      high24h: String(row.high_24h ?? row.current_price),
      low24h: String(row.low_24h ?? row.current_price),
      change24h: String(pct),
      vol24h: String(row.total_volume ?? 0),
      usdt24h: String(row.total_volume ?? 0),
      priceChange24h: String(absChange),
      timestamp: now,
      source: 'coingecko',
      isLive: true,
    };
  }

  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Binance 24hr ticker. Per-symbol requests, run in parallel.
 */
async function fetchBinanceTicker(symbol: string): Promise<Ticker | null> {
  const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Binance HTTP ${res.status}`);

  const d: any = await res.json();
  if (!d || !d.lastPrice) return null;

  return {
    symbol,
    lastPr: String(d.lastPrice),
    high24h: String(d.highPrice),
    low24h: String(d.lowPrice),
    change24h: String(parseFloat(d.priceChangePercent) / 100),
    vol24h: String(d.volume),
    usdt24h: String(d.quoteVolume),
    priceChange24h: String(d.priceChange),
    timestamp: Date.now(),
    source: 'binance',
    isLive: true,
  };
}

async function fetchBinance(symbols: string[]): Promise<Record<string, Ticker> | null> {
  const settled = await Promise.allSettled(symbols.map((s) => fetchBinanceTicker(s)));
  const out: Record<string, Ticker> = {};

  settled.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value) {
      out[symbols[i]] = r.value;
    } else if (r.status === 'rejected') {
      console.warn(`[MARKET] Binance ${symbols[i]} failed: ${r.reason?.message ?? r.reason}`);
    }
  });

  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Bitget V2 ticker. Kept for completeness/regions where it resolves.
 */
async function fetchBitgetTicker(symbol: string): Promise<Ticker | null> {
  const url = `https://api.bitget.com/api/v2/spot/market/tickers?symbol=${symbol}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Bitget HTTP ${res.status}`);

  const result: any = await res.json();
  if (result.code !== '00000' || !result.data) return null;

  const d = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!d) return null;

  const last = parseFloat(d.close || d.lastPr || d.last || '0');
  const open = parseFloat(d.open || d.openPrice || '0');
  const absChange = open > 0 ? last - open : 0;
  const pct = open > 0 ? absChange / open : 0;

  return {
    symbol,
    lastPr: String(last),
    high24h: String(d.high24h || d.high || '0'),
    low24h: String(d.low24h || d.low || '0'),
    change24h: String(pct),
    vol24h: String(d.vol || d.baseVolume || '0'),
    usdt24h: String(d.quoteVol || d.usdtVolume || d.turnover || '0'),
    priceChange24h: String(absChange),
    timestamp: Date.now(),
    source: 'bitget',
    isLive: true,
  };
}

async function fetchBitget(symbols: string[]): Promise<Record<string, Ticker> | null> {
  const settled = await Promise.allSettled(symbols.map((s) => fetchBitgetTicker(s)));
  const out: Record<string, Ticker> = {};

  settled.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value) {
      out[symbols[i]] = r.value;
    }
  });

  return Object.keys(out).length > 0 ? out : null;
}

type Fetcher = (symbols: string[]) => Promise<Record<string, Ticker> | null>;

const FETCHERS: Record<LiveSource, Fetcher> = {
  coingecko: fetchCoinGecko,
  binance: fetchBinance,
  bitget: fetchBitget,
};

export interface MarketDataProviderOptions {
  /** Source priority. Defaults to coingecko -> binance -> bitget. */
  sourceOrder?: LiveSource[];
  /** Cache TTL in ms. Defaults to 15s. */
  cacheTtlMs?: number;
  /** Allow simulated data when every live source fails. Defaults to false. */
  allowSimulated?: boolean;
}

export interface MarketSnapshot {
  tickers: Record<string, Ticker>;
  source: TickerSource;
  isLive: boolean;
  cached: boolean;
  errors: string[];
  fetchedAt: number;
}

/**
 * Real market data provider with failover across multiple exchanges.
 *
 * Usage:
 *   const provider = new MarketDataProvider();
 *   const snap = await provider.getSnapshot(['BTCUSDT', 'ETHUSDT']);
 *   if (!snap.isLive) { ...show warning, do not present as real... }
 */
export class MarketDataProvider {
  private cache: MarketSnapshot | null = null;
  private readonly sourceOrder: LiveSource[];
  private readonly cacheTtlMs: number;
  private readonly allowSimulated: boolean;

  constructor(options: MarketDataProviderOptions = {}) {
    this.sourceOrder = options.sourceOrder ?? DEFAULT_SOURCE_ORDER;
    this.cacheTtlMs = options.cacheTtlMs ?? 15_000;
    this.allowSimulated = options.allowSimulated ?? false;
  }

  static getSupportedSymbols(): string[] {
    return [...SUPPORTED_SYMBOLS];
  }

  /**
   * Get a market snapshot, walking the source list until one succeeds.
   * Never silently downgrades: if simulated data is used, `isLive` is false.
   */
  async getSnapshot(
    symbols: string[] = SUPPORTED_SYMBOLS,
    opts: { forceRefresh?: boolean } = {}
  ): Promise<MarketSnapshot> {
    if (
      !opts.forceRefresh &&
      this.cache &&
      Date.now() - this.cache.fetchedAt < this.cacheTtlMs &&
      symbols.every((s) => this.cache!.tickers[s])
    ) {
      return { ...this.cache, cached: true };
    }

    const errors: string[] = [];

    for (const source of this.sourceOrder) {
      const fetcher = FETCHERS[source];
      if (!fetcher) continue;

      try {
        const tickers = await fetcher(symbols);
        if (tickers && Object.keys(tickers).length > 0) {
          const snapshot: MarketSnapshot = {
            tickers,
            source,
            isLive: true,
            cached: false,
            errors,
            fetchedAt: Date.now(),
          };
          this.cache = snapshot;
          console.log(
            `[MARKET] Live data from ${source} for ${Object.keys(tickers).join(', ')}`
          );
          return snapshot;
        }
        errors.push(`${source}: returned no data`);
      } catch (err: any) {
        const msg = `${source}: ${err?.message ?? err}`;
        errors.push(msg);
        console.warn(`[MARKET] Source failed -> ${msg}`);
      }
    }

    // Every live source failed.
    if (this.allowSimulated) {
      console.warn('[MARKET] All live sources failed. Falling back to SIMULATED data.');
      return {
        tickers: buildSimulatedTickers(symbols),
        source: 'simulated',
        isLive: false,
        cached: false,
        errors,
        fetchedAt: Date.now(),
      };
    }

    throw new Error(
      `All live market data sources failed. Not substituting simulated data.\n` +
        errors.map((e) => `  - ${e}`).join('\n')
    );
  }

  /**
   * Get a single ticker.
   */
  async getTicker(symbol: string): Promise<Ticker> {
    const snap = await this.getSnapshot([symbol]);
    const ticker = snap.tickers[symbol];
    if (!ticker) throw new Error(`No ticker returned for ${symbol}`);
    return ticker;
  }

  /**
   * Fetch real OHLCV candles. Used for genuine RSI/MACD and backtesting.
   * Binance is the candle source (CoinGecko's free tier has no OHLC).
   */
  async getCandles(
    symbol: string,
    interval: '1m' | '5m' | '15m' | '1h' | '4h' | '1d' = '1d',
    limit = 200
  ): Promise<Candle[]> {
    const url =
      `https://api.binance.com/api/v3/klines?symbol=${symbol}` +
      `&interval=${interval}&limit=${Math.min(limit, 1000)}`;

    const res = await fetchWithTimeout(url, 15_000);
    if (!res.ok) throw new Error(`Binance klines HTTP ${res.status}`);

    const rows = (await res.json()) as any[];
    if (!Array.isArray(rows)) throw new Error('Binance klines returned non-array');

    return rows.map((r) => ({
      timestamp: Number(r[0]),
      open: parseFloat(r[1]),
      high: parseFloat(r[2]),
      low: parseFloat(r[3]),
      close: parseFloat(r[4]),
      volume: parseFloat(r[5]),
    }));
  }
}

/**
 * Deterministic-shape simulated tickers. Only used when explicitly allowed.
 * Always flagged `isLive: false` so no caller can mistake them for real.
 */
function buildSimulatedTickers(symbols: string[]): Record<string, Ticker> {
  const anchors: Record<string, number> = {
    BTCUSDT: 64000,
    ETHUSDT: 1725,
    SOLUSDT: 138,
    XRPUSDT: 0.52,
  };
  const out: Record<string, Ticker> = {};
  const now = Date.now();

  for (const symbol of symbols) {
    const anchor = anchors[symbol] ?? 100;
    const last = anchor * (1 + (Math.random() - 0.5) * 0.001);
    out[symbol] = {
      symbol,
      lastPr: String(last),
      high24h: String(anchor * 1.008),
      low24h: String(anchor * 0.992),
      change24h: '0',
      vol24h: '0',
      usdt24h: '0',
      priceChange24h: '0',
      timestamp: now,
      source: 'simulated',
      isLive: false,
    };
  }

  return out;
}

/** Shared default provider instance. */
export const marketData = new MarketDataProvider();
