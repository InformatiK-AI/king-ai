// Server-side only
// Template generado por /ai-feature-scaffold — adaptar imports según tu stack
//
// channelLimit vive en el contrato canónico del puerto agent/. Ajusta la ruta:
//   import { channelLimit } from "../../agent/types";
import { channelLimit } from "../../agent/types";

const GRAPH_URL = "https://graph.facebook.com/v21.0";

/**
 * Envía un texto por WhatsApp Cloud API. Sin credenciales (WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID)
 * es un no-op logueado: la lógica (firma/parse/dedup/longitud) se valida por unit tests; el envío
 * real lo prueba el usuario con su cuenta de Meta. Trunca al límite del canal.
 *
 * SECURITY: el token vive en process.env, jamás hardcodeado. Código server-side: nunca lo expongas
 * al cliente.
 */
export async function sendWhatsApp(to: string, text: string): Promise<void> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const body = text.slice(0, channelLimit.whatsapp);

  if (!token || !phoneNumberId) {
    console.error(JSON.stringify({ event: "whatsapp_send_skipped", to, reason: "missing_credentials" }));
    return;
  }

  const res = await fetch(`${GRAPH_URL}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body } }),
  });

  if (!res.ok) {
    console.error(JSON.stringify({ event: "whatsapp_send_failed", to, status: res.status }));
  }
}
