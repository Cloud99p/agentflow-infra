/**
 * AI Reasoning Engine using DeepSeek API
 * 
 * Generates detailed trading analysis and recommendations
 */

export interface AIReasoningRequest {
  symbol: string;
  marketData: {
    price: number;
    change24h: number;
    high24h: number;
    low24h: number;
    volume: number;
  };
  signals: {
    name: string;
    score: number;
    weight: number;
    rationale: string;
  }[];
  totalScore: number;
  recommendation: string;
  portfolio?: {
    totalValue: number;
    totalPnL: number;
    positions: any[];
  };
}

export interface AIReasoningResponse {
  decision: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL';
  confidence: number;
  summary: string;
  keyPoints: string[];
  rationale: string;
  riskAssessment: string;
  actionPlan: string[];
  timestamp: number;
}

/**
 * Call DeepSeek API for AI reasoning
 */
export async function getDeepSeekReasoning(
  request: AIReasoningRequest,
  apiKey: string
): Promise<AIReasoningResponse> {
  const prompt = buildReasoningPrompt(request);

  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: `You are an expert crypto trading analyst AI. Analyze market data and technical signals to provide clear, actionable trading recommendations. Be concise but thorough. Format your response as valid JSON.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 1000
      })
    });

    const data = await response.json();
    
    if (data.choices && data.choices[0] && data.choices[0].message) {
      const content = data.choices[0].message.content;
      // Try to parse JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      // Fallback: return structured response
      return {
        decision: request.recommendation as any,
        confidence: 80,
        summary: content.substring(0, 200),
        keyPoints: [content.substring(0, 150)],
        rationale: content,
        riskAssessment: 'Medium risk based on current market conditions',
        actionPlan: ['Monitor price action', 'Set stop-loss', 'Watch for confirmation'],
        timestamp: Date.now()
      };
    }
    
    throw new Error('Invalid response from DeepSeek API');
  } catch (error) {
    console.error('[DEEPSEEK] AI reasoning error:', error);
    // Return fallback reasoning
    return getFallbackReasoning(request);
  }
}

/**
 * Build prompt for DeepSeek API
 */
function buildReasoningPrompt(request: AIReasoningRequest): string {
  const { symbol, marketData, signals, totalScore, recommendation, portfolio } = request;
  
  const signalsText = signals.map(s => 
    `- ${s.name}: ${s.score}/100 (Weight: ${(s.weight * 100).toFixed(0)}%) - ${s.rationale}`
  ).join('\n');

  const bullishSignals = signals.filter(s => s.score >= 60).length;
  const neutralSignals = signals.filter(s => s.score >= 40 && s.score < 60).length;
  const bearishSignals = signals.filter(s => s.score < 40).length;

  return `Analyze this crypto trading opportunity and provide a JSON response:

SYMBOL: ${symbol}
MARKET DATA:
- Price: $${marketData.price.toLocaleString()}
- 24h Change: ${(marketData.change24h * 100).toFixed(2)}%
- 24h High: $${marketData.high24h.toLocaleString()}
- 24h Low: $${marketData.low24h.toLocaleString()}
- 24h Volume: $${(marketData.volume / 1_000_000).toFixed(0)}M

TECHNICAL SIGNALS (${signals.length} total):
${signalsText}

SIGNAL SUMMARY:
- Bullish: ${bullishSignals}
- Neutral: ${neutralSignals}
- Bearish: ${bearishSignals}

OVERALL SCORE: ${totalScore.toFixed(1)}/100
PRELIMINARY RECOMMENDATION: ${recommendation}

${portfolio ? `PORTFOLIO CONTEXT:
- Total Value: $${portfolio.totalValue.toLocaleString()}
- Total PnL: $${portfolio.totalPnL.toLocaleString()} (${((portfolio.totalPnL / (portfolio.totalValue - portfolio.totalPnL)) * 100).toFixed(2)}%)
- Open Positions: ${portfolio.positions.length}` : ''}

Provide your analysis in this exact JSON format:
{
  "decision": "STRONG_BUY|BUY|HOLD|SELL|STRONG_SELL",
  "confidence": 0-100,
  "summary": "One sentence summary",
  "keyPoints": ["point1", "point2", "point3"],
  "rationale": "Detailed explanation",
  "riskAssessment": "Risk level and factors",
  "actionPlan": ["action1", "action2", "action3"]
}`;
}

/**
 * Fallback reasoning when API fails
 */
function getFallbackReasoning(request: AIReasoningRequest): AIReasoningResponse {
  const { signals, totalScore, recommendation } = request;
  const bullish = signals.filter(s => s.score >= 60).length;
  const bearish = signals.filter(s => s.score < 40).length;
  
  return {
    decision: recommendation as any,
    confidence: Math.min(100, signals.length * 10),
    summary: `Mixed signals detected. Market is in consolidation. Wait for clearer direction.`,
    keyPoints: [
      `${bullish} bullish, ${signals.length - bullish - bearish} neutral, ${bearish} bearish signals`,
      `Overall score: ${totalScore.toFixed(1)}/100`,
      `Price action suggests ${totalScore > 50 ? 'cautious optimism' : 'caution'}`
    ],
    rationale: `Based on ${signals.length} technical indicators, the overall score is ${totalScore.toFixed(1)}/100, suggesting a ${recommendation} stance. Key factors include momentum, volatility, and market regime signals.`,
    riskAssessment: 'Medium risk - monitor closely for confirmation',
    actionPlan: [
      'Wait for clearer signal confirmation',
      'Set appropriate stop-loss levels',
      'Monitor volume for validation'
    ],
    timestamp: Date.now()
  };
}
