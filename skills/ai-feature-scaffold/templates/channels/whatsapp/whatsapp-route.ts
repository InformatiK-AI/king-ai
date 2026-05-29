// Server-side only
// Template generado por /ai-feature-scaffold — adaptar imports según tu stack
//
// Adaptador de ENTRADA WhatsApp (webhook de Meta). Reutiliza el MISMO cerebro que la web (el puerto
// de dominio del agente: ask()), solo cambia la traducción de transporte: firma → parse → ack
// inmediato → proceso async + dedup. Para Express/Hono, reemplaza la firma Request/Response del
// App Router por el equivalente de tu framework.
//
// El puerto de dominio se construye con createAgent({ retrieve, generate, guardInput, guardOutput,
// resilience }) e implementa ask(req): Promise<AgentResponse>. Ajusta la ruta de import al puerto
// agent/ de tu proyecto, p. ej.:
//   import { createAgent } from "../../agent";
//   import type { AgentRequest, AgentResponse } from "../../agent/types";
import { createAgent } from "../../agent";
import type { AgentRequest } from "../../agent/types";
import { claimMessage, type QueryFn } from "./idempotency";
import { parseWebhook } from "./parse";
import { sendWhatsApp } from "./send";
import { verifySignature } from "./signature";

export const runtime = "nodejs";

// TODO: construir el agente con tus dependencias inyectadas (retrieve / generate / guardInput /
// guardOutput / resilience). En el standalone validado esto es un singleton del puerto agent/.
//   const agent = createAgent({ retrieve, generate, guardInput, guardOutput, resilience });
const agent = createAgent();

// TODO: inyectar tu QueryFn cableada al pool de Postgres (ver idempotency.ts). Sin esto, claimMessage
// lanza para evitar dedup silenciosa.
const query: QueryFn | undefined = undefined;

/** Verificación del webhook: Meta hace GET con hub.challenge al darlo de alta. */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return new Response("forbidden", { status: 403 });
}

export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text();

  // 1. Firma: rechaza cualquier payload no firmado por Meta (anti-suplantación).
  if (!verifySignature(rawBody, req.headers.get("x-hub-signature-256"), process.env.WHATSAPP_APP_SECRET ?? "")) {
    return new Response("invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("invalid body", { status: 400 });
  }

  // 2. Ack inmediato (< 30s): procesamos async para no exceder el timeout de reintento de Meta.
  //    Nota serverless (Vercel): preferir ctx.waitUntil() para no congelar la función tras el 200.
  for (const msg of parseWebhook(payload)) {
    void handleMessage(msg);
  }
  return new Response("ok", { status: 200 });
}

async function handleMessage(msg: AgentRequest): Promise<void> {
  try {
    // 3. Idempotencia: claim atómico DENTRO del handler async. Si Meta reintenta el mismo id,
    //    solo uno gana (la PK de webhook_dedup da exclusión mutua sin Redis).
    if (!(await claimMessage(msg.messageId, query))) return;
    // 4. Cerebro del agente (modera ANTES de entregar) + envío por el canal. El dominio es el MISMO
    //    que sirve a la web: el adaptador solo traduce transporte.
    const reply = await agent.ask(msg);
    await sendWhatsApp(msg.from, reply.answer);
  } catch (error) {
    console.error(JSON.stringify({ event: "whatsapp_process_failed", messageId: msg.messageId, error: String(error) }));
  }
}
