// Template de test — generado por /llm-integration
import { calculateCostUSD, TokenCounter } from "./token-counter";

describe("calculateCostUSD", () => {
  it("calculates cost correctly for Claude Sonnet", () => {
    // $3.00/MTok input, $15.00/MTok output
    const cost = calculateCostUSD("claude-sonnet-4-6", 1000, 500);
    expect(cost).toBeCloseTo(0.003 + 0.0075, 6); // $0.0105
  });

  it("applies cache read discount (10% of input price)", () => {
    // 800 cached tokens at $0.30/MTok instead of $3.00/MTok
    const withCache = calculateCostUSD("claude-sonnet-4-6", 200, 100, 0, 800);
    const withoutCache = calculateCostUSD("claude-sonnet-4-6", 1000, 100);
    expect(withCache).toBeLessThan(withoutCache);
  });

  it("returns 0 for unknown model (no throw)", () => {
    expect(() => calculateCostUSD("unknown-model-xyz", 1000, 500)).not.toThrow();
    expect(calculateCostUSD("unknown-model-xyz", 1000, 500)).toBe(0);
  });
});

describe("TokenCounter", () => {
  it("accumulates costs across multiple requests", async () => {
    const counter = new TokenCounter("claude-sonnet-4-6");
    await counter.record({ inputTokens: 100, outputTokens: 50, latencyMs: 300 });
    await counter.record({ inputTokens: 200, outputTokens: 100, latencyMs: 400 });

    const total = counter.sessionTotal();
    expect(total.requests).toBe(2);
    expect(total.inputTokens).toBe(300);
    expect(total.totalCost).toBeGreaterThan(0);
  });

  it("does not throw when record() receives undefined (silent failure)", async () => {
    const counter = new TokenCounter("claude-sonnet-4-6");
    await expect(counter.record(undefined as any)).resolves.not.toThrow();
    expect(counter.sessionTotal().requests).toBe(0);
  });
});
