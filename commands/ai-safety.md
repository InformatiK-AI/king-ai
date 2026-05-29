---
name: ai-safety
description: "Añadir una capa de seguridad LLM (prompt injection + PII + content moderation) a una integración existente. OWASP LLM Top 10, gates pii_leak_rate:0 y jailbreak_block_rate>=95"
argument-hint: "[--dest <dir>] [--moderation anthropic|azure] [--pii regex|presidio|both] [--adversarial]"
allowed-tools: [Read, Write, Edit, Grep, Glob, Bash, Agent]
---

# /ai-safety

Ejecutar el skill de AI Safety Layer.

## Instrucciones

1. Invocar el skill usando la herramienta Skill con `skill: king-ai:ai-safety`
2. Argumentos opcionales:
   - `--dest <dir>`: directorio destino de los guards (default: `src/ai-safety/`)
   - `--moderation anthropic|azure`: proveedor de content moderation vía adapter (default: anthropic si el proyecto ya usa Claude)
   - `--pii regex|presidio|both`: tier de detección de PII (default: regex; both si hay PII no estructurado)
   - `--adversarial`: review adversarial profundo del safety layer vía `judgment-day` (opt-in, no default por costo; conexión formal en B4)
3. Seguir todas las fases en orden:
   - Phase 0 (Session) → Phase 1-2 (THREAT-MODEL, PHASES.md) → Phase 3-4 (PIPELINE + GATES, PHASES.md) → Phase N+1 (Session)
4. Agentes: @security (primario, recibe el reporte de safety como contrato), @ml-engineer (patrones LLM, judge), @developer (templates)

## Outputs

Documenta cómo generar en el proyecto del usuario (los `.ts` NO los crea el skill, los genera en el proyecto):

- `src/ai-safety/{prompt-guard,pii-redactor,hallucination-detector,content-moderator,safety-pipeline}.ts`
- `safety-config.yaml` (thresholds por feature)
- `tests/ai-safety/{adversarial-prompts.json,pii-test-cases.json,safety.test.ts}`
- Sección `ai.safety` en `.king/quality-gates.yaml`
- Entradas de bloqueo en `.king/audit/YYYY-MM-DD.jsonl`

## Gates de bloqueo

- `pii_leak_rate == 0` — CERO tolerancia. Cualquier fuga de PII bloquea de inmediato; veto `@security` insuperable sin fix explícito.
- `jailbreak_block_rate >= 95` — medido contra `adversarial-prompts.json` (>= 50 casos OWASP) en CI. Por debajo, build bloqueado.

## Scope

v1 cubre: prompt injection (LLM01), PII (LLM02), content moderation, system prompt leakage (LLM07). Hallucination detection (LLM09) es **v2** — `hallucination-detector.ts` se genera como stub. NO expandir scope en v1.

## Ejemplos

```bash
# Proteger un endpoint LLM existente con defaults (regex PII + Anthropic moderation)
/ai-safety

# RAG con PII no estructurado y review adversarial profundo
/ai-safety --pii both --adversarial

# Moderación vía Azure Content Safety, destino custom
/ai-safety --moderation azure --dest src/lib/safety/
```

Si no se detecta integración LLM en el proyecto, recomendar ejecutar `/llm-integration` primero — no hay nada que proteger.
Si el gate `pii_leak_rate > 0` o `jailbreak_block_rate < 95`, permanecer en `/ai-safety` y remediar antes de continuar.
