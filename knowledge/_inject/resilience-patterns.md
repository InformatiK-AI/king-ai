# Resilience Patterns para Agentes LLM (para inyección)

> Versión compacta para inyección en agents. Guía de referencia accionable para el código
> generado por `/ai-feature-scaffold` y `/llm-integration`.
>
> El template REFLEJA un standalone YA VALIDADO (`lib/agent/*`). No inventa un diseño nuevo:
> el dominio (`ask` / `askStream`) recibe sus dependencias por INYECCIÓN
> (`retrieve`, `generate`, `guardInput`, `guardOutput`, `resilience`) y la capa de resiliencia
> opera sobre promesas puras, agnóstica del transporte (no conoce HTTP ni el SDK del proveedor).

## Contrato canónico (types.ts)

```typescript
// Server-side only
// Template generado por /ai-feature-scaffold — adaptar imports según tu stack

export type Channel = "web" | "whatsapp" | "telegram" | "slack" | "cli";

/** Límite de longitud de respuesta por canal (caracteres). web/cli sin límite. */
export const channelLimit: Record<Channel, number> = {
  web: Number.POSITIVE_INFINITY,
  cli: Number.POSITIVE_INFINITY,
  whatsapp: 4096,
  telegram: 4096,
  slack: 3000,
};

/** Mensaje entrante normalizado. Cada adaptador traduce su payload nativo a esta forma. */
export interface AgentRequest {
  channel: Channel;
  /** ID estable en el canal de origen. Clave de idempotencia (dedup). */
  messageId: string;
  /** Remitente (wa_id / chatId / sessionId). */
  from: string;
  text: string;
  history?: { role: "user" | "assistant"; content: string }[];
  /** Metadatos crudos del canal. El dominio NO los usa. */
  raw?: Record<string, unknown>;
}

export interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

/** Respuesta del agente, agnóstica al transporte. */
export interface AgentResponse {
  answer: string;
  usage?: TokenUsage;
  latencyMs: number;
  /** true si se respondió sin contexto RAG por fallo/timeout de retrieve. */
  degraded: boolean;
  /** Presente solo si la moderación de salida bloqueó la respuesta. */
  blocked?: { reason: string };
}
```

El puerto de dominio expone `ask(req): Promise<AgentResponse>` y
`askStream(req): AskStreamHandle` (un `{ textStream: AsyncIterable<string>; reply: Promise<AgentResponse> }`).

### ADR-004 — GenerateFn sobre LLMProvider

`GenerateFn` es el puerto de salida de generación. El dominio depende de esta función, **nunca**
del SDK concreto. Se implementa sobre el cliente generado por `/llm-integration`
(que implementa `LLMProvider`: `complete` / `stream`) o sobre el SDK directo.

```typescript
export interface GenerateParams { system: string; prompt: string; model: string; signal?: AbortSignal; }
export interface GenerateResult { stream: AsyncIterable<string>; usage: Promise<TokenUsage | undefined>; }
export type GenerateFn = (params: GenerateParams) => Promise<GenerateResult>;

// Implementación sobre LLMProvider (cliente de /llm-integration):
const generate: GenerateFn = async ({ system, prompt, model, signal }) => {
  const stream = provider.stream({ model, messages: [{ role: "system", content: system },
                                                      { role: "user", content: prompt }], signal });
  // mapea StreamChunk → string y usa la API de usage del proveedor
  return { stream: mapDeltas(stream), usage: collectUsage(stream) };
};
```

---

## 1. Timeout / Deadline

El **retry interno del SDK del proveedor NO basta**: solo reintenta errores que el cliente clasifica
como transitorios, no impone un deadline de extremo a extremo y no cubre el `retrieve` (RAG). Sin un
deadline propio, una llamada colgada bloquea el handler del webhook hasta el timeout de plataforma
(p.ej. Vercel) y dispara reintentos de Meta/Telegram → trabajo duplicado. Define **tu** deadline.

```typescript
// Server-side only
export class TimeoutError extends Error {
  constructor(public readonly op: string) { super(`timeout:${op}`); this.name = "TimeoutError"; }
}

/** Rechaza con TimeoutError si `p` no resuelve en `ms`. ms no finito o <= 0 desactiva el deadline. */
export function withTimeout<T>(p: Promise<T>, ms: number, op: string): Promise<T> {
  if (!Number.isFinite(ms) || ms <= 0) return p;
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(op)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}
```

- `withTimeout` **no cancela** el trabajo subyacente salvo que aguas arriba se pase un `AbortSignal`
  (propágalo a `GenerateParams.signal` para abortar la conexión del SDK).
- Deadlines separados por operación: `retrieveTimeoutMs` corto (RAG es opcional, degrada),
  `llmTimeoutMs` más holgado (la generación es el camino crítico).

Defaults validados:

```typescript
export const DEFAULT_RESILIENCE = {
  llmTimeoutMs: 20_000,
  retrieveTimeoutMs: 5_000,
  retry: { retries: 2, baseDelayMs: 200, maxDelayMs: 2_000 },
} as const;
```

---

## 2. Retry con backoff exponencial + full jitter

Reintenta solo transitorios; corta de inmediato ante un error no-reintentable. Tras agotar `retries`,
propaga el último error. **Full jitter** (`delay = random(0, backoff)`) evita el thundering herd que
provoca el backoff fijo cuando muchos requests fallan a la vez.

```typescript
// Server-side only
/** Errores que NUNCA se reintentan: auth (401/403), validación (400/404/422), safety y abort. */
export function isNonRetriable(e: unknown): boolean {
  if (e instanceof SafetyError) return true; // bloqueo de moderación: reintentar es inútil
  const status = extractStatus(e);            // lee e.status / e.statusCode si existen
  if (status !== undefined && [400, 401, 403, 404, 422].includes(status)) return true;
  return (e as { name?: string })?.name === "AbortError"; // abort deliberado
}

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
```

| Reintentar | NO reintentar |
|------------|---------------|
| 429 (rate limit), 5xx, errores de red/timeout | 401 / 403 (auth) |
| | 400 / 404 / 422 (validación / request inválido) |
| | `SafetyError` (moderación) |
| | `AbortError` (cancelación deliberada) |

**Streaming vs completo:** el retry de la generación completa aplica en modo `ask` (WhatsApp / Telegram /
Slack / CLI / eval) donde aún no se entregó nada. En `askStream` (web) **no** se reintenta la generación:
ya se emitieron deltas al usuario; el deadline solo cubre la apertura del stream.

---

## 3. Circuit breaker

Antes de gastar en una llamada cara, comprueba el presupuesto. El **cost gate** actúa como circuit
breaker económico: envuelve la generación y, ante presupuesto agotado o degradación, hace fallback de
modelo (primario → más barato) o abre el circuito y rechaza rápido en vez de seguir quemando tokens.

```typescript
// Server-side only — el cost gate inyecta el `model` concreto (primario o fallback).
const { full, usage } = await deps.withGeneration("chat", (model) =>
  withRetry(
    () => withTimeout(collect(deps.generate, genParams(prepared, model)), deps.resilience.llmTimeoutMs, "generate"),
    deps.resilience.retry,
  ),
);
// withGeneration por defecto = withObservability("chat", () => withCostGate(fn))
```

El cost gate es la pieza de cableado real del proyecto. En el TEMPLATE se declara como dependencia
inyectable (`withGeneration`) con un default mínimo (identidad o `fn(model)`); el cableado contra el
gate real queda como TODO.

---

## 4. Graceful degradation (RAG caído → responder sin contexto)

Si `retrieve` falla o excede su deadline, **no abortes la respuesta**: degrada. Responde sin contexto
RAG usando un system prompt de fallback que instruye al modelo a ser cauto, marca `degraded: true` en
la respuesta y emite un evento estructurado para observabilidad.

```typescript
// Server-side only
const FALLBACK_SYSTEM =
  "Sos un asistente preciso. No hay contexto disponible en este momento; respondé con cautela " +
  "y aclará explícitamente si no podés confirmar algo.";

let context: RetrievedContext;
let degraded = false;
try {
  context = await withTimeout(
    deps.retrieve(safeInput, { topK: deps.topK }),
    deps.resilience.retrieveTimeoutMs,
    "retrieve",
  );
} catch (error) {
  degraded = true;
  deps.logEvent("rag_degraded", { reason: errName(error) }); // evento estructurado
  context = { systemPrompt: FALLBACK_SYSTEM, chunks: [] };    // sin fuentes
}
```

Una respuesta degradada (cauta, sin fuentes) es mejor que un error 500. El consumidor decide si lo
indica al usuario; el campo `degraded` lo hace observable.

---

## 5. Webhooks (WhatsApp / Telegram / Slack)

Los webhooks de canal exigen cinco defensas. Las cuatro primeras se validan por unit tests; el envío
real lo prueba el usuario con su cuenta.

### 5.1 Firma HMAC timing-safe

Verifica la firma del proveedor con HMAC-SHA256 sobre el **raw body** (no el JSON re-serializado) y
compara en **tiempo constante** (`timingSafeEqual`) para no filtrar información por timing. Rechaza si
falta el header o el secreto, o si la longitud difiere.

```typescript
// Server-side only
import { createHmac, timingSafeEqual } from "node:crypto";

/** Verifica X-Hub-Signature-256 de Meta: "sha256=" + HMAC-SHA256(rawBody, appSecret). */
export function verifySignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header || !appSecret) return false;
  const expected = "sha256=" + createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false; // timingSafeEqual exige igual longitud
  return timingSafeEqual(a, b);
}
```

El secreto (`appSecret`) viene de `process.env.*`, NUNCA hardcodeado. Lee el raw body antes de cualquier
parser de JSON del framework.

### 5.2 Idempotencia con tabla dedup (INSERT ON CONFLICT)

Los proveedores reentregan webhooks (at-least-once). Reclama cada `messageId` de forma **atómica** con
`INSERT ... ON CONFLICT DO NOTHING`: la PK garantiza exclusión mutua sin Redis. `rowCount === 1` →
mensaje nuevo, procesalo; `0` → duplicado, descártalo.

```typescript
// Server-side only
export type QueryFn = (text: string, params: unknown[]) => Promise<{ rowCount: number | null }>;

/** true si es nuevo (procesar), false si ya se vio (duplicado). */
export async function claimMessage(messageId: string, query: QueryFn): Promise<boolean> {
  const res = await query(
    "INSERT INTO wa_dedup (message_id) VALUES ($1) ON CONFLICT (message_id) DO NOTHING",
    [messageId],
  );
  return res.rowCount === 1;
}

/** GC perezoso: la ventana de reintentos del proveedor es de horas; 7 días es holgado. */
export async function gcDedup(query: QueryFn): Promise<void> {
  await query("DELETE FROM wa_dedup WHERE processed_at < now() - interval '7 days'", []);
}
```

`QueryFn` es inyectable → la idempotencia se testea con una query fake en memoria, sin Postgres real.

### 5.3 Ack inmediato + proceso async

Verifica firma → reclama idempotencia → responde **200 de inmediato** → procesa en background. Si tardas
en responder, el proveedor asume fallo y reentrega (más duplicados). El orden importa: rechaza firma
inválida con 403 ANTES de tocar la base; descarta duplicados con 200 (no reproceses).

```
POST /webhook
  → verifySignature(rawBody, header, env.APP_SECRET)   // 403 si falla
  → for msg of parseWebhook(payload):
       if (!await claimMessage(msg.messageId)) continue // duplicado → skip
       queue/await ask(msg)                             // proceso
  → 200 OK   (ack; no esperes a que termine la generación si la plataforma lo permite)
```

### 5.4 Límite por canal

Antes de enviar, **trunca** al `channelLimit` del canal (whatsapp/telegram 4096, slack 3000). El dominio
ya aplica el clamp en la `answer`; el adaptador de envío lo reasegura.

```typescript
// Server-side only
export async function sendWhatsApp(to: string, text: string): Promise<void> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const body = text.slice(0, channelLimit.whatsapp); // trunca al límite del canal
  if (!token || !phoneNumberId) {                    // sin credenciales → no-op logueado
    console.error(JSON.stringify({ event: "whatsapp_send_skipped", to, reason: "missing_credentials" }));
    return;
  }
  // fetch a la Graph API con Authorization: Bearer + body JSON ...
}
```

---

## Checklist de resiliencia

- [ ] `withTimeout` propio en retrieve y generate (no confiar solo en el SDK)
- [ ] `AbortSignal` propagado a `GenerateParams.signal` para cancelación real
- [ ] Retry con backoff exponencial + **full jitter**, lista de no-retriables explícita
- [ ] Sin retry de la generación en modo streaming (ya se emitieron deltas)
- [ ] Cost gate (circuit breaker) envuelve la generación con fallback de modelo
- [ ] RAG caído → degrada (`degraded: true`, system prompt de fallback, evento)
- [ ] Webhook: firma HMAC timing-safe sobre raw body, secreto en `process.env.*`
- [ ] Idempotencia con `INSERT ON CONFLICT DO NOTHING` (PK como candado)
- [ ] Ack inmediato (200) antes de procesar; 403 ante firma inválida
- [ ] Truncado al `channelLimit` antes de enviar
- [ ] Sin `any`; sin secretos hardcodeados; todo server-side
