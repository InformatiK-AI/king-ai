// Server-side only — never import from client bundle
// Template generado por /llm-integration — adaptar según necesidades
import Anthropic from "@anthropic-ai/sdk";
import {
  Message,
  CompletionOptions,
  TokenUsage,
  CompletionResult,
  calculateCostUSD,
  accumulateUsage,
} from "../shared/cost-tracking/token-counter";
import type { LLMProvider, ProviderCapabilities } from "../shared/llm-provider";

export type ClaudeClientError = {
  reason: "rate_limit" | "timeout" | "api_error" | "auth_error" | "context_length";
  message: string;
  retryable: boolean;
};

export class ClaudeClient implements LLMProvider {
  private client: Anthropic;
  private model: string;
  private systemPrompt: string;
  private maxRetries: number;
  private sessionUsage: TokenUsage = { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 };

  constructor(config: {
    systemPrompt?: string;
    model?: string;
    maxRetries?: number;
  } = {}) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not configured");
    }
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this.model = config.model ?? process.env.LLM_MODEL ?? "claude-sonnet-4-6";
    this.systemPrompt = config.systemPrompt ?? "You are a helpful assistant.";
    this.maxRetries = config.maxRetries ?? 3;
  }

  async complete(messages: Message[], options: CompletionOptions = {}): Promise<CompletionResult> {
    const start = Date.now();
    let attempt = 0;

    while (attempt <= this.maxRetries) {
      try {
        const response = await this.client.messages.create({
          model: this.model,
          max_tokens: options.maxTokens ?? 1024,
          system: [
            {
              type: "text",
              text: this.systemPrompt,
              // Cache system prompt if it's substantial (saves ~89% on cached tokens)
              ...(this.systemPrompt.length > 1024 && {
                cache_control: { type: "ephemeral", ttl: "5m" },
              }),
            },
          ],
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        });

        const usage: TokenUsage = {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          cacheWriteTokens: (response.usage as any).cache_creation_input_tokens ?? 0,
          cacheReadTokens: (response.usage as any).cache_read_input_tokens ?? 0,
        };
        accumulateUsage(this.sessionUsage, usage);

        return {
          content: response.content[0].type === "text" ? response.content[0].text : "",
          usage,
          latencyMs: Date.now() - start,
        };
      } catch (err: any) {
        const classified = this.classifyError(err);
        if (!classified.retryable || attempt === this.maxRetries) throw classified;
        // Exponential backoff — never retry auth errors
        await this.sleep(Math.min(1000 * 2 ** attempt + Math.random() * 100, 30000));
        attempt++;
      }
    }
    throw { reason: "api_error", message: "Max retries exceeded", retryable: false } as ClaudeClientError;
  }

  async *stream(messages: Message[], options: CompletionOptions = {}): AsyncIterable<string> {
    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: options.maxTokens ?? 1024,
      system: [
        {
          type: "text",
          text: this.systemPrompt,
          ...(this.systemPrompt.length > 1024 && {
            cache_control: { type: "ephemeral", ttl: "5m" },
          }),
        },
      ],
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield event.delta.text;
      }
    }

    const final = await stream.finalMessage();
    const usage: TokenUsage = {
      inputTokens: final.usage.input_tokens,
      outputTokens: final.usage.output_tokens,
      cacheWriteTokens: (final.usage as any).cache_creation_input_tokens ?? 0,
      cacheReadTokens: (final.usage as any).cache_read_input_tokens ?? 0,
    };
    accumulateUsage(this.sessionUsage, usage);
  }

  getCapabilities(): ProviderCapabilities {
    return { streaming: true, promptCaching: true, maxContextTokens: 200000 };
  }

  getSessionUsage(): TokenUsage {
    return { ...this.sessionUsage };
  }

  calculateCostUSD(usage: TokenUsage): number {
    return calculateCostUSD(
      this.model,
      usage.inputTokens,
      usage.outputTokens,
      usage.cacheWriteTokens,
      usage.cacheReadTokens,
    );
  }

  private classifyError(err: any): ClaudeClientError {
    if (err?.status === 401 || err?.status === 403)
      return { reason: "auth_error", message: "Invalid API key", retryable: false };
    if (err?.status === 429)
      return { reason: "rate_limit", message: "Rate limit exceeded", retryable: true };
    if (err?.message?.includes("context window"))
      return { reason: "context_length", message: "Context window exceeded", retryable: false };
    return { reason: "api_error", message: err?.message ?? "Unknown error", retryable: true };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
