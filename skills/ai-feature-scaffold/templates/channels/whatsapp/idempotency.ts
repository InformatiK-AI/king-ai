// Server-side only
// Template generado por /ai-feature-scaffold — adaptar imports según tu stack

/**
 * Ejecutor de queries INYECTABLE (permite testear la idempotencia sin Postgres real).
 *
 * Default mínimo: si no inyectas una QueryFn, lanza para forzar el cableado a tu pool.
 * Cablea sobre tu cliente de DB, p. ej.:
 *   import { getPool } from "../../rag/db";
 *   const pgQuery: QueryFn = async (text, params) => {
 *     const res = await getPool().query(text, params);
 *     return { rowCount: res.rowCount };
 *   };
 *   claimMessage(messageId, pgQuery)
 */
export type QueryFn = (text: string, params: unknown[]) => Promise<{ rowCount: number | null }>;

// TODO: cablear con tu pool de Postgres (ver comentario arriba). El default solo evita
// llamadas accidentales sin DB configurada — NO es un store de producción.
const defaultQuery: QueryFn = async () => {
  throw new Error(
    "idempotency: inyecta una QueryFn cableada a tu pool de Postgres (ver idempotency.ts)",
  );
};

/**
 * Reclama un message_id de forma atómica (INSERT ... ON CONFLICT DO NOTHING). La PK garantiza
 * exclusión mutua sin Redis. Devuelve true si es nuevo (procesalo), false si ya se vio (duplicado).
 */
export async function claimMessage(
  messageId: string,
  query: QueryFn = defaultQuery,
  channel = "whatsapp",
): Promise<boolean> {
  const res = await query(
    "INSERT INTO webhook_dedup (message_id, channel) VALUES ($1, $2) ON CONFLICT (message_id) DO NOTHING",
    [messageId, channel],
  );
  return res.rowCount === 1;
}

/** GC perezoso: la ventana de reintentos de Meta es de horas; 7 días es holgado. */
export async function gcDedup(query: QueryFn = defaultQuery): Promise<void> {
  await query("DELETE FROM webhook_dedup WHERE processed_at < now() - interval '7 days'", []);
}
