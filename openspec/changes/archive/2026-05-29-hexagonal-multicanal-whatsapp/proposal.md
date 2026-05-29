# Proposal — Arquitectura hexagonal multicanal + adaptador WhatsApp

> Fase: sdd-propose · Change: hexagonal-multicanal-whatsapp · Backend: openspec (king-ai) · Cross-repo: ai-agent-starter-pro + king-ai

## Why

El agente RAG generado por King tenía la orquestación (safety → retrieve → generación → moderación) **acoplada al transporte HTTP/web**: vivía dentro de `app/api/chat/route.ts` y terminaba en `toTextStreamResponse()` (Vercel AI SDK, solo navegador). Conectar un canal de mensajería (WhatsApp, Telegram) obligaba a duplicar toda la lógica.

Se arregla el **molde, no el síntoma**: el dominio del agente se extrae a un puerto hexagonal reutilizable, y el patrón se cosecha a los generadores de king-ai para que TODO agente futuro nazca listo para multicanal, con la robustez esencial de producción. Además se descubrió que `guardOutput` era un no-op acoplado que no moderaba nada.

## What Changes

1. **`ai-agent-starter-pro`** (referencia productiva, se clona): refactor hexagonal — puerto de dominio `lib/agent/ask.ts` (`ask`/`askStream`), contrato canónico, capa de resiliencia, adaptadores web + WhatsApp, `guardOutput` que modera de verdad.
2. **`king-ai`** (generadores): cosecha del patrón a `/ai-feature-scaffold` y `/llm-integration` como templates (`agent/*`, `channels/whatsapp/*`), knowledge (`resilience-patterns.md`, `testing-essentials.md`) y actualización de SKILL.md/DISCOVERY/GENERATION/spec.

## Capabilities (contrato para sdd-spec)

| # | Capability | Artefactos |
|---|------------|------------|
| 1 | `hexagonal-domain` | `lib/agent/{types,ask,resilience,index}.ts` + `providers/ai-sdk.ts`: puerto agnóstico al transporte, contrato canónico `InboundMessage`/`AgentReply`, inyección de dependencias |
| 2 | `resilience` | timeout (deadline), retry backoff+jitter (no 401/403/safety), degradación graceful de RAG, `guardOutput` real |
| 3 | `whatsapp-channel` | `app/api/whatsapp/route.ts` + `lib/agent/whatsapp/{verify,parse,dedup,send}.ts` + migración `wa_dedup`: firma HMAC, idempotencia, ack async, límite por canal |
| 4 | `generators-harvest` | templates `king-ai/.../templates/{agent,channels/whatsapp}/*` + refactor `chatbot/chat-api-route.ts` a adaptador delgado |
| 5 | `knowledge-and-docs` | `knowledge/_inject/{resilience-patterns,testing-essentials}.md` + SKILL.md (CASTLE C·A·S·T, ADR-005) + DISCOVERY/GENERATION/IMPLEMENTATION + spec |

## Scope

- **In scope**: refactor hexagonal del standalone con type-check + build + suite unit verdes; adaptador WhatsApp funcional y testeable sin credenciales; cosecha del patrón a king-ai; robustez esencial en código.
- **Out of scope (documentado como evolución)**: rate limiting, colas async dedicadas, multi-tenancy, sesiones conversacionales, LLM-as-judge, dead-letter, prompt caching.
- **Out of scope (runtime — usuario)**: `npm run demo`/`eval` (requieren API key + Postgres) y WhatsApp e2e (cuenta Meta).
- **Out of scope (outward-facing)**: push a GitHub + release v1.1.0 + registro marketplace → confirmación del usuario.

## Affected modules

- `ai-agent-starter-pro/`: nuevo `lib/agent/` (+ `whatsapp/`, `providers/`), `app/api/whatsapp/`, `db/migrations/0002_*`, `tests/unit/`; modificados `app/api/chat/route.ts`, `lib/safety/index.ts`, `scripts/{demo,eval}.ts`, `package.json`, README, CHANGELOG, `.king/quality-gates.yaml`, `.gitattributes`.
- `king-ai/`: nuevos templates `agent/*` y `channels/whatsapp/*`, knowledge `_inject/{resilience-patterns,testing-essentials}.md`; modificados `chatbot/chat-api-route.ts`, SKILL.md (×2), DISCOVERY/GENERATION/IMPLEMENTATION, `knowledge/domain/ai-agent-starter-pro-spec.md`, `.gitattributes`, este `openspec/` planning.

## Delivery

- Dos worktrees `feature/hexagonal-multicanal` desde `develop` (uno por repo). Standalone PRIMERO (valida e2e), luego cosecha a king-ai. Merge a `develop` standalone→king-ai. Push manual del usuario.

## Rollback plan

- Standalone: la feature es aditiva salvo el refactor de `route.ts` y `guardOutput`. Revertir = `git revert` del merge o borrar `lib/agent/` + restaurar `route.ts`/`safety`.
- king-ai: templates/knowledge nuevos son aditivos; los SKILL.md tienen cambios quirúrgicos reversibles. Revertir = `git revert`.
