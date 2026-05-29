// Server-side only
// Template generado por /ai-feature-scaffold — adaptar imports según tu stack
//
// Capa de resiliencia del dominio: deadlines y reintentos agnósticos al transporte.
// No conoce HTTP ni el SDK; opera sobre promesas puras. Copia fiel del standalone
// (lib/agent/resilience.ts), sin la dependencia concreta de SafetyError.

/** Error de deadline excedido. `op` identifica la operación (retrieve / generate). */
export class TimeoutError extends Error {
  constructor(public readonly op: string) {
    super(`timeout:${op}`);
    this.name = "TimeoutError";
  }
}

export interface RetryConfig {
  retries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  /** Predicado de error no-reintentable. Default: `isNonRetriable`. */
  nonRetriable?: (e: unknown) => boolean;
}

export interface ResilienceConfig {
  llmTimeoutMs: number;
  retrieveTimeoutMs: number;
  retry: RetryConfig;
}

export const DEFAULT_RESILIENCE: ResilienceConfig = {
  llmTimeoutMs: 20_000,
  retrieveTimeoutMs: 5_000,
  retry: { retries: 2, baseDelayMs: 200, maxDelayMs: 2_000 },
};

/**
 * Rechaza con `TimeoutError` si `p` no resuelve en `ms`. No cancela el trabajo subyacente salvo
 * que aguas arriba se haya pasado un `AbortSignal`. `ms` no finito o <= 0 desactiva el timeout.
 */
export function withTimeout<T>(p: Promise<T>, ms: number, op: string): Promise<T> {
  if (!Number.isFinite(ms) || ms <= 0) return p;
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(op)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}

/** Extrae un código de estado HTTP de un error de proveedor, si lo tiene. */
function extractStatus(e: unknown): number | undefined {
  if (typeof e !== "object" || e === null) return undefined;
  const obj = e as Record<string, unknown>;
  for (const key of ["status", "statusCode"]) {
    const v = obj[key];
    if (typeof v === "number") return v;
  }
  return undefined;
}

/**
 * Errores que NUNCA se reintentan: autenticación (401/403), validación (400/404/422)
 * y abortos deliberados (AbortError). El resto (5xx, 429, red) es transitorio → reintentable.
 *
 * NOTA: los errores de safety (bloqueos de moderación de entrada) también deberían marcarse
 * como no-reintentables. Cuando cablees tu módulo de safety, añadí su clase de error aquí
 * (p. ej. `if (e instanceof SafetyError) return true;`) — ver guardInput en ask.ts.
 */
export function isNonRetriable(e: unknown): boolean {
  const status = extractStatus(e);
  if (status !== undefined && [400, 401, 403, 404, 422].includes(status)) return true;
  return (e as { name?: string })?.name === "AbortError";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Reintenta `fn` con backoff exponencial + full jitter. Corta de inmediato ante un error
 * no-reintentable. Tras agotar `retries`, propaga el último error.
 */
export async function withRetry<T>(fn: () => Promise<T>, cfg: RetryConfig): Promise<T> {
  const isNon = cfg.nonRetriable ?? isNonRetriable;
  let lastError: unknown;
  for (let attempt = 0; attempt <= cfg.retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (isNon(e) || attempt === cfg.retries) break;
      const backoff = Math.min(cfg.maxDelayMs, cfg.baseDelayMs * 2 ** attempt);
      await sleep(backoff * Math.random()); // full jitter: [0, backoff)
    }
  }
  throw lastError;
}
