// Server-side only
// Template generado por /ai-feature-scaffold — adaptar imports según tu stack
//
// AgentRequest es el contrato canónico del puerto de dominio (agnóstico de canal).
// Ajusta la ruta de import al puerto agent/ de tu proyecto, p. ej.:
//   import type { AgentRequest } from "../../agent/types";
import type { AgentRequest } from "../../agent/types";

interface WaTextMessage {
  id?: unknown;
  from?: unknown;
  type?: unknown;
  timestamp?: unknown;
  text?: { body?: unknown };
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
}

/**
 * Traduce un payload de WhatsApp Cloud API al contrato canónico AgentRequest. Ignora todo lo que no
 * sea un mensaje de texto (status updates, media sin manejar → ver "Caminos de evolución" del README).
 *
 * El parseo es DEFENSIVO: nunca asume la forma del payload (asArray/asRecord), porque el cuerpo del
 * webhook es entrada de red no confiable. Devuelve solo mensajes de texto bien formados.
 */
export function parseWebhook(payload: unknown): AgentRequest[] {
  const out: AgentRequest[] = [];
  for (const entry of asArray(asRecord(payload).entry)) {
    for (const change of asArray(asRecord(entry).changes)) {
      const value = asRecord(asRecord(change).value);
      for (const raw of asArray(value.messages)) {
        const m = asRecord(raw) as WaTextMessage;
        const body = m.text?.body;
        if (m.type !== "text" || typeof body !== "string") continue;
        out.push({
          channel: "whatsapp",
          messageId: String(m.id),
          from: String(m.from),
          text: body,
          raw: asRecord(raw),
        });
      }
    }
  }
  return out;
}
