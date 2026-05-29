---
name: llm-integration
version: 2.0
description: "Skill para integrar LLM providers (Claude/OpenAI/Gemini) en proyectos del usuario. Usar cuando se necesite: integrar Claude API, configurar OpenAI, agregar Gemini, setup de streaming SSE, configurar prompt caching, implementar cost tracking."
---

# /llm-integration — LLM Provider Integration

Skill standalone para configurar un LLM provider (Claude, OpenAI o Gemini) en el proyecto del usuario, generando cliente tipado, SSE handler, cost tracking y schema SQL de usage.

## QUICK REFERENCE

### BLOCKING CONDITIONS
> ⛔ Si alguna es TRUE, DETENER inmediatamente

- [ ] No se especificó provider (Claude / OpenAI / Gemini) — preguntar antes de continuar
- [ ] Provider especificado vía `--provider` no está en la lista soportada → reportar error y abortar:
  `"Proveedor no soportado. Disponibles: [anthropic, openai, gemini]"` — no generar código parcial
- [ ] El proyecto detectado no es TypeScript/JavaScript — advertir y preguntar (ver Fase 1)

### ABSOLUTE RESTRICTIONS
> 🚫 Comportamientos absolutamente prohibidos — sin excepciones

- NUNCA hardcodear API keys — solo `process.env.ANTHROPIC_API_KEY`, `process.env.OPENAI_API_KEY`, `process.env.GOOGLE_API_KEY`
- NUNCA generar código LLM client-side (browser bundle) — siempre server-side
- NUNCA sobreescribir archivos existentes del proyecto del usuario sin confirmación explícita
- NUNCA hacer retry en errores 401/403 — son errores de autenticación permanentes

### REQUIRED OUTPUTS
> 📦 Archivos que DEBEN crearse al finalizar

- [ ] `{destino}/{provider}-client.ts` — Cliente LLM tipado con adapter pattern
- [ ] `{destino}/sse-handler.ts` — SSE handler compartido
- [ ] `{destino}/cost-tracking/token-counter.ts` — Cost tracking
- [ ] `src/db/migrations/create_llm_usage.sql` — Schema SQL de usage
- [ ] `.env.example` actualizado con variables del provider
- [ ] Session document creado (via session-management Phase N+1)

### PHASES OVERVIEW
```
Phase 0        Phase 1-2          Phase 3-4          Phase N+1
(Load)   →   (PROVIDER-SETUP)  →  (IMPLEMENTATION) →  (Session)
             Stack detection       Code generation
             Provider config        Validation
```

---

## CASTLE ACTIVO: C·A·_·T·_·_

- **C (Contracts)**: Archivos generados implementan la interfaz `LLMProvider` (ADR-004)
- **A (Architecture)**: Adapter pattern — `complete()`, `stream()`, `getCapabilities()`; código server-side únicamente
- **T (Testing)**: Security gate en Fase 4 — grep de keys hardcodeadas antes de finalizar

---

## AGENTES INVOLUCRADOS

- **@developer** — Generación de código, templates, actualización de `.env.example`
- **@ml-engineer** — Validación de setup LLM, elección de modelo, configuración de provider

---

## PHASE ROUTER

> **Excepción v2.0 documentada**: Este skill usa PHASE ROUTER con carga modular por sub-archivos.
> Justificación: entry point ~500 tokens; carga total ~1800 tokens.
> Los sub-archivos se cargan on-demand según la fase activa.

| Fase | Sub-archivo |
|------|-------------|
| Phase 1: Stack Detection + Phase 2: Provider Configuration | [PROVIDER-SETUP.md](PROVIDER-SETUP.md) |
| Phase 3: Code Generation + Phase 4: Validation | [IMPLEMENTATION.md](IMPLEMENTATION.md) |

---

## Phase 0: Session (session-management)

### MUST DO
1. [ ] Cargar `.king/registry.md` — detectar si hay workflow activo en el branch actual
2. [ ] Si standalone (sin workflow activo): continuar sin asociación a workflow
3. [ ] Si invocado desde `/build` o `/ai-feature-scaffold`: heredar workflow context existente

> Delegado a `skills/session-management/SKILL.md` → Phase 0

---

## FINAL CHECKPOINT

Antes de terminar, verificar:

- [ ] Cliente LLM generado en `{destino}/{provider}-client.ts`
- [ ] SSE handler generado en `{destino}/sse-handler.ts`
- [ ] Cost tracking generado en `{destino}/cost-tracking/token-counter.ts`
- [ ] Schema SQL generado en `src/db/migrations/create_llm_usage.sql`
- [ ] `.env.example` actualizado con variables del provider
- [ ] Security gate pasado (sin API keys hardcodeadas en archivos generados)
- [ ] Session document creado en `.king/sessions/`
- [ ] Resumen de archivos presentado al usuario con próximos pasos

---

## Phase N+1: Write Session

> Delegado a `skills/session-management/SKILL.md` → Phase N+1

---

## Phase N+2: Guide Next Step

| Condición | Próximo Skill |
|-----------|---------------|
| Provider configurado, se necesita feature de IA (chatbot / search / RAG) | `/ai-feature-scaffold` |
| Solo se necesita integración, sin feature adicional | `/build` para implementar features sobre la integración |
| Validación falló (security gate o archivos faltantes) | Permanecer en `/llm-integration`, remediar antes de continuar |

---

## REFERENCE

> 📚 Información adicional. Esta sección NO contiene acciones.

### ADR-003: Skill Standalone

`/llm-integration` es completamente independiente. No invoca a ningún otro skill de negocio.
`/ai-feature-scaffold` detecta si `/llm-integration` fue ejecutado previamente, pero la decisión de ejecutarlo es del usuario.

### ADR-004: Adapter Pattern

Todos los clientes generados implementan la interfaz `LLMProvider` (ver `templates/shared/llm-provider.ts`):

```typescript
interface LLMProvider {
  complete(messages: Message[], options?: CompletionOptions): Promise<CompletionResult>;
  stream(messages: Message[], options?: CompletionOptions): AsyncIterable<string>;
  getCapabilities(): ProviderCapabilities;
  getSessionUsage(): TokenUsage;
  calculateCostUSD(usage: TokenUsage): number;
}
```

`GenerateFn` (el puerto de generación que consume el dominio de `/ai-feature-scaffold`) se
implementa sobre `LLMProvider.stream()` para streaming token-a-token (más `getSessionUsage()`
para el `usage`), o sobre el SDK del provider directamente.

### Knowledge Injection

| Archivo | Propósito | Requerido | Fuente |
|---------|-----------|-----------|--------|
| `knowledge/_inject/llm-integration-essentials.md` | LLM providers, streaming, cost tracking | No (se creará) | framework |
| `knowledge/_inject/testing-essentials.md` | Test patterns para código generado | No (presente) | framework |
| `knowledge/_inject/resilience-patterns.md` | Retry, circuit breaker para APIs externas | No (presente) | framework |
