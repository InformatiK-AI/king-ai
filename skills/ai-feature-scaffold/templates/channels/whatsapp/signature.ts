// Server-side only
// Template generado por /ai-feature-scaffold — adaptar imports según tu stack
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifica la firma `X-Hub-Signature-256` de Meta: `sha256=` + HMAC-SHA256(rawBody, appSecret).
 * Comparación timing-safe. Rechaza si falta el header o el secreto, o si la longitud difiere.
 *
 * SECURITY: nunca compares con `===` (vulnerable a timing attack). El secreto vive en
 * process.env.WHATSAPP_APP_SECRET — jamás lo hardcodees.
 */
export function verifySignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header || !appSecret) return false;
  const expected = "sha256=" + createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
