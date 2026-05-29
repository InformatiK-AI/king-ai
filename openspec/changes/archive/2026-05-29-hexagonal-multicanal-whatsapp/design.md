# Design — Arquitectura hexagonal multicanal

> Fase: sdd-design · Change: hexagonal-multicanal-whatsapp · Fuente de verdad: king-ai/knowledge/domain/ai-agent-starter-pro-spec.md

## ADR-005 — Puerto de dominio + adaptadores de canal

**Contexto.** La orquestación vivía en el route handler web y terminaba en `toTextStreamResponse()` (browser-only). No reutilizable para mensajería.

**Decisión.** Hexagonal: el **dominio** (`lib/agent/ask.ts`) orquesta safety → retrieve → generación → moderación sin conocer el transporte. Los **adaptadores** de entrada (web SSE, webhook WhatsApp, CLI) traducen su canal a/desde el contrato canónico (`InboundMessage` / `AgentReply`). Las dependencias (retrieve, generate, guardInput, guardOutput) se **inyectan** → testeable sin Next ni SDK.

**Un puerto, dos modos (sin duplicar orquestación):**
- `askStream(input)` → web: emite deltas en vivo; resuelve la reply al cierre. Cost gate + observability + timeout-de-inicio.
- `ask(input)` → WhatsApp/CLI/eval: respuesta completa; timeout + retry sobre toda la generación; modera ANTES de entregar.
- Comparten `prepare()` (safety + retrieve degradable) y `finalize()` (moderación + reply). El puerto de salida `GenerateFn` devuelve `{ stream, usage }`; `ask` colapsa el stream con `collect()`.

## Puente con `LLMProvider` (ADR-004)

El standalone REAL usa `GenerateFn` sobre Vercel AI SDK (`streamText`) — es la referencia validada que compila. Los templates de king-ai conservan ese diseño y documentan que `GenerateFn` se implementa **sobre un `LLMProvider`** (el cliente de `/llm-integration`: `complete`/`stream`) o sobre el SDK directo. Así se cierra la divergencia histórica (el starter no usaba `LLMProvider`) sin reescribir lo ya probado: un adaptador `providers/llmprovider-adapter.ts` muestra el puente.

## Capa de resiliencia (`lib/agent/resilience.ts`)

- `withTimeout(p, ms, op)`: deadline vía `Promise.race`; no cancela el trabajo subyacente salvo `AbortSignal`.
- `withRetry(fn, cfg)`: backoff exponencial + full jitter; corta ante `isNonRetriable` (401/403/404/422/SafetyError/AbortError).
- Aplicación: `retrieve` bajo timeout → fallo = degradación (no retry); `generate` bajo timeout+retry; el cost gate hace fallback de modelo tras agotar reintentos.

## Adaptador WhatsApp

- **Firma** `X-Hub-Signature-256` (HMAC-SHA256 + `timingSafeEqual`) sobre el raw body — rechaza payloads no firmados.
- **Idempotencia**: `claimMessage` con `INSERT INTO wa_dedup ... ON CONFLICT DO NOTHING` (atómico, sin Redis); `rowCount===1` ⇒ procesar.
- **Ack inmediato** (200 OK) + `void handleMessage()` async para no exceder el timeout de reintento de Meta.
- **Límite por canal**: `clampLength(answer, channelLimit.whatsapp=4096)`.

## Trade-offs (decididos)

1. **Moderación en streaming web**: `guardOutput` evalúa al cierre; en web los deltas ya salieron → se acepta (rule-based sobre dataset propio). WhatsApp queda seguro (modo completo modera antes de enviar).
2. **Async ligero en serverless**: tras 200 OK, Vercel puede congelar `handleMessage`; mitigación documentada `ctx.waitUntil()`; evolución: cola dedicada.
3. **Dedup fail-open**: si el INSERT falla, se procesa igual (un duplicado es mejor que silencio; Meta reintenta poco).
4. **Timeout sin cancelación real** salvo `AbortSignal` (documentado).
5. **CRLF/HMAC**: `.gitattributes` fuerza `*.ts eol=lf` para que el digest de firma sea estable cross-plataforma.
