// Server-side only — never import from client bundle
// Template generado por /llm-integration — adaptar según necesidades
import OpenAI from "openai";
import { Message, CompletionOptions, TokenUsage, CompletionResult, calculateCostUSD, accumulateUsage } from "../shared/cost-tracking/token-counter";
import type { LLMProvider, ProviderCapabilities } from "../shared/llm-provider";

export class OpenAIClient implements LLMProvider {
  private client: OpenAI;
  private model: string;
  private systemPrompt: string;
  private maxRetries: number;
  private sessionUsage: TokenUsage = { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 };

  constructor(config: { systemPrompt?: string; model?: string; maxRetries?: number } = {}) {
    if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.model = config.model ?? process.env.LLM_MODEL ?? "gpt-4o-mini";
    this.systemPrompt = config.systemPrompt ?? "You are a helpful assistant.";
    this.maxRetries = config.maxRetries ?? 3;
  }

  async complete(messages: Message[], options: CompletionOptions = {}): Promise<CompletionResult> {
    const start = Date.now();
    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: options.maxTokens ?? 1024,
      messages: [
        { role: "system", content: this.systemPrompt },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    });

    const usage: TokenUsage = {
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
      cacheWriteTokens: 0,
      cacheReadTokens: (response.usage as any)?.prompt_tokens_details?.cached_tokens ?? 0,
    };
    accumulateUsage(this.sessionUsage, usage);

    return {
      content: response.choices[0]?.message?.content ?? "",
      usage,
      latencyMs: Date.now() - start,
    };
  }

  async *stream(messages: Message[], options: CompletionOptions = {}): AsyncIterable<string> {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: options.maxTokens ?? 1024,
      messages: [
        { role: "system", content: this.systemPrompt },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      stream: true,
      stream_options: { include_usage: true }, // Required to get usage in stream
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content ?? "";
      if (text) yield text;

      // Usage comes in the final chunk
      if (chunk.usage) {
        const usage: TokenUsage = {
          inputTokens: chunk.usage.prompt_tokens,
          outputTokens: chunk.usage.completion_tokens,
          cacheWriteTokens: 0,
          cacheReadTokens: (chunk.usage as any).prompt_tokens_details?.cached_tokens ?? 0,
        };
        accumulateUsage(this.sessionUsage, usage);
      }
    }
  }

  getCapabilities(): ProviderCapabilities { return { streaming: true, promptCaching: false, maxContextTokens: 128000 }; }
  getSessionUsage(): TokenUsage { return { ...this.sessionUsage }; }

  calculateCostUSD(usage: TokenUsage): number {
    return calculateCostUSD(
      this.model,
      usage.inputTokens,
      usage.outputTokens,
      usage.cacheWriteTokens,
      usage.cacheReadTokens,
    );
  }

}
