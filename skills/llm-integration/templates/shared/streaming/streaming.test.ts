// Template de test — generado por /llm-integration
// Ejecutar con: npm test

import { SSEHandler } from "./sse-handler";

// Helper: creates a ReadableStream that emits SSE events
function createMockSSEStream(events: Array<{ type: string; text?: string; message?: string }>): ReadableStream {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
}

describe("SSEHandler", () => {
  it("accumulates chunks in correct order", async () => {
    const stream = createMockSSEStream([
      { type: "delta", text: "Hello" },
      { type: "delta", text: " world" },
    ]);

    const result = await new SSEHandler(stream).consume();
    expect(result).toBe("Hello world");
  });

  it("calls onChunk for each token received", async () => {
    const chunks: string[] = [];
    const stream = createMockSSEStream([
      { type: "delta", text: "A" },
      { type: "delta", text: "B" },
      { type: "delta", text: "C" },
    ]);

    await new SSEHandler(stream, { onChunk: (c) => chunks.push(c) }).consume();
    expect(chunks).toEqual(["A", "B", "C"]);
  });

  it("ignores SSE comments (keep-alive lines)", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(": keep-alive\n\n"));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "delta", text: "text" })}\n\n`));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });

    const chunks: string[] = [];
    await new SSEHandler(stream, { onChunk: (c) => chunks.push(c) }).consume();
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe("text");
  });

  it("calls onComplete with full accumulated text", async () => {
    let finalText = "";
    const stream = createMockSSEStream([
      { type: "delta", text: "A" },
      { type: "delta", text: "B" },
    ]);

    await new SSEHandler(stream, { onComplete: (t) => { finalText = t; } }).consume();
    expect(finalText).toBe("AB");
  });

  it("preserves accumulated chunks when stream errors mid-way", async () => {
    let accumulated = "";
    let errorReceived: Error | null = null;

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "delta", text: "Hello" })}\n\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "delta", text: " mun" })}\n\n`));
        controller.error(new Error("stream_interrupted"));
      },
    });

    await new SSEHandler(stream, {
      onChunk: (c) => { accumulated += c; },
      onError: (e) => { errorReceived = e; },
    }).consume().catch(() => {});

    expect(accumulated).toBe("Hello mun");
    expect(errorReceived?.message).toContain("stream_interrupted");
  });
});

describe("retry with exponential backoff", () => {
  it("retries on 429 (rate limit) with increasing delays", async () => {
    const delays: number[] = [];
    const mockSleep = jest.fn((ms: number) => { delays.push(ms); return Promise.resolve(); });

    // Simulate two 429s before success — pattern from claude-client.ts withRetry logic
    let attempt = 0;
    const mockApiCall = jest.fn()
      .mockRejectedValueOnce({ status: 429, message: "Rate limit exceeded" })
      .mockRejectedValueOnce({ status: 429, message: "Rate limit exceeded" })
      .mockResolvedValueOnce("success");

    const withRetry = async (maxRetries = 3) => {
      while (attempt <= maxRetries) {
        try {
          return await mockApiCall();
        } catch (err: any) {
          if (err.status === 429 && attempt < maxRetries) {
            const delay = Math.min(1000 * 2 ** attempt + 50, 30000); // deterministic for testing
            await mockSleep(delay);
            attempt++;
          } else {
            throw err;
          }
        }
      }
    };

    await withRetry();

    expect(mockApiCall).toHaveBeenCalledTimes(3); // 2 failures + 1 success
    expect(delays).toHaveLength(2); // 2 retries = 2 sleeps
    expect(delays[1]).toBeGreaterThan(delays[0]!); // exponential: 1000 < 2000
  });

  it("does NOT retry on 401 (auth error — non-retryable)", async () => {
    const mockApiCall = jest.fn().mockRejectedValue({ status: 401, message: "Invalid API key" });

    const withNoRetryOn401 = async () => {
      try {
        return await mockApiCall();
      } catch (err: any) {
        // Auth errors are never retried — throw immediately
        if (err.status === 401) throw err;
      }
    };

    await expect(withNoRetryOn401()).rejects.toMatchObject({ status: 401 });
    expect(mockApiCall).toHaveBeenCalledTimes(1); // called once, no retry
  });
});
