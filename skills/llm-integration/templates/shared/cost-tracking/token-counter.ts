// Server-side only
// Template generado por /llm-integration — adaptar según necesidades

export type Provider = "anthropic" | "openai" | "google";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface CompletionOptions {
  maxTokens?: number;
  temperature?: number;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
}

export interface CompletionResult {
  content: string;
  usage: TokenUsage;
  latencyMs: number;
}

export interface UsageRecord {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens?: number;
  cacheReadTokens?: number;
  latencyMs: number;
  ttftMs?: number;
}

// UPDATE REGULARLY — check provider pricing pages
// Prices in USD per 1,000,000 tokens
const PRICING: Record<string, { input: number; output: number; cacheWrite?: number; cacheRead?: number }> = {
  "claude-sonnet-4-6":  { input: 3.00,  output: 15.00, cacheWrite: 3.75,  cacheRead: 0.30  },
  "claude-haiku-4-5":   { input: 0.80,  output: 4.00,  cacheWrite: 1.00,  cacheRead: 0.08  },
  "gpt-4o":             { input: 2.50,  output: 10.00, cacheRead: 1.25  },
  "gpt-4o-mini":        { input: 0.15,  output: 0.60,  cacheRead: 0.075 },
  "gemini-2.0-flash":   { input: 0.10,  output: 0.40  },
};

export function calculateCostUSD(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheWriteTokens = 0,
  cacheReadTokens = 0,
): number {
  const pricing = PRICING[model];
  if (!pricing) return 0; // Unknown model — cost unknown, don't throw

  const M = 1_000_000;
  return (
    (inputTokens      * pricing.input)                     / M +
    (outputTokens     * pricing.output)                    / M +
    (cacheWriteTokens * (pricing.cacheWrite ?? pricing.input)) / M +
    (cacheReadTokens  * (pricing.cacheRead  ?? 0))         / M
  );
}

/** Accumulates token usage into a running total. Mutates the `target` object in place. */
export function accumulateUsage(target: TokenUsage, incoming: TokenUsage): void {
  target.inputTokens += incoming.inputTokens;
  target.outputTokens += incoming.outputTokens;
  target.cacheWriteTokens += incoming.cacheWriteTokens;
  target.cacheReadTokens += incoming.cacheReadTokens;
}

export class TokenCounter {
  private model: string;
  private requests: UsageRecord[] = [];

  constructor(model: string) {
    this.model = model;
  }

  // record() is fire-and-forget safe — errors must never propagate to the caller
  async record(usage: UsageRecord): Promise<void> {
    try {
      this.requests.push(usage);
      const costUsd = calculateCostUSD(
        this.model,
        usage.inputTokens,
        usage.outputTokens,
        usage.cacheWriteTokens ?? 0,
        usage.cacheReadTokens ?? 0,
      );

      // TODO: persist to your database using the llm_usage schema
      // await db.insert(llmUsageTable).values({ ...usage, costUsd, model: this.model });
      // See: src/db/migrations/create_llm_usage.sql for the schema

      // Fallback: structured log if DB is unavailable
      console.log(JSON.stringify({
        event: "llm_usage",
        model: this.model,
        ...usage,
        costUsd,
        cacheHit: (usage.cacheReadTokens ?? 0) > 0,
      }));
    } catch {
      // Silent failure — cost tracking must never break the LLM request
    }
  }

  sessionTotal(): { requests: number; totalCost: number; inputTokens: number; outputTokens: number } {
    const totals = this.requests.reduce(
      (acc, r) => ({
        inputTokens: acc.inputTokens + r.inputTokens,
        outputTokens: acc.outputTokens + r.outputTokens,
        cacheWriteTokens: acc.cacheWriteTokens + (r.cacheWriteTokens ?? 0),
        cacheReadTokens: acc.cacheReadTokens + (r.cacheReadTokens ?? 0),
      }),
      { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 },
    );

    return {
      requests: this.requests.length,
      totalCost: calculateCostUSD(
        this.model,
        totals.inputTokens,
        totals.outputTokens,
        totals.cacheWriteTokens,
        totals.cacheReadTokens,
      ),
      inputTokens: totals.inputTokens,
      outputTokens: totals.outputTokens,
    };
  }
}
