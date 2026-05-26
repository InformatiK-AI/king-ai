// Server-side only — never import from client bundle
// Template generado por /llm-integration — adaptar según necesidades
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Message, CompletionOptions, TokenUsage, CompletionResult, calculateCostUSD, accumulateUsage } from "../shared/cost-tracking/token-counter";
import type { LLMProvider, ProviderCapabilities } from "../shared/llm-provider";

// Note: Gemini does not support manual prompt caching (cacheWriteTokens always 0)

export class GeminiClient implements LLMProvider {
  private client: GoogleGenerativeAI;
  private model: string;
  private systemPrompt: string;
  private maxRetries: number;
  private sessionUsage: TokenUsage = { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 };

  constructor(config: { systemPrompt?: string; model?: string; maxRetries?: number } = {}) {
    if (!process.env.GOOGLE_API_KEY) throw new Error("GOOGLE_API_KEY is not configured");
    this.client = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    this.model = config.model ?? process.env.LLM_MODEL ?? "gemini-2.0-flash";
    this.systemPrompt = config.systemPrompt ?? "You are a helpful assistant.";
    this.maxRetries = config.maxRetries ?? 3;
  }

  async complete(messages: Message[], options: CompletionOptions = {}): Promise<CompletionResult> {
    const start = Date.now();
    const model = this.client.getGenerativeModel({
      model: this.model,
      systemInstruction: this.systemPrompt,
    });

    const history = messages.slice(0, -1).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const chat = model.startChat({ history });
    const lastMessage = messages[messages.length - 1];
    const result = await chat.sendMessage(lastMessage.content);
    const response = result.response;

    const usage: TokenUsage = {
      inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
    };
    accumulateUsage(this.sessionUsage, usage);

    return { content: response.text(), usage, latencyMs: Date.now() - start };
  }

  async *stream(messages: Message[], options: CompletionOptions = {}): AsyncIterable<string> {
    const model = this.client.getGenerativeModel({
      model: this.model,
      systemInstruction: this.systemPrompt,
    });

    const history = messages.slice(0, -1).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const chat = model.startChat({ history });
    const lastMessage = messages[messages.length - 1];
    const result = await chat.sendMessageStream(lastMessage.content);

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) yield text;
    }

    // Usage available after stream completes
    const finalResponse = await result.response;
    const usage: TokenUsage = {
      inputTokens: finalResponse.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: finalResponse.usageMetadata?.candidatesTokenCount ?? 0,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
    };
    accumulateUsage(this.sessionUsage, usage);
  }

  getCapabilities(): ProviderCapabilities { return { streaming: true, promptCaching: false, maxContextTokens: 1000000 }; }
  getSessionUsage(): TokenUsage { return { ...this.sessionUsage }; }

  calculateCostUSD(usage: TokenUsage): number {
    return calculateCostUSD(this.model, usage.inputTokens, usage.outputTokens);
  }
}
