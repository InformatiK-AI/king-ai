# architecture-layers — Delta Spec

> Orden de guardas y contratos de módulos. Capability del change a7-3. Ilustrativo en la spec, normativo aquí en el orden.

## ADDED Requirements

### Requirement: Orden de guardas en el route handler

`app/api/chat/route.ts` MUST aplicar las capas en este orden exacto: (1) Safety PRE (`guardInput`: PII redaction +
jailbreak block) ANTES de tocar el modelo → (2) RAG retrieve sobre pgvector → (3) generación envuelta en cost gate
(circuit breaker → fallback a Haiku) y observability (traza) → (4) Safety POST (`guardOutput`: moderation) sobre la salida.

#### Scenario: Orden de guardas respetado
- **GIVEN** una request POST a `/api/chat`
- **WHEN** se procesa el mensaje
- **THEN** `guardInput` corre antes de cualquier llamada al modelo
- **AND** `retrieve` corre después de `guardInput` y antes de `streamText`
- **AND** la generación está envuelta por `withCostGate` y `withObservability`
- **AND** `guardOutput` corre sobre el resultado antes de responder

### Requirement: Contratos de los módulos lib/

Cada módulo MUST exponer su interfaz contractual:
- `lib/rag`: `ingest(path)`, `retrieve(query, {topK})` → contexto con citaciones, sobre pgvector.
- `lib/safety`: `guardInput(text)` → texto seguro (pii_leak_rate 0) | `guardOutput(stream)` → stream moderado.
- `lib/cost`: `withCostGate(fn)` → ejecuta fn con budget check + circuit breaker + fallback Haiku.
- `lib/observability`: `withObservability(fn)` → envuelve fn con span (Langfuse + OTel).

#### Scenario: Interfaces presentes y tipadas
- **GIVEN** el repo generado
- **WHEN** `tsc` type-checkea los imports del route handler
- **THEN** las 4 firmas resuelven sin error de tipos

### Requirement: Stack fijo y opinado

El repo MUST usar el stack exacto: Next.js 15 (App Router), Vercel AI SDK (`ai`), `@ai-sdk/anthropic`, pgvector sobre
Postgres, TypeScript estricto, Zod para structured outputs. NO MUST sustituirse por alternativas.

#### Scenario: Dependencias correctas
- **GIVEN** `package.json`
- **WHEN** se inspeccionan dependencies
- **THEN** incluye `next@15`, `ai`, `@ai-sdk/anthropic`, `zod`, cliente Postgres + pgvector
