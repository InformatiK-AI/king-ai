// Server-side only — Next.js App Router API route
// Template generado por /ai-feature-scaffold — adaptar imports según tu stack
// Para Express/Hono: reemplazar NextRequest con el equivalente de tu framework
import { NextRequest } from "next/server";
import { z } from "zod";
// TODO: importar tu cliente LLM (ejecutar /llm-integration primero)
// import { ClaudeClient } from "@/lib/llm/claude-client";
// import { TokenCounter } from "@/lib/llm/cost-tracking/token-counter";

const RequestSchema = z.object({
  message: z.string().min(1).max(4000),
  conversationId: z.string().uuid().optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(8000),
      }),
    )
    .max(50) // Limit history to prevent context overflow
    .optional()
    .default([]),
});

// Initialize LLM client (server-side only)
// const llmClient = new ClaudeClient({
//   systemPrompt: "You are a helpful assistant. Answer concisely and accurately.",
// });
// const counter = new TokenCounter(process.env.LLM_MODEL ?? "claude-sonnet-4-6");

export async function POST(req: NextRequest) {
  // TODO: authenticate — never expose LLM endpoints without auth
  // const session = await getServerSession(); if (!session) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const { message, conversationId, history } = parsed.data;

  // Sanitize — remove control characters before sending to LLM
  const sanitized = message.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");

  // SECURITY: use explicit roles, never concatenate strings
  const messages = [
    ...history,
    { role: "user" as const, content: sanitized },
  ];

  const startTime = Date.now();
  let ttftMs: number | undefined;

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (data: object) =>
        controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));

      try {
        // TODO: replace with your actual LLM client
        // for await (const chunk of llmClient.stream(messages)) {
        //   if (ttftMs === undefined) ttftMs = Date.now() - startTime;
        //   send({ type: "delta", text: chunk });
        // }

        // Placeholder — remove when LLM client is configured
        send({ type: "delta", text: "LLM client not configured. Run /llm-integration first." });

        // const usage = llmClient.getSessionUsage();
        // const costUsd = llmClient.calculateCostUSD(usage);

        // AC-3: log observability metrics on every request
        console.log(
          JSON.stringify({
            event: "chatbot_request",
            conversationId,
            // inputTokens: usage.inputTokens,
            // outputTokens: usage.outputTokens,
            // costUsd,
            latencyMs: Date.now() - startTime,
            ttftMs,
          }),
        );

        // counter.record({ inputTokens: usage.inputTokens, outputTokens: usage.outputTokens,
        //   cacheReadTokens: usage.cacheReadTokens, latencyMs: Date.now() - startTime, ttftMs }).catch(() => {});

        send({ type: "done" });
        controller.close();
      } catch (err) {
        // Never expose internal errors to client
        send({ type: "error", message: "An error occurred. Please try again." });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN ?? "http://localhost:3000",
    },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN ?? "http://localhost:3000",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
