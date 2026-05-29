# MLEngineer-Security Contract

## Propósito
Define el protocolo de interacción entre @ml-engineer y @security para AI safety gates (prompt injection, PII, jailbreak), determinación de cuándo `/review --adversarial` es OBLIGATORIO, y manejo de PII en el contexto enviado a modelos. El gate `pii_leak_rate == 0` es INSUPERABLE: @security tiene veto total e irrevocable.

---

## Escenarios de Interacción

| Escenario | Iniciador | Receptor | Tipo | Bloquea |
|-----------|-----------|----------|------|---------|
| Nueva feature AI expuesta a input de usuario | @ml-engineer | @security | Pre-Implementation | Sí |
| PII detectado en contexto enviado a la API | @ml-engineer o @security | @security | Security Escalation | Sí — TOTAL |
| Prompt injection o jailbreak detectado en review | @security | @ml-engineer | Remediation | Sí |
| Validación de safety layer antes de release | @ml-engineer | @security | Pre-Release Gate | Sí |
| Consulta de patrón seguro de prompt | @ml-engineer | @security | Quick Consultation | No |

---

## Pre-Implementation Consultation

### Cuándo usar
- Antes de exponer un endpoint LLM a input de usuario final (chatbot, RAG query, agente)
- Cuando el contexto del prompt puede incluir datos del usuario (PII, tokens, historial)
- Cuando se ingesta un dataset externo a un vector DB (riesgo de PII en embeddings)
- Antes de habilitar tool use o function calling con efectos secundarios

### Request Format (@ml-engineer → @security)

```yaml
# Pre-Implementation AI Safety Consultation
type: "pre_implementation"
from: "@ml-engineer"
to: "@security"
timestamp: "{ISO}"
context:
  skill: "/{rag-setup|ai-safety|llm-integration}"
  issue: "#{number}"

feature: |
  {Qué AI feature se va a implementar y qué input de usuario recibe}

attack_surface:
  - user_facing: true|false
  - tool_use_enabled: true|false
  - context_includes_pii: true|false
  - vector_db_ingest: true|false

threat_model_considered:
  - threat: "{prompt_injection|jailbreak|pii_leak|data_exfiltration}"
    mitigation_planned: "{cómo se planea mitigar}"

blocking: true
```

### Response Format (@security → @ml-engineer)

```yaml
# AI Safety Guidance
type: "safety_guidance"
from: "@security"
to: "@ml-engineer"
timestamp: "{ISO}"

assessment: "APPROVED|NEEDS_CHANGES|BLOCKED"

adversarial_review_required: true|false  # si true → /review --adversarial OBLIGATORIO

required_gates:
  - gate: "pii_leak_rate"
    threshold: "== 0"          # INSUPERABLE
    enforcement: "block"
  - gate: "jailbreak_block_rate"
    threshold: ">= 95"
    enforcement: "block"

guidance:
  - category: "{prompt_injection|pii|jailbreak|tool_use}"
    recommendation: |
      {Recomendación concreta de mitigación}
    pattern: |
      {Patrón seguro sugerido — ej: PII redaction ANTES del embedding}
    avoid: |
      {Anti-patrón a evitar}

reference:
  - "/ai-safety"
  - "judgment-day (review adversarial)"

additional_notes: |
  {Contexto adicional}
```

---

## Security Escalation: PII en Contexto del Modelo

### Triggers (cualquier agente detona esto)

Detener inmediatamente y escalar a @security si se detecta:
- Datos personales (email, nombre, teléfono, dirección, IDs) en el contexto enviado a la API
- Tokens de sesión, credenciales o secrets en system prompts o mensajes
- PII en chunks ingestados a un vector DB sin redaction previa
- Logs de inferencia o traces de observabilidad que exponen datos de usuario

### Formato de escalación

```yaml
# Security Escalation — PII
type: "security_escalation"
from: "@ml-engineer | @security"
to: "@security"
timestamp: "{ISO}"

trigger: "pii_in_prompt_context | pii_in_vector_db | secret_in_system_prompt | pii_in_inference_logs"
location: "{archivo/pipeline/sección donde se detectó}"
evidence: |
  {Descripción del dato sensible detectado — NUNCA incluir el dato real aquí}

gate_violated: "pii_leak_rate == 0"
action: "STOP — no continuar hasta resolución de @security"
blocking: true
```

> @security tiene VETO TOTAL en este escenario. El gate `pii_leak_rate == 0` es INSUPERABLE: su decisión es FINAL e irrevocable. Ninguna excepción, bypass ni justificación de negocio anula este gate.

---

## Remediation: Prompt Injection / Jailbreak (Security → ML Engineer)

### Cuándo usar
- `/review --adversarial` detecta un bypass del safety layer
- Tests adversariales en CI fallan (OWASP LLM Top 10)
- Jailbreak conocido escapa los guardrails actuales

### Finding Format (@security → @ml-engineer)

```yaml
# AI Safety Finding
type: "remediation_request"
from: "@security"
to: "@ml-engineer"
timestamp: "{ISO}"

finding:
  severity: "{CRITICAL|HIGH|MEDIUM|LOW}"
  category: "{prompt_injection|jailbreak|pii_leak|content_moderation}"
  attack_vector: |
    {Cómo se logró el bypass — payload de ejemplo redactado si contiene PII}
  location: "{skill o pipeline afectado}"
  impact: |
    {Qué se logra explotando esto}
  fix: |
    {Cómo reforzar el safety layer}
  gate_affected: "{jailbreak_block_rate|pii_leak_rate}"

blocking: true  # CRITICAL y HIGH siempre bloquean
```

### Fix Confirmation (@ml-engineer → @security)

```yaml
# Remediation Confirmation
type: "fix_confirmation"
from: "@ml-engineer"
to: "@security"
in_response_to: "{finding_timestamp}"

fix_applied:
  location: "{skill o pipeline}"
  description: |
    {Qué se reforzó en el safety layer}
  adversarial_tests_added: ["{caso OWASP cubierto}"]
  verified_locally: true

gate_status:
  jailbreak_block_rate: "{N}%"   # debe ser >= 95
  pii_leak_rate: "{N}"           # debe ser == 0

ready_for_recheck: true
```

---

## ¿Cuándo es OBLIGATORIO `/review --adversarial`?

`/review --adversarial` (judgment-day) es OBLIGATORIO, no opt-in, cuando se cumple cualquiera:

| Condición | Razón |
|-----------|-------|
| Feature AI expuesta a input de usuario final no autenticado | Máxima superficie de ataque |
| Tool use / function calling con efectos secundarios (escritura, pagos, envío) | Prompt injection puede ejecutar acciones |
| Contexto del prompt incluye PII aunque sea redactada | Verificar que la redaction no tiene fugas |
| RAG sobre datos de múltiples tenants | Riesgo de cross-tenant data leakage |
| Cambio en el safety layer o en los guardrails | Validar que no se introdujo regresión de seguridad |

Fuera de estos casos, `--adversarial` es opt-in (su costo es ~3x por las 3 llamadas del protocolo).

---

## Iteration Loop

### Máximo 2 ciclos finding-fix

```
@security finding → @ml-engineer fix → @security recheck (ciclo 1)
  → Si el gate sigue fallando:
@security finding → @ml-engineer fix → @security recheck (ciclo 2)
  → Si persiste: escalar a usuario con recomendación
```

**Regla:** El gate `pii_leak_rate == 0` NO admite ciclos de tolerancia: una sola fuga bloquea hasta resolución total.

---

## Señales de Escalación

### @ml-engineer consulta @security cuando:

| Señal | Ejemplo | Acción |
|-------|---------|--------|
| Expone endpoint LLM a usuario | "¿Necesito safety layer aquí?" | Pre-Implementation |
| Va a ingestar dataset externo | "¿Hay PII en estos chunks?" | Pre-Implementation |
| Detecta PII en contexto | "Encontré emails en el prompt" | Security Escalation |
| Pregunta sobre patrón de prompt seguro | "¿Cómo aíslo input de usuario?" | Quick Consultation |

### @security escala a @ml-engineer cuando:

| Señal | Ejemplo | Acción |
|-------|---------|--------|
| Adversarial review detecta bypass | "Jailbreak escapa el guardrail" | Remediation |
| Tests OWASP fallan en CI | "Prompt injection no bloqueado" | Remediation |
| PII detectada en embeddings | "Vector DB tiene PII sin redactar" | Security Escalation |

### @security escala a usuario cuando:

| Señal | Ejemplo |
|-------|---------|
| `pii_leak_rate` no llega a 0 tras 2 ciclos | "La redaction no cubre el caso X" |
| Vulnerabilidad CRITICAL no remediable sin rediseño | "Requiere cambiar la arquitectura del pipeline" |
| Bypass solicitado sin justificación válida | "Se pide omitir el AI safety gate" |

---

## Timeouts y Fallbacks

| Situación | Timeout | Fallback |
|-----------|---------|----------|
| Pre-Implementation sin respuesta | Blocking | Escalar a usuario |
| PII Escalation sin resolución | N/A (blocking total) | STOP absoluto + escalar a usuario |
| Finding CRITICAL sin fix | N/A (blocking) | Escalar a usuario |
| Quick Consultation sin respuesta | Continuar sin | Usar patrón conservador (aislar input + documentar) |
| @security no activado en /genesis | N/A | @ml-engineer aplica safety gate básico + marca CONDITIONAL |

---

## Ver también

- **MLEngineer-Performance Contract**: `agents/contracts/ml-engineer-performance.md`
- **MLEngineer-QA Contract**: `agents/contracts/ml-engineer-qa.md`
- **MLEngineer-Developer Contract**: `agents/contracts/ml-engineer-developer.md`
- **Escalation Matrix**: `agents/_common/escalation-matrix.md`
- **Context Handoff**: `agents/_common/context-handoff.md`
- **AI Safety**: `/ai-safety`
- **Adversarial Review**: judgment-day
