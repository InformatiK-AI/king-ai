# Archive Report — hexagonal-multicanal-whatsapp

> Fecha: 2026-05-29 · Verdict: CONDITIONAL · Cross-repo: ai-agent-starter-pro + king-ai

## Resumen

Se convirtió el molde de agentes LLM de King en arquitectura hexagonal multicanal con robustez de producción. El dominio del agente se desacopló del transporte (puerto `lib/agent/ask.ts`), se agregó un adaptador WhatsApp de ejemplo funcional y testeable, y el patrón se cosechó a los generadores `king-ai` para que todo agente futuro nazca con esta estructura.

## Entregado

- **ai-agent-starter-pro** (v1.1.0): puerto de dominio (`lib/agent/{types,ask,resilience,index}.ts` + `providers/ai-sdk.ts`), adaptadores web (refactor) y WhatsApp (`app/api/whatsapp/route.ts` + `lib/agent/whatsapp/*`), migración `wa_dedup`, `guardOutput` que modera de verdad (BREAKING interno), suite unit (23 tests con `node:test`), README + CHANGELOG + gates `ai.channel`/`ai.resilience`.
- **king-ai**: templates `agent/*` y `channels/whatsapp/*`, refactor del chatbot a adaptador delgado, knowledge `resilience-patterns.md` + `testing-essentials.md` (cerraban referencias rotas), SKILL.md (CASTLE C·A·S·T, ADR-005, fix ADR-004), DISCOVERY/GENERATION/IMPLEMENTATION, spec de dominio actualizada.

## Verificación

- ✅ standalone: typecheck + build + test:safety + test:unit (23/23) — sin credenciales.
- ⏳ demo/eval (API key + Postgres) y WhatsApp e2e (cuenta Meta) — runtime del usuario.

## Decisiones clave

- Un puerto, dos modos (`askStream` web / `ask` mensajería) sin duplicar orquestación.
- Robustez ESENCIAL en código (timeout, retry backoff+jitter, degradación graceful, firma, idempotencia, límite por canal); el resto (rate limiting, colas, multi-tenancy, sesiones, LLM-as-judge) DOCUMENTADO como evolución (anti-sobreingeniería).
- Los templates de king-ai reflejan el standalone REAL validado (`GenerateFn` inyectado) + puente documentado a `LLMProvider` (ADR-004).
- `.gitattributes` fuerza `*.ts eol=lf` (estabilidad del HMAC de firma).

## Pendiente (outward-facing — confirmación del usuario)

- Merge a `develop` (standalone → king-ai) — en este ciclo.
- `.env.example` con vars WhatsApp (bloqueado por el gate; el usuario lo agrega).
- Push a GitHub + release `ai-agent-starter-pro` v1.1.0 + registro marketplace.
- Validación de runtime (demo/eval + WhatsApp e2e) → sube CASTLE a FORTIFIED.
