// Server-side only — Next.js App Router API route
// Template generado por /ai-feature-scaffold — adaptar imports según tu stack
//
// Este archivo es un ADAPTADOR DE ENTRADA delgado (puerto hexagonal): traduce HTTP ↔ contrato
// canónico del dominio y serializa los deltas como SSE. NO construye el cliente LLM ni orquesta
// safety/RAG/generación: todo eso vive detrás del puerto (`createAgent` → `askStream`/`ask`).
// Para Express/Hono: reemplazar NextRequest con el equivalente de tu framework.
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
// El puerto del dominio. `createAgent` devuelve { ask, askStream } y recibe sus dependencias
// (retrieve, generate, guardInput, guardOutput, resilience) por inyección. Ver ./agent/types.
// TODO: ajustá la ruta de import a la ubicación real de tu dominio (p. ej. "@/lib/agent").
import { createAgent, type AgentRequest, type Channel } from "../agent";

// pg + embeddings locales requieren el runtime Node (no edge).
export const runtime = "nodejs";

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

// Instancia única del puerto. Las deps reales (retrieve/generate/guard*) se cablean dentro de
// `createAgent` por inyección con defaults; este adaptador nunca las conoce ni las importa.
// TODO: si necesitás overrides (mock en e2e, modelo distinto), pasalos a createAgent({ ... }).
const agent = createAgent();

const corsHeaders = (): Record<string, string> => ({
  "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN ?? "http://localhost:3000",
});

export async function POST(req: NextRequest): Promise<Response> {
  // TODO: authenticate — never expose LLM endpoints without auth
  // const session = await getServerSession(); if (!session) return unauthorized();
  // TODO: rate-limit por usuario/IP antes de invocar el puerto (proteger costo + abuso).

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400, headers: corsHeaders() });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", details: parsed.error.issues },
      { status: 400, headers: corsHeaders() },
    );
  }

  const { message, conversationId, history } = parsed.data;

  // Construir el AgentRequest CANÓNICO (agnóstico de canal). El adaptador web fija channel="web";
  // el resto del payload crudo (conversationId, etc.) viaja en `raw` — el dominio NO lo usa.
  const channel: Channel = "web";
  const request: AgentRequest = {
    channel,
    messageId: randomUUID(),
    from: "web",
    text: message,
    history,
    raw: { conversationId },
  };

  let handle;
  try {
    handle = await agent.askStream(request); // el dominio puede lanzar (p. ej. safety PRE)
  } catch {
    // Nunca exponer errores internos ni la razón exacta de un bloqueo al cliente.
    return Response.json({ error: "An error occurred. Please try again." }, { status: 403, headers: corsHeaders() });
  }

  // La reply completa (usage, degraded, moderación final) se resuelve al drenar el stream.
  // El cliente web solo consume deltas, así que la observamos de fondo para logging sin bloquear.
  void handle.reply
    .then((reply) => {
      // AC-3: log observability metrics on every request (sin secretos, sin PII).
      console.log(
        JSON.stringify({
          event: "chatbot_request",
          conversationId,
          degraded: reply.degraded,
          blocked: reply.blocked?.reason,
          inputTokens: reply.usage?.inputTokens,
          outputTokens: reply.usage?.outputTokens,
          latencyMs: reply.latencyMs,
        }),
      );
    })
    .catch(() => undefined);

  // Serializar los deltas del puerto como SSE en el formato que consume SSEHandler / ChatComponent.
  return new Response(toSSEStream(handle.textStream), {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      ...corsHeaders(),
    },
  });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    headers: {
      ...corsHeaders(),
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

/**
 * Adapta el AsyncIterable<string> de deltas del dominio a un ReadableStream de bytes en formato SSE.
 * Emite `{ type: "delta", text }` por delta, `{ type: "done" }` al cerrar y `{ type: "error" }`
 * ante un fallo a mitad del stream (sin filtrar el detalle interno). Lo consume el SSEHandler
 * compartido (skills/llm-integration/.../sse-handler.ts) y el ChatComponent del navegador.
 */
export function toSSEStream(source: AsyncIterable<string>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const frame = (data: Record<string, unknown>): Uint8Array =>
    encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
  const iterator = source[Symbol.asyncIterator]();

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await iterator.next();
        if (done) {
          controller.enqueue(frame({ type: "done" }));
          controller.close();
          return;
        }
        controller.enqueue(frame({ type: "delta", text: value }));
      } catch {
        // Never expose internal errors to client.
        controller.enqueue(frame({ type: "error", message: "An error occurred. Please try again." }));
        controller.close();
      }
    },
    async cancel() {
      await iterator.return?.(undefined);
    },
  });
}
