# `ai-agent-starter-pro` Template Spec

> **NOTA — Esto es la ESPECIFICACIÓN del template, no el template.**
> Este documento define el contrato del repositorio `ai-agent-starter-pro`: stack,
> features, criterios de activación y de testing. El **repositorio en sí está FUERA
> de scope de M03**: se genera como tarea separada únicamente cuando los 5 skills
> M-87 (`/rag-setup`, `/ai-safety`, `/prompt-eval`, `/ai-cost-gate`,
> `/ai-observability`) estén en estado **DONE verificado**. M14 (Business Model)
> consume esta spec para el marketplace de templates. Mientras tanto, este archivo
> es la fuente de verdad que cualquier generador (humano o agente) debe respetar.

---

## Overview

`ai-agent-starter-pro` es el template de referencia del plugin `king-ai`: un
starter productivo para construir agentes LLM con RAG, evaluación, safety y
observabilidad ya cableados. No es un "hello world" — es el punto de partida que
demuestra TODOS los patterns que los skills M-87 implementan, integrados en un solo
proyecto desplegable.

El objetivo es que un desarrollador clone el repo y, en menos de 5 pasos, tenga un
agente RAG funcional con evals, safety gates y trazas de costo/latencia, listo para
deploy en Vercel.

**Fuente original**: `10-vertical-coverage.md §V8 §7.2`.
**Plugin destino**: `king-ai`.
**Consumidor**: M14 (Business Model) → marketplace de templates.

---

## Stack del Template

El stack es FIJO y opinado. No es negociable por proyecto generado: el valor del
template está en que todas las piezas ya encajan entre sí.

| Capa | Tecnología | Rol |
|------|-----------|-----|
| Lenguaje | **TypeScript** | Tipado estricto end-to-end; structured outputs con Zod |
| Orquestación LLM | **Vercel AI SDK** | Streaming, tool calling, structured outputs unificados |
| Proveedor LLM | **Anthropic SDK** | Claude como modelo primario; routing a Haiku para fallback de costo |
| Vector store | **pgvector** | Embeddings y similarity search dentro de Postgres (sin DB extra) |
| Base de datos | **Postgres** | Persistencia de documentos, chunks, evals y audit ledger |
| Framework web | **Next.js 15 (App Router)** | API routes, RSC, streaming UI, deploy 1-click en Vercel |

```
┌──────────────────────────────────────────────────────────────────┐
│                  ai-agent-starter-pro — Arquitectura               │
└──────────────────────────────────────────────────────────────────┘

   Next.js 15 (App Router)
        │
        │  route handler / RSC
        ▼
   ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
   │ AI Safety    │─────▶│  RAG Pipeline │─────▶│  Anthropic   │
   │ Layer        │      │  (Vercel AI   │      │  SDK (Claude)│
   │ (pre + post) │      │   SDK)        │      │              │
   └──────────────┘      └──────┬───────┘      └──────┬───────┘
        │                       │                     │
        │ pii redaction         │ retrieve            │ cost/latency
        │ jailbreak block       ▼                     ▼
        │                ┌──────────────┐      ┌──────────────┐
        │                │  pgvector /   │      │  Cost Gate +  │
        │                │  Postgres     │      │ Circuit Break │
        │                └──────────────┘      └──────────────┘
        │                                              │
        └──────────────────────┬───────────────────────┘
                               ▼
                    ┌─────────────────────────┐
                    │  Observability           │
                    │  (Langfuse + OTel spans) │
                    └─────────────────────────┘
                               │
                               ▼
                    ┌─────────────────────────┐
                    │  Eval Harness (golden    │
                    │  set + CI regression)    │
                    └─────────────────────────┘
```

---

## Features del Template

Cada feature del template está respaldada por un skill que la genera. El template
es, en esencia, el output combinado de los skills M-87 más patterns existentes.

| Feature | Implementado con skill | Status |
|---------|------------------------|--------|
| RAG pipeline funcional | `/rag-setup` | Generado |
| Eval harness | `/prompt-eval` | Generado |
| AI safety layer | `/ai-safety` | Generado |
| Observability (Langfuse + OTel) | `/ai-observability` | Generado |
| Cost tracking + circuit breaker | `/ai-cost-gate` | Generado |
| Cost attribution report | `/cost-report` | Generado |
| Structured outputs (Zod) | `/llm-integration` | Existente |
| Prompt versioning en `prompts/` | Todos los skills | Pattern |
| CASTLE gates preconfigurados | Template `.king/` | Generado |
| CI con eval regression detection | `/prompt-eval` | Generado |
| Deploy Vercel 1-click | Vercel config en template | Manual |

### Notas sobre las columnas Status

- **Generado** — el artefacto sale directamente del skill correspondiente cuando se
  ejecuta sobre el scaffold del template.
- **Existente** — el pattern ya vive en `king-ai` (`/llm-integration`) y solo se
  referencia; no requiere M-87 nuevo.
- **Pattern** — convención transversal que TODOS los skills respetan (versionado de
  prompts en `prompts/<nombre>.vN.md`).
- **Manual** — paso que el desarrollador ejecuta una sola vez (conectar el repo a
  Vercel); el template incluye el `vercel.json` listo.

---

## Criterio de Activación

El repositorio NO se genera hasta cumplir la precondición. Esto evita publicar un
template que muestre features a medio implementar.

> **Activación**: cuando `/rag-setup` + `/ai-safety` + `/prompt-eval` +
> `/ai-cost-gate` + `/ai-observability` estén **TODOS** en estado **DONE
> verificado**, se lanza la tarea de generación del repo `ai-agent-starter-pro`.

```yaml
# Precondición de generación (gate de activación)
activation:
  required_skills_done:
    - "/rag-setup"
    - "/ai-safety"
    - "/prompt-eval"
    - "/ai-cost-gate"
    - "/ai-observability"
  verification: "DONE verificado"   # no basta con merge; requiere verify pass
  on_satisfied: "lanzar tarea de generación del repositorio del template"
  scope: "FUERA de M03"             # el repo es entregable posterior
```

Mientras la precondición no se cumpla, este knowledge file es el único entregable
relacionado con el template dentro de M03.

---

## Criterios de Testing del Template

El template generado se considera VÁLIDO solo si pasa los 4 criterios. Son
deliberadamente ejecutables desde un clone limpio: la promesa del template es
"funciona out of the box".

| # | Comando | Criterio de pass | Qué verifica |
|---|---------|------------------|--------------|
| 1 | `npm run demo` | respuesta RAG en **< 10 seg** desde clone limpio | El pipeline ingest→retrieve→generate vive de extremo a extremo |
| 2 | `npm run eval` | `golden_set_score >= 0.85` reportado en CI | Calidad de las respuestas sobre el golden set |
| 3 | `npm run test:safety` | `jailbreak_block_rate >= 95%` | El safety layer bloquea ataques conocidos (OWASP LLM Top 10) |
| 4 | `npm run build` | **0 errores** TypeScript | Tipado estricto sin deuda; structured outputs válidos |

```yaml
# Suite de validación del template — los 4 criterios deben pasar
template_acceptance:
  - id: 1
    cmd: "npm run demo"
    pass: "rag_response_seconds < 10"
  - id: 2
    cmd: "npm run eval"
    pass: "golden_set_score >= 0.85"
  - id: 3
    cmd: "npm run test:safety"
    pass: "jailbreak_block_rate >= 95"
  - id: 4
    cmd: "npm run build"
    pass: "typescript_errors == 0"
```

> Estos criterios son un subconjunto ejecutable de los gates `ai:` de
> `.king/quality-gates.yaml` (`eval.golden_set_score: 0.85`,
> `safety.jailbreak_block_rate: 95`). El template los hereda preconfigurados.

---

## Setup en ≤ 5 Pasos

La promesa de DX del template: de clone a agente RAG funcional en cinco pasos.

```bash
# 1. Clonar e instalar dependencias
git clone https://github.com/king-framework/ai-agent-starter-pro
cd ai-agent-starter-pro && npm install

# 2. Configurar variables de entorno (Anthropic + Postgres)
cp .env.example .env.local
#    Editar: ANTHROPIC_API_KEY, DATABASE_URL (Postgres con pgvector)

# 3. Levantar Postgres con pgvector y migrar el esquema
docker compose up -d        # incluye extensión pgvector
npm run db:migrate          # crea tablas: documents, chunks, evals, audit

# 4. Ingerir el dataset de ejemplo (genera embeddings)
npm run ingest -- ./data/sample

# 5. Probar el agente RAG end-to-end
npm run demo                # < 10 seg → respuesta con citaciones
```

Tras el paso 5, el desarrollador tiene RAG, evals (`npm run eval`), safety
(`npm run test:safety`) y observabilidad (trazas Langfuse/OTel) operativos. El
deploy a Vercel es el único paso manual adicional, ya con `vercel.json` incluido.

---

## Layout esperado del repositorio

Estructura de referencia que el generador debe producir (no exhaustiva, pero los
directorios marcados son contractuales).

```
ai-agent-starter-pro/
├── app/                        # Next.js 15 App Router (adaptadores delgados)
│   ├── api/chat/route.ts       # adaptador web → askStream() del dominio
│   ├── api/whatsapp/route.ts   # adaptador WhatsApp (firma + dedup) → ask()
│   └── page.tsx                # UI mínima de demo
├── lib/
│   ├── agent/                  # PUERTO DE DOMINIO (hexagonal, agnóstico al transporte)
│   │   ├── ask.ts              # ask() / askStream(); orquesta safety→retrieve→gen→moderación
│   │   ├── types.ts            # contrato canónico: Channel, AgentRequest, AgentResponse, GenerateFn
│   │   ├── resilience.ts       # withTimeout / withRetry (backoff + jitter)
│   │   ├── providers/ai-sdk.ts # adaptador de salida: GenerateFn sobre Vercel AI SDK (ADR-004)
│   │   └── whatsapp/           # helpers de canal: verify (firma), dedup (idempotencia), parse, send
│   ├── rag/                    # ingest, chunking, retrieve (pgvector)
│   ├── safety/                 # pre/post guards (pii, jailbreak)
│   ├── cost/                   # cost gate + circuit breaker
│   └── observability/          # langfuse-client.ts | otel spans
├── prompts/                    # prompts versionados: <nombre>.vN.md
├── eval/
│   └── golden-set/v1/cases.json   # golden set (convención /prompt-eval, ver llm-evals.md)
├── tests/ai-safety/
│   └── adversarial-prompts.json   # casos adversariales (convención /ai-safety)
├── db/migrations/              # esquema documents/chunks/evals/audit
├── .king/                      # CASTLE gates + quality-gates.yaml preconfig
├── docker-compose.yml          # Postgres + pgvector
├── vercel.json                 # deploy 1-click
└── package.json                # scripts: demo, eval, test:safety, build, ingest
```

> Convención transversal (**Pattern**): cada prompt vive en `prompts/` con sufijo de
> versión (`router.v3.md`), y cada skill que lo consume referencia la versión exacta.
> Esto habilita la detección de regresión de evals al cambiar de versión de prompt.

---

## ADR-005: Arquitectura hexagonal + multicanal

> **Estado**: Aceptado. **Refleja** el standalone YA VALIDADO en `lib/agent/*`
> (`ask.ts`, `types.ts`, `resilience.ts`, `providers/ai-sdk.ts`, `whatsapp/*`).
> Esta sección no propone un diseño nuevo: documenta el que ya pasó los gates.

### Contexto

Un agente productivo no vive solo detrás de un `<input>` web. Tarde o temprano
entran WhatsApp, Telegram, Slack o un CLI. Si la orquestación (safety → retrieve →
generación → moderación) se escribe DENTRO del route handler de Next, cada canal
nuevo obliga a duplicar — y a divergir — esa lógica. El resultado es que el "cerebro"
del agente se fragmenta por transporte y la robustez (timeout, retry, degradación)
queda inconsistente entre canales.

### Decisión

El **dominio del agente** vive en `lib/agent/` y es **agnóstico al transporte**: no
importa Next, HTTP ni el SDK del proveedor. Expone un único puerto:

```ts
// lib/agent/index.ts — fachada del dominio
ask(input: InboundMessage, overrides?: Partial<AskDeps>): Promise<AgentReply>
askStream(input: InboundMessage, overrides?: Partial<AskDeps>): Promise<AskStreamHandle>
```

- `ask()` — **modo completo** (WhatsApp / Telegram / Slack / CLI / eval): genera la
  respuesta entera, con timeout + retry sobre toda la generación, y **modera ANTES**
  de entregar. Canal seguro por construcción.
- `askStream()` — **modo streaming** (web): emite deltas en vivo (`textStream`) y
  resuelve la `reply` completa (usage, latency, sources, moderación final) al cerrar
  el stream. El retry NO aplica una vez que ya se emiten deltas al usuario.

Los **route handlers son adaptadores delgados**: traducen el payload nativo del canal
a `InboundMessage`, llaman al puerto, y traducen `AgentReply`/`textStream` de vuelta a
la respuesta del canal. No contienen lógica de negocio.

- `app/api/chat/route.ts` — adaptador de ENTRADA web sobre `askStream()`.
- `app/api/whatsapp/route.ts` — adaptador de ENTRADA WhatsApp (webhook Meta) sobre
  `ask()`; añade firma → parse → ack inmediato → proceso async + dedup, pero reutiliza
  el **mismo cerebro**. Es el ejemplo de referencia para sumar Telegram/Slack/CLI.

El dominio recibe sus dependencias por **inyección** (`AskDeps`): `retrieve`,
`generate`, `guardInput`, `guardOutput`, `withGeneration` (cost gate + observability)
y `resilience`. Los defaults cablean el wiring real; los tests pasan mocks/identidad.

### Contrato canónico (`lib/agent/types.ts`)

```ts
export type Channel = "web" | "whatsapp" | "telegram" | "slack" | "cli";

// Límite de longitud de respuesta por canal (caracteres). El dominio recorta antes de entregar.
export const channelLimit: Record<Channel, number> = {
  web: Number.POSITIVE_INFINITY,
  cli: Number.POSITIVE_INFINITY,
  whatsapp: 4096,
  telegram: 4096,
  slack: 3000,
};

// Mensaje entrante normalizado. Cada adaptador traduce su payload nativo a esta forma.
export interface AgentRequest {
  channel: Channel;
  messageId: string;          // ID estable del canal → clave de idempotencia
  from: string;               // remitente (wa_id / sessionId)
  text: string;
  history?: { role: "user" | "assistant"; content: string }[];
  raw?: Record<string, unknown>;  // metadatos crudos; el dominio NO los usa
}

// Respuesta agnóstica al transporte. Cada adaptador la traduce a su canal.
export interface AgentResponse {
  answer: string;
  usage?: TokenUsage;
  latencyMs: number;
  degraded: boolean;          // true si se respondió sin contexto RAG (degradación graceful)
  blocked?: { reason: string };  // presente solo si la moderación de salida bloqueó
}

// Puerto de salida de generación. El dominio depende de esta fn, nunca del SDK concreto.
export type GenerateFn = (params: {
  system: string; prompt: string; model: string; signal?: AbortSignal;
}) => Promise<{ stream: AsyncIterable<string>; usage: Promise<TokenUsage | undefined> }>;
```

> **ADR-004 (LLMProvider)** — `GenerateFn` es el puerto de salida de generación. Se
> implementa sobre el cliente generado por `/llm-integration` (que implementa
> `LLMProvider`: `complete()` / `stream()`) o, como en el standalone, directamente
> sobre el SDK (`providers/ai-sdk.ts` mapea `streamText` de Vercel AI SDK a
> `GenerateFn`). Cambiar de proveedor = cambiar ese único adaptador.

### Consecuencias

- Un canal nuevo = un adaptador nuevo, **cero** cambios en el dominio.
- La robustez esencial (timeout, retry, degradación, firma, idempotencia, límite por
  canal) vive **en el dominio**, no en cada handler → consistente entre transportes.
- Testabilidad: el dominio se prueba inyectando deps sin levantar HTTP ni proveedor.

---

## Ejemplo: endpoint de chat (adaptador delgado sobre `askStream`)

El route handler **no** llama `streamText` directo: delega en el puerto de dominio
`askStream()`. Toda la orquestación (safety → RAG → generación + cost gate +
observability → moderación) vive en `lib/agent/ask.ts`. El handler solo traduce
HTTP ↔ contrato canónico.

```typescript
// app/api/chat/route.ts
// Server-side only
// Template generado por /ai-feature-scaffold — adaptar imports según tu stack
import { randomUUID } from "node:crypto";
import { askStream } from "@/lib/agent";
import { SafetyError } from "@/lib/safety";

// pg + embeddings locales requieren runtime Node (no edge).
export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  let message: string;
  try {
    const body = (await req.json()) as { message?: unknown };
    message = String(body.message ?? "");
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!message.trim()) {
    return Response.json({ error: "empty_message" }, { status: 400 });
  }

  // Traducción HTTP → contrato canónico (AgentRequest). Sin lógica de negocio aquí.
  let handle;
  try {
    handle = await askStream({
      channel: "web",
      messageId: randomUUID(),
      from: "web",
      text: message,
    });
  } catch (error) {
    if (error instanceof SafetyError) {
      return Response.json({ error: error.reason }, { status: 403 });
    }
    throw error;
  }

  // La reply completa (usage, degraded, moderación final) se resuelve al drenar el
  // stream; el cliente web solo consume texto plano, así que la observamos de fondo.
  void handle.reply.catch(() => undefined);

  return new Response(toReadableStream(handle.textStream), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
```

> El adaptador WhatsApp (`app/api/whatsapp/route.ts`) sigue el mismo patrón sobre
> `ask()`: verifica la firma `X-Hub-Signature-256` (HMAC timing-safe), hace ack
> inmediato (< 30 s), y procesa async con claim de idempotencia
> (`INSERT ... ON CONFLICT DO NOTHING`) antes de invocar el mismo dominio.

---

## Gates heredados (referencia)

El template preconfigura la sección `ai:` de `.king/quality-gates.yaml`. Los 4
criterios de testing son la materialización ejecutable de estos gates.

```yaml
# .king/quality-gates.yaml — sección heredada por el template
ai:
  cost:
    usd_per_request_p95: 0.05
  latency:
    p95_ms: 3000
  eval:
    golden_set_score: 0.85
  safety:
    jailbreak_block_rate: 95
    pii_leak_rate: 0
  observability:
    tracing_coverage_pct: 100
  channel:
    webhook_signature_verified: true   # todo webhook entrante verifica firma (HMAC timing-safe)
    idempotency_coverage_pct: 100      # todo mensaje se de-duplica por messageId antes de procesar
  resilience:
    request_timeout_ms: 20000          # deadline por defecto de generación (DEFAULT_RESILIENCE.llmTimeoutMs)
    timeout_coverage_pct: 100          # retrieve y generate corren siempre con deadline
    retry_backoff: required            # backoff exponencial + full jitter en modo completo (ask)
    graceful_degradation: required     # fallo/timeout de retrieve → responder sin contexto, degraded: true
  enforcement: block
```

### Robustez esencial (en CÓDIGO) vs. caminos de evolución (DOCUMENTADOS)

La robustez **esencial** del agente NO es opcional ni un gate ceremonial: vive en el
código del dominio y los adaptadores, y los gates `ai.channel` / `ai.resilience` la
materializan.

- **timeout** — `withTimeout()` envuelve `retrieve` y `generate` (`resilience.ts`).
- **retry** — `withRetry()` con backoff exponencial + full jitter en modo completo
  (`ask`); corta ante errores no-reintentables (safety, 4xx, abort).
- **degradación graceful** — si `retrieve` falla/expira, se responde con el
  `fallbackSystemPrompt` y `degraded: true`, sin romper la conversación.
- **firma de webhook** — `verifySignature()` (HMAC-SHA256 timing-safe) rechaza
  payloads no firmados por el canal.
- **idempotencia** — `claimMessage()` reclama el `messageId` atómicamente
  (`INSERT ... ON CONFLICT DO NOTHING`) → procesamiento exactly-once por mensaje.
- **límite por canal** — `channelLimit` recorta la respuesta a la longitud máxima del
  canal antes de entregarla.

En cambio, las siguientes capacidades se documentan como **caminos de evolución** (no
se implementan en el template; el dominio queda listo para enchufarlas):

- **rate limiting** por remitente/IP (token bucket en edge o middleware).
- **colas dedicadas** para el procesamiento async de webhooks (hoy: `void handle...`
  con `ctx.waitUntil()` en serverless; evolución: cola + workers).
- **multi-tenancy** (aislamiento de datos/cuotas por tenant).
- **sesiones** persistentes y memoria conversacional (hoy `history?` es opcional y
  stateless; el campo `from` ya habilita la futura clave de sesión).
- **LLM-as-judge** para evaluación continua (complementa el golden set offline).

---

## Resumen ejecutable

| Aspecto | Valor |
|---------|-------|
| Naturaleza de este doc | SPEC del template (repo fuera de scope de M03) |
| Stack | TypeScript · Vercel AI SDK · Anthropic SDK · pgvector · Postgres · Next.js 15 |
| Features generadas | 11 (RAG, evals, safety, observability, cost, audit, etc.) |
| Activación | 5 skills M-87 en DONE verificado |
| Criterios de testing | 4 (demo <10s · eval ≥0.85 · safety ≥95% · build 0 errores) |
| Setup | ≤ 5 pasos hasta RAG funcional |
| Consumidor | M14 Business Model (marketplace de templates) |
