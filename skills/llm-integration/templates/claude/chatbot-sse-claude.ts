// Server-side only — Next.js App Router API route
// Template generado por /llm-integration — adaptar según necesidades
import { NextRequest } from "next/server";
import { z } from "zod";
import { ClaudeClient } from "./claude-client";
import { TokenCounter } from "../shared/cost-tracking/token-counter";
import { SSEHandler } from "../shared/streaming/sse-handler";

// SECURITY: configure rate limiting before deploying to production.
// Example (Upstash Redis — npm install @upstash/ratelimit @upstash/redis):
// import { Ratelimit } from "@upstash/ratelimit";
// import { Redis } from "@upstash/redis";
// const ratelimit = new Ratelimit({ redis: Redis.fromEnv(), limiter: Ratelimit.slidingWindow(10, "1 m") });
// async function checkRateLimit(ip: string): Promise<boolean> {
//   const { success } = await ratelimit.limit(ip);
//   return success;
// }
// Usage in POST handler: if (!await checkRateLimit(req.ip ?? "anonymous")) {
//   return Response.json({ error: "Rate limit exceeded. Try again in a moment." }, { status: 429 });
// }

const RequestSchema = z.object({
  message: z.string().min(1).max(4000),
  conversationId: z.string().uuid().optional(),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .optional()
    .default([]),
});

const client = new ClaudeClient({
  systemPrompt: "You are a helpful assistant. Answer concisely and accurately.",
});

export async function POST(req: NextRequest) {
  // TODO: authenticate request here (e.g., verify session/JWT)
  // const session = await getServerSession(req); if (!session) return new Response("Unauthorized", { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "Invalid request", details: parsed.error.issues }), {
      status: 400,
    });
  }

  const { message, conversationId, history } = parsed.data;

  // Sanitize input — remove control characters that could confuse the LLM
  const sanitizedMessage = message.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
  const messages = [...history, { role: "user" as const, content: sanitizedMessage }];

  const counter = new TokenCounter(process.env.LLM_MODEL ?? "claude-sonnet-4-6");
  const startTime = Date.now();
  let ttftMs: number | undefined;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        let firstChunk = true;
        for await (const chunk of client.stream(messages)) {
          if (firstChunk) {
            ttftMs = Date.now() - startTime;
            firstChunk = false;
          }
          // Explicit serialization — never pipe LLM stream directly
          send({ type: "delta", text: chunk });
        }

        const usage = client.getSessionUsage();
        const costUsd = client.calculateCostUSD(usage);

        // Log observability (AC-3) — replace with your logger
        console.log(JSON.stringify({
          event: "llm_request",
          provider: "anthropic",
          model: process.env.LLM_MODEL ?? "claude-sonnet-4-6",
          conversationId,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cacheReadTokens: usage.cacheReadTokens,
          costUsd,
          latencyMs: Date.now() - startTime,
          ttftMs,
        }));

        // Persist to llm_usage table (fire and forget — don't block the response)
        counter.record({ ...usage, latencyMs: Date.now() - startTime, ttftMs }).catch(() => {
          // Cost tracking failure must never break the request
        });

        send({ type: "done" });
        controller.close();
      } catch (err: any) {
        // Send sanitized error — never expose internal error details to client
        send({ type: "error", message: "An error occurred. Please try again." });
        controller.close();
      }
    },
    cancel() {
      // Client disconnected — SSE connection cleanup handled by GC
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      // SECURITY: Never use * in production. Set ALLOWED_ORIGIN env var to your domain.
      "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN ?? "http://localhost:3000",
    },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      // SECURITY: Never use * in production. Set ALLOWED_ORIGIN env var to your domain.
      "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN ?? "http://localhost:3000",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
