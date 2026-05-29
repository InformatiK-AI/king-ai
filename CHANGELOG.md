# Changelog

## [1.2.0] — 2026-05-29

### Added
- **ai-feature-scaffold**: generadores del patrón hexagonal multicanal — templates `agent/` (puerto `ask`, contrato `types`, `resilience`, adaptador de provider) y `channels/whatsapp/` (firma HMAC `X-Hub-Signature-256`, idempotencia por `message_id`, parse, send, route, migración). Paridad con `ai-agent-starter-pro` v1.1.0.
- **knowledge**: `resilience-patterns.md` (timeout + retry con backoff/jitter) y `testing-essentials.md`.

### Changed
- **ai-feature-scaffold**: `GENERATION.md`, `DISCOVERY.md` y `SKILL.md` extendidos para generar la arquitectura hexagonal multicanal; templates `chatbot/` actualizados.
- **llm-integration**: `IMPLEMENTATION.md` y `SKILL.md` alineados con el patrón.

---

## [1.1.0] — 2026-05-29

### Added
- **M03 AI Excellence Core** — stack AI-native: `/rag-setup`, `/ai-safety`, `/prompt-eval`, `/ai-cost-gate`, `/ai-observability`, `/ai-audit-ledger`, `/cost-report`, `/judgment-day`. Agente `@ml-engineer` con 4 contratos bilaterales. Hook `emit-span` (instrumentación de spans AI). 6 knowledge files de dominio AI.

---

## [1.0.0] — release inicial
- Stub inicial de king-ai + `/ai-feature-scaffold`, `/llm-integration`.
