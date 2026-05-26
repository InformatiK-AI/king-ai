// ADR-004: LLMProvider interface — all LLM clients must implement this.
// Adding a new provider = create a new adapter that implements this interface.
import type {
  Message,
  CompletionOptions,
  CompletionResult,
  TokenUsage,
} from "./cost-tracking/token-counter";

export interface ProviderCapabilities {
  streaming: boolean;
  promptCaching: boolean;
  maxContextTokens: number;
}

/**
 * Common interface for all LLM provider adapters (ADR-004).
 * Consumers depend on this interface, never on the concrete adapter.
 */
export interface LLMProvider {
  complete(messages: Message[], options?: CompletionOptions): Promise<CompletionResult>;
  stream(messages: Message[], options?: CompletionOptions): AsyncIterable<string>;
  getCapabilities(): ProviderCapabilities;
  // Session-scoped metrics — included in interface so consumers can track costs
  // without knowing the concrete provider.
  getSessionUsage(): TokenUsage;
  calculateCostUSD(usage: TokenUsage): number;
}
