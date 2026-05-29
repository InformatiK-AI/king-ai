---
name: ai-feature-scaffold
version: 2.0
description: "Skill para generar features AI-powered en proyectos del usuario. Usar cuando se necesite: generar chatbot con SSE, agregar búsqueda semántica, implementar RAG con pgvector, crear endpoint de AI, scaffold de feature de inteligencia artificial."
---

# /ai-feature-scaffold — AI Feature Scaffold

Skill standalone para generar features AI-powered (chatbot, semantic search, RAG) en el proyecto del usuario, produciendo código tipado con adapter pattern, tests incluidos y configuración de entorno.

## QUICK REFERENCE

### BLOCKING CONDITIONS
> ⛔ Si alguna es TRUE, DETENER inmediatamente

- [ ] No se especificó tipo de feature (chatbot / semantic-search / rag) — preguntar antes de continuar
- [ ] El proyecto detectado no es TypeScript (ver Fase 1 — advertir y preguntar, NO abortar automáticamente)

### ABSOLUTE RESTRICTIONS
> 🚫 Comportamientos absolutamente prohibidos — sin excepciones

- NUNCA generar código LLM client-side — siempre server-side
- NUNCA sobreescribir archivos del proyecto del usuario sin confirmación
- NUNCA generar código RAG sin haber confirmado el ORM del usuario (Prisma/Drizzle/pg raw)
- NUNCA hardcodear API keys o URLs de vector DB
- Si no hay configuración LLM detectada: advertir y ofrecer stubs (ADR-003), NUNCA abortar en silencio

### REQUIRED OUTPUTS
> 📦 Archivos que DEBEN crearse al finalizar

- [ ] Archivos del feature generados en el proyecto del usuario
- [ ] Test file incluido en cada feature generado
- [ ] (chatbot / multicanal) Puerto de dominio hexagonal: `agent/types.ts`, `agent/ask.ts`, `agent/resilience.ts`
- [ ] (chatbot / multicanal con canal WhatsApp) Adaptador de entrada: `channels/whatsapp/*` + `migrations/create_webhook_dedup.sql`
- [ ] `.env.example` actualizado con variables del feature
- [ ] Session document creado

### PHASES OVERVIEW
```
Phase 0        Phase 1-2          Phase 3-4          Phase N+1
(Load)   →   (DISCOVERY.md)   →  (GENERATION.md) →  (Session)
             Stack detection       Code generation
             Feature config        Security validation
```

---

## CASTLE ACTIVO: C·A·S·T·_·_

- **C (Contracts)**: Código generado usa interfaz `LLMProvider` (ADR-004) — nunca el provider directamente
- **A (Architecture)**: Hexagonal + adaptador multicanal (ADR-005) — puerto de dominio (`agent/ask.ts`) separado de adaptadores de entrada (web SSE, webhook WhatsApp); adapter pattern `complete()`, `stream()`, `getCapabilities()`; código server-side únicamente
- **S (Security)**: firma de webhook (HMAC timing-safe) + idempotencia + sin secretos hardcodeados
- **T (Testing)**: Test file incluido en cada feature; security gate en Fase 4 antes de finalizar

---

## AGENTES INVOLUCRADOS

- **@developer** — Generación de código, templates, actualización de `.env.example`
- **@ml-engineer** — Validación de LLM patterns, elección de embeddings, configuración de vector DB
- **@security** — Verificación de templates generados (sin keys hardcodeadas, filtros de acceso)

---

## PHASE ROUTER

> **Excepción v2.0 documentada**: Este skill usa PHASE ROUTER con carga modular por sub-archivos.
> Justificación: entry point ~500 tokens; carga total ~1800 tokens.
> Los sub-archivos se cargan on-demand según la fase activa.

| Fase | Sub-archivo |
|------|-------------|
| Phase 1: Stack Detection + Phase 2: Feature Configuration | [DISCOVERY.md](DISCOVERY.md) |
| Phase 3: Code Generation + Phase 4: Security Validation | [GENERATION.md](GENERATION.md) |

---

## Phase 0: Session (session-management)

### MUST DO
1. [ ] Cargar `.king/registry.md` — detectar si hay workflow activo en el branch actual
2. [ ] Si standalone (sin workflow activo): continuar sin asociación a workflow
3. [ ] Si invocado desde `/build` o `/llm-integration`: heredar workflow context existente

> Delegado a `skills/session-management/SKILL.md` → Phase 0

---

## FINAL CHECKPOINT

Antes de terminar, verificar:

- [ ] Feature code generado en el proyecto del usuario
- [ ] Test file incluido y funcional
- [ ] Security gate básico pasado (sin API keys hardcodeadas)
- [ ] `.env.example` actualizado con variables del feature
- [ ] Session document creado en `.king/sessions/`
- [ ] Resumen de archivos presentado al usuario con próximos pasos

---

## Phase N+1: Write Session

> Delegado a `skills/session-management/SKILL.md` → Phase N+1

---

## Phase N+2: Guide Next Step

| Condición | Próximo Skill |
|-----------|---------------|
| Feature generada | `/build` — implementar lógica de negocio sobre el scaffold |
| Integración LLM no configurada | `/llm-integration` — configurar provider primero |

---

## REFERENCE

> 📚 Información adicional. Esta sección NO contiene acciones.

### ADR-003: Soft prerequisite

Si no se detecta configuración LLM en el proyecto, el skill NO aborta. Advierte al usuario y ofrece continuar generando código con imports que el usuario deberá ajustar.
`/llm-integration` es el skill recomendado para configurar el cliente LLM antes de ejecutar `/ai-feature-scaffold`.

### ADR-004: Adapter Pattern

El código generado usa exclusivamente la interfaz `LLMProvider`, no el provider directamente.
La firma coincide con el cliente real de `shared/llm-provider.ts` generado por `/llm-integration`:

```typescript
interface LLMProvider {
  complete(messages: Message[], options?: CompletionOptions): Promise<CompletionResult>;
  stream(messages: Message[], options?: CompletionOptions): AsyncIterable<string>;
  getCapabilities(): ProviderCapabilities;
  getSessionUsage(): TokenUsage;
  calculateCostUSD(usage: TokenUsage): number;
}
```

El puerto de generación del dominio (`GenerateFn`) se implementa sobre este `LLMProvider`
(ver `templates/agent/providers/llmprovider-adapter.ts`) o sobre el SDK del proveedor directamente.

### ADR-005: Arquitectura Hexagonal + Adaptador Multicanal

El código generado para chatbot/multicanal separa el **puerto de dominio** del agente
(`agent/ask.ts`, que expone `ask(req): Promise<AgentResponse>` y `askStream(req): AskStreamHandle`)
de los **adaptadores de entrada** (web SSE, webhook WhatsApp). El dominio NO conoce el transporte:
cada canal traduce su payload nativo a/desde el contrato canónico `AgentRequest` / `AgentResponse`
(`agent/types.ts`), y un mismo cerebro sirve a todos los canales.

El dominio recibe sus dependencias por **inyección** (`retrieve`, `generate`, `guardInput`,
`guardOutput`, `resilience`); el puerto `GenerateFn` se implementa sobre `LLMProvider` (ADR-004) o
sobre el SDK del proveedor directamente. La **robustez esencial** vive en el código generado, no en
el prompt: timeout en llamadas a LLM/retrieve, retry con backoff exponencial + jitter, degradación
graceful de RAG, verificación de firma de webhook (HMAC timing-safe), idempotencia por `messageId` y
truncado de respuesta por canal (`channelLimit`).

Refleja el agente standalone ya validado (`lib/agent/*`). Ver [GENERATION.md](GENERATION.md) →
bloque de generación de `agent/` y `channels/whatsapp/`.

### Knowledge Injection

| Archivo | Propósito | Requerido | Fuente |
|---------|-----------|-----------|--------|
| `knowledge/_inject/llm-integration-essentials.md` | LLM providers, streaming, cost tracking | No | framework |
| `knowledge/_inject/testing-essentials.md` | Test patterns para código generado | No | framework |
| `knowledge/_inject/resilience-patterns.md` | Timeout, retry/backoff, degradación graceful, firma webhook, idempotencia | Sí (chatbot-multicanal) | framework |
