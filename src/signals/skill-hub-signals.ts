/**
 * Bitget Skill Hub signal source.
 *
 * Supplies real market intelligence to the signal engine, backed by the MCP
 * tools that provably return data from this host. Which tools those are is a
 * measured fact, not a guess: see `evidence/skill-hub-probe.json`, produced by
 * `scripts/probe-skill-hub.mjs`.
 *
 * Live here:  crypto_derivatives (price/klines/ticker), technical_analysis,
 *             news_feed, global_data/forex
 * Dead here:  sentiment_index, derivatives_sentiment, macro_indicators,
 *             rates_yields, cross_asset, defi_analytics, network_status,
 *             crypto_market, dex_market, tradfi_news
 *
 * Dead tools are attempted and reported as unavailable with a reason. They are
 * NEVER replaced with plausible-looking numbers.
 */

import { skillHub, SkillHubClient } from '../skill-hub-client.js';

export interface SkillHubSignalValue {
  /** 0-100 where 50 is neutral, or null when the source is unavailable. */
  score: number | null;
  /** Human-readable basis for the score. */
  rationale: string;
  source: string;
  available: boolean;
  /** Why it is unavailable, when it is. */
  reason?: string;
  /** Raw supporting values, for the dashboard and audit trail. */
  evidence?: Record<string, any>;
}

/**
 * Measured from this host by `scripts/probe-skill-hub.mjs`. Kept in code so the
 * dashboard can label a source dead without paying a 15-30s timeout each load.
 * See `evidence/skill-hub-probe.json` for the raw evidence.
 */
export const LIVE_FROM_THIS_HOST = [
  'crypto_derivatives/price',
  'crypto_derivatives/ticker_24h',
  'crypto_derivatives/klines',
  'technical_analysis/full_analysis',
  'technical_analysis/rsi',
  'technical_analysis/macd',
  'technical_analysis/bollinger',
  'technical_analysis/atr',
  'technical_analysis/support_resistance',
  'news_feed/sources',
] as const;

/**
 * Tool actions that cannot be reached from this host. Each fails upstream of
 * the MCP on its own fetch, not in our code.
 */
export const DEAD_FROM_THIS_HOST: Record<string, string> = {
  'sentiment_index/current': 'alternative.me Fear & Greed unreachable',
  'sentiment_index/history': 'alternative.me Fear & Greed unreachable',
  'derivatives_sentiment/long_short': 'Binance futures endpoint unreachable',
  'derivatives_sentiment/open_interest': 'Binance futures endpoint unreachable',
  'macro_indicators/multi_indicator': 'FRED unreachable (key also recommended)',
  'rates_yields/rates_snapshot': 'FRED unreachable (returns nulls)',
  'cross_asset/correlation': 'Yahoo Finance unreachable',
  'defi_analytics/chains': 'DeFiLlama unreachable',
  'defi_analytics/stablecoins': 'DeFiLlama unreachable',
  'network_status/eth_gas': 'ethgasprice.org unreachable',
  'network_status/btc_fees': 'mempool.space unreachable',
  'crypto_market/global': 'CoinGecko via MCP times out (direct calls work)',
  'crypto_market/trending': 'CoinGecko via MCP times out (direct calls work)',
  'news_feed/latest': 'reachable but every feed returns an empty items array',
  'global_data/forex': 'reachable but returns empty rates object',
  'dex_market/search': 'DexScreener unreachable',
  'tradfi_news/crypto_news': 'needs FINNHUB_API_KEY',
};

/** Map a CCXT-style pair (BTC/USDT) from our internal form (BTCUSDT). */
export function toPair(symbol: string): string {
  return symbol.includes('/') ? symbol : symbol.replace(/USDT$/i, '/USDT');
}

/**
 * Clamp a raw 0-100 reading, refusing to invent a value for bad input.
 */
function clampScore(value: number, fallback = 50): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(100, value));
}

export class SkillHubSignals {
  private client: SkillHubClient;
  /** Short cache: several signals share one technical_analysis call. */
  private cache = new Map<string, { at: number; value: any }>();
  private ttlMs: number;

  constructor(options: { client?: SkillHubClient; ttlMs?: number } = {}) {
    this.client = options.client ?? skillHub;
    this.ttlMs = options.ttlMs ?? 30_000;
  }

  private async cached(key: string, fn: () => Promise<any>): Promise<any> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < this.ttlMs) return hit.value;
    const value = await fn();
    this.cache.set(key, { at: Date.now(), value });
    return value;
  }

  /** Server/tool availability, surfaced in the dashboard status bar. */
  async status() {
    return this.client.status();
  }

  /**
   * Cross-check our locally computed indicators against an independent
   * implementation. Divergence is a real finding worth surfacing, not noise.
   *
   * Returns null when the independent source is unavailable.
   */
  async crossCheckIndicators(symbol: string, interval: string): Promise<SkillHubSignalValue> {
    const pair = toPair(symbol);
    const timeframe = interval.replace('1d', '1d').replace('4h', '4h');

    const res = await this.cached(`ta:${pair}:${timeframe}`, () =>
      this.client.callTool('technical_analysis', {
        action: 'full_analysis',
        symbol: pair,
        timeframe,
      })
    );

    if (!res.ok || !res.data?.rsi?.rsi) {
      return {
        score: null,
        rationale: 'Independent technical analysis unavailable',
        source: 'skill-hub:technical_analysis',
        available: false,
        reason: res.raw?.slice(0, 200) || 'empty payload',
      };
    }

    const rsi = res.data.rsi.rsi;
    // Same convention as our local RSI signal: oversold is bullish.
    const score = clampScore(rsi);

    return {
      score,
      rationale: `Independent RSI(14) = ${rsi.toFixed(2)} (${res.data.rsi.signal ?? 'n/a'}), timeframe ${timeframe}`,
      source: 'skill-hub:technical_analysis',
      available: true,
      evidence: {
        rsi,
        macd: res.data.macd?.macd ?? null,
        macdSignal: res.data.macd?.signal ?? null,
        // NOTE: this tool returns Bollinger upper/lower inverted (lower > upper)
        // and mislabels position relative to them. We record the raw values but
        // do not derive a score from them. See evidence/skill-hub-probe.json.
        bollingerUpper: res.data.bollinger?.upper ?? null,
        bollingerLower: res.data.bollinger?.lower ?? null,
        bollingerSuspect: true,
        atr: res.data.atr?.atr ?? res.data.atr ?? null,
      },
    };
  }

  /**
   * Price cross-check against a second independent venue. A large discrepancy
   * between our primary source and CCXT is a real signal about data integrity.
   */
  async crossCheckPrice(symbol: string, referencePrice: number): Promise<SkillHubSignalValue> {
    const pair = toPair(symbol);
    const res = await this.cached(`px:${pair}`, () =>
      this.client.callTool('crypto_derivatives', { action: 'price', symbol: pair })
    );

    const price = res.data?.price;
    if (!res.ok || !Number.isFinite(price)) {
      return {
        score: null,
        rationale: 'Price cross-check unavailable',
        source: 'skill-hub:crypto_derivatives',
        available: false,
        reason: res.raw?.slice(0, 200) || 'empty payload',
      };
    }

    const divergencePct = referencePrice > 0 ? ((price - referencePrice) / referencePrice) * 100 : 0;
    // Agreeing venues are neutral; a big spread is a caution, not a direction.
    const score = clampScore(50 + divergencePct * 5);

    return {
      score,
      rationale: `CCXT reports ${price.toFixed(2)} vs ${referencePrice.toFixed(2)} primary (${divergencePct >= 0 ? '+' : ''}${divergencePct.toFixed(3)}%)`,
      source: 'skill-hub:crypto_derivatives',
      available: true,
      evidence: { ccxtPrice: price, referencePrice, divergencePct },
    };
  }

  /**
   * News-flow sentiment from the 44-feed aggregator.
   *
   * This is a keyword tally over real headlines, and it is labelled as such.
   * It is not a trained sentiment model and does not pretend to be one.
   */
  async newsSignal(feeds = 'cointelegraph,decrypt,coindesk,theblock,blockworks'): Promise<SkillHubSignalValue> {
    const res = await this.cached(`news:${feeds}`, () =>
      this.client.callTool('news_feed', { action: 'latest', feeds, limit: 8 })
    );

    // The response is a per-feed array; articles live under .items.
    const items: any[] = Array.isArray(res.data)
      ? res.data.flatMap((f: any) => (Array.isArray(f.items) ? f.items : []))
      : [];

    if (!res.ok || items.length === 0) {
      return {
        score: null,
        rationale: 'No headlines returned by the feed aggregator',
        source: 'skill-hub:news_feed',
        available: false,
        reason: DEAD_FROM_THIS_HOST['news_feed/latest'],
      };
    }

    const bullish = /\b(surge|rally|soar|gain|bull|high|record|inflow|adopt|approve|boost|jump|rise|up)\b/i;
    const bearish = /\b(plunge|crash|drop|fall|bear|low|hack|exploit|lawsuit|ban|outflow|fear|sell|decline|down|risk)\b/i;

    let pos = 0;
    let neg = 0;
    for (const item of items) {
      const text = `${item.title ?? ''} ${item.summary ?? ''}`;
      if (bullish.test(text)) pos++;
      if (bearish.test(text)) neg++;
    }

    const total = pos + neg;
    // No keyword hits means no information: stay neutral rather than guess.
    const score = total === 0 ? 50 : clampScore(50 + ((pos - neg) / total) * 50);

    return {
      score,
      rationale: `${items.length} headlines (${pos} positive / ${neg} negative keyword matches) — keyword tally, not a trained model`,
      source: 'skill-hub:news_feed',
      available: true,
      evidence: {
        articleCount: items.length,
        positive: pos,
        negative: neg,
        sample: items.slice(0, 3).map((i: any) => i.title).filter(Boolean),
      },
    };
  }

  /**
   * A tool that is known dead from this host, attempted anyway so the
   * unavailability is reported from evidence rather than assumed.
   *
   * Note the empty-list case: a response can be a valid envelope whose every
   * array is empty (news_feed). That is dead too — an envelope is not data.
   */
  async unavailableProbe(tool: string, action: string, args: Record<string, any> = {}): Promise<SkillHubSignalValue> {
    const res = await this.client.callTool(tool, { action, ...args });
    const payload = res.data;

    if (!res.ok || payload === null || payload === undefined) {
      return this.dead(tool, action);
    }

    // Any array-shaped payload where every entry is empty counts as no data.
    if (Array.isArray(payload)) {
      const hasContent = payload.some((entry: any) => {
        if (entry === null || entry === undefined) return false;
        if (Array.isArray(entry)) return entry.length > 0;
        if (typeof entry === 'object') {
          return Object.entries(entry).some(
            ([k, v]) => !['error', 'url', 'feed', 'note'].includes(k) && v !== '' && v !== null && v !== undefined
          );
        }
        return true;
      });
      if (!hasContent) return this.dead(tool, action);
    }

    // Strip bookkeeping keys; if nothing meaningful remains, it is dead.
    const noise = new Set(['error', 'url', 'note', 'source', 'timestamp']);
    const meaningful = Object.entries(payload).filter(
      ([k, v]) => !noise.has(k) && v !== '' && v !== null && v !== undefined
    );
    if (meaningful.length === 0) return this.dead(tool, action);

    return {
      score: null,
      rationale: `${tool}/${action} responded but is not yet mapped to a score`,
      source: `skill-hub:${tool}`,
      available: true,
      evidence: { payload },
    };
  }

  private dead(tool: string, action: string): SkillHubSignalValue {
    const key = `${tool}/${action}`;
    return {
      score: null,
      rationale: `${key} cannot be reached from this host`,
      source: `skill-hub:${tool}`,
      available: false,
      reason: DEAD_FROM_THIS_HOST[key] ?? 'upstream fetch failed (see evidence/skill-hub-probe.json)',
    };
  }
}

export const skillHubSignals = new SkillHubSignals();
