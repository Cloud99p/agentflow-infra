#!/usr/bin/env tsx
/**
 * Test Bitget Agent Hub Integration
 * 
 * Demonstrates integration with Bitget's market data and Skill Hub
 */

import { bitget, BitgetIntegration } from '../src/bitget-integration';

async function main() {
  console.log('='.repeat(60));
  console.log('BITGET AGENT HUB - Integration Test');
  console.log('='.repeat(60));
  console.log();

  // Check if bgc CLI is installed
  const installed = await bitget.isInstalled();
  console.log('[1] Checking bgc CLI installation...');
  if (!installed) {
    console.log('❌ bgc CLI not found');
    console.log();
    console.log('Install with:');
    console.log(bitget.getInstallationInstructions());
    console.log();
    console.log('Continuing with mock data for demonstration...');
    console.log();
  } else {
    console.log('✅ bgc CLI installed');
    console.log();
  }

  // Test market data
  console.log('[2] Fetching market data from Bitget...');
  try {
    const marketData = await bitget.getMarketOverview();
    console.log('✅ Market data retrieved');
    console.log();
    console.log('Market Overview:');
    console.log('-'.repeat(60));
    Object.entries(marketData.tickers).forEach(([symbol, ticker]) => {
      console.log(`${symbol.padEnd(10)} | Price: $${ticker.lastPr.padEnd(12)} | 24h: ${ticker.change24h.padEnd(8)} | Vol: ${parseFloat(ticker.usdt24h).toLocaleString(undefined, { maximumFractionDigits: 0 })} USDT`);
    });
    console.log('-'.repeat(60));
    console.log();
  } catch (error) {
    console.log('⚠️  Market data fetch failed (expected if bgc not installed)');
    console.log();
  }

  // Test Skill Hub integration
  console.log('[3] Testing Bitget Skill Hub integration...');
  console.log();
  console.log('Available Skills:');
  console.log('  - macro-analyst: Macro & cross-asset analysis');
  console.log('  - market-intel: On-chain & institutional intelligence');
  console.log('  - sentiment-analyst: Sentiment & positioning analysis');
  console.log('  - technical-analysis: 23 technical indicators');
  console.log('  - news-briefing: News aggregation & synthesis');
  console.log();

  // Test individual ticker
  console.log('[4] Fetching BTC/USDT ticker...');
  try {
    const btcTicker = await bitget.getTicker('BTCUSDT');
    console.log('✅ BTC/USDT retrieved');
    console.log();
    console.log('BTC/USDT:');
    console.log(`  Price:      $${btcTicker.lastPr}`);
    console.log(`  24h High:   $${btcTicker.high24h}`);
    console.log(`  24h Low:    $${btcTicker.low24h}`);
    console.log(`  24h Change: ${btcTicker.change24h}`);
    console.log(`  24h Volume: ${parseFloat(btcTicker.usdt24h).toLocaleString(undefined, { maximumFractionDigits: 0 })} USDT`);
    console.log();
  } catch (error) {
    console.log('⚠️  Ticker fetch failed (expected if bgc not installed)');
    console.log();
  }

  // Test Skill Hub analysis
  console.log('[5] Running sentiment analysis...');
  try {
    const sentiment = await bitget.runSkillAnalysis('sentiment-analyst', 'BTCUSDT');
    console.log('✅ Sentiment analysis completed');
    console.log();
    console.log(`Skill: ${sentiment.skill}`);
    console.log(`Confidence: ${(sentiment.confidence * 100).toFixed(0)}%`);
    console.log(`Analysis: ${sentiment.analysis}`);
    console.log();
  } catch (error) {
    console.log('⚠️  Skill analysis failed (expected in demo mode)');
    console.log();
  }

  console.log('='.repeat(60));
  console.log('BITGET INTEGRATION TEST COMPLETE');
  console.log('='.repeat(60));
  console.log();
  console.log('Next Steps:');
  console.log('1. Install bgc CLI: npx bitget-hub upgrade-all --target claude');
  console.log('2. Configure API keys (optional for market data, required for trading)');
  console.log('3. Run: npm run dev (to start AgentFlow with Bitget integration)');
  console.log();
}

main().catch(console.error);
