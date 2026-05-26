// Server-side only
// Template generado por /llm-integration — adaptar según necesidades

export interface SSEHandlerOptions {
  onChunk?: (text: string) => void;
  onComplete?: (fullText: string) => void;
  onError?: (error: Error) => void;
}

/**
 * Parses a ReadableStream of SSE data and emits events.
 * Use this when you need to consume SSE from the server or in tests.
 */
export class SSEHandler {
  constructor(
    private stream: ReadableStream,
    private options: SSEHandlerOptions = {},
  ) {}

  async consume(): Promise<string> {
    const reader = this.stream.getReader();
    const decoder = new TextDecoder();
    let accumulated = "";
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? ""; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith(": ")) continue; // SSE comment — ignore (e.g., keep-alive)
          if (!line.startsWith("data: ")) continue;

          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            if (parsed.type === "delta" && parsed.text) {
              accumulated += parsed.text;
              this.options.onChunk?.(parsed.text);
            } else if (parsed.type === "error") {
              const err = new Error(parsed.message ?? "Stream error");
              this.options.onError?.(err);
            }
          } catch {
            // Malformed JSON in SSE — skip and continue
          }
        }
      }
    } catch (err) {
      this.options.onError?.(err instanceof Error ? err : new Error(String(err)));
    } finally {
      reader.releaseLock();
    }

    this.options.onComplete?.(accumulated);
    return accumulated;
  }
}
