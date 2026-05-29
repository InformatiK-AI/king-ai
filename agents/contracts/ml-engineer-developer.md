# MLEngineer-Developer Contract

## Propósito
Define el protocolo de interacción entre @ml-engineer y @developer para los contratos de interfaz LLM: input/output schema, fallback behavior, error codes y streaming protocol. @ml-engineer especifica el contrato del modelo (qué entra, qué sale, qué pasa cuando falla); @developer lo implementa en el código de aplicación y lo respeta como una interfaz estable.

---

## Escenarios de Interacción

| Escenario | Iniciador | Receptor | Tipo | Bloquea |
|-----------|-----------|----------|------|---------|
| Entrega de contrato de interfaz LLM | @ml-engineer | @developer | Interface Handoff | Sí |
| Implementación no respeta el output schema | @ml-engineer | @developer | Schema Violation | Sí |
| Consulta de integración LLM antes de codear | @developer | @ml-engineer | Pre-Implementation | No |
| Cambio en error codes o fallback behavior | @ml-engineer | @developer | Contract Update | Sí |
| Duda sobre streaming protocol | @developer | @ml-engineer | Quick Consultation | No |

---

## Interface Handoff: Contrato de Modelo (ML Engineer → Developer)

### Cuándo usar
- @developer va a integrar una llamada LLM (chat, completion, RAG query, tool use) en código de aplicación
- Se define un nuevo endpoint que expone una capability AI
- Cambia el schema, el fallback o el protocolo de streaming de una integración existente

### Interface Format (@ml-engineer → @developer)

```yaml
# LLM Interface Contract
type: "interface_handoff"
from: "@ml-engineer"
to: "@developer"
timestamp: "{ISO}"
context:
  skill: "/{llm-integration|rag-setup}"
  issue: "#{number}"

operation: "{nombre de la operación — ej: generateAnswer, classifyTicket}"
model_tier: "interactive | batch | reasoning"

input_schema:        # validado con Zod en la frontera
  format: "zod"
  definition: |
    z.object({
      query: z.string().min(1).max(2000),
      context: z.array(z.string()).optional(),
      userId: z.string().uuid()
    })

output_schema:       # structured output — el modelo DEBE cumplir este shape
  format: "zod"
  definition: |
    z.object({
      answer: z.string(),
      sources: z.array(z.object({ id: z.string(), score: z.number() })),
      confidence: z.enum(["high", "medium", "low"])
    })
  on_parse_failure: "retry_with_repair | fallback"  # qué hacer si el modelo no cumple

streaming:
  enabled: true|false
  protocol: "SSE"                    # ReadableStream, yield de chunks
  chunk_shape: "{ delta: string }"   # forma de cada evento
  terminal_event: "[DONE]"
  time_to_first_token_target_ms: 800

fallback_behavior:
  on_timeout: "fallback_model | cached_response | graceful_error"
  on_rate_limit: "retry_with_backoff (max 3) → fallback_model"
  fallback_chain: ["claude-sonnet-*", "claude-haiku-*"]
  on_total_failure: "{respuesta degradada determinista, nunca excepción sin manejar}"

retry_policy:
  max_attempts: 3
  backoff: "exponential"  # 1s, 2s, 4s
  retry_on: ["5xx", "timeout", "rate_limit"]

blocking: true
```

### Error Codes (contrato estable entre ambos)

| Code | Significado | Acción del developer |
|------|-------------|----------------------|
| `LLM_OK` | Respuesta válida que cumple el output schema | Procesar normal |
| `LLM_SCHEMA_INVALID` | El modelo no cumplió el output schema tras repair | Aplicar `on_parse_failure` |
| `LLM_TIMEOUT` | Timeout antes de respuesta completa | Aplicar `on_timeout` |
| `LLM_RATE_LIMITED` | API devolvió 429 | Retry con backoff → fallback_model |
| `LLM_PROVIDER_ERROR` | Error 5xx del proveedor | Retry → fallback_chain |
| `LLM_FALLBACK_USED` | Respuesta servida por modelo de fallback | Procesar + marcar en telemetría |
| `LLM_BUDGET_EXCEEDED` | Circuit breaker abierto (ver /ai-cost-gate) | Servir fallback degradado + alertar |
| `LLM_SAFETY_BLOCKED` | Safety layer bloqueó input/output (ver @security) | NO reintentar; devolver error seguro al usuario |

### Acknowledgment (@developer → @ml-engineer)

```yaml
# Interface Ack
type: "interface_ack"
from: "@developer"
to: "@ml-engineer"
in_response_to: "{handoff_timestamp}"

status: "IMPLEMENTED | NEEDS_CLARIFICATION"

implementation:
  input_validation: "zod en frontera"
  output_parsing: "zod + repair loop"
  streaming_wired: true|false
  all_error_codes_handled: true|false

questions:  # solo si status es NEEDS_CLARIFICATION
  - "{ej: ¿qué confidence sirvo si el fallback model no lo provee?}"
```

---

## Schema Violation (ML Engineer → Developer)

### Cuándo usar
- El código no valida el input antes de llamar al modelo
- El output del modelo se consume sin parsear contra el schema
- Un error code del contrato no está manejado
- El streaming no respeta el chunk_shape o el terminal_event

### Finding Format (@ml-engineer → @developer)

```yaml
# Interface Schema Violation
type: "schema_violation"
from: "@ml-engineer"
to: "@developer"
timestamp: "{ISO}"

violation:
  severity: "{BLOCKER|MAJOR|MINOR}"
  category: "{input_schema|output_schema|error_handling|streaming|fallback}"
  location: "{path:line}"
  description: |
    {Qué incumple el contrato}
  expected: |
    {Lo que el contrato exige}
  fix: |
    {Cómo corregirlo}

blocking: true  # BLOCKER y MAJOR bloquean
```

### Fix Confirmation (@developer → @ml-engineer)

```yaml
# Fix Confirmation
type: "fix_confirmation"
from: "@developer"
to: "@ml-engineer"
in_response_to: "{violation_timestamp}"

fix_applied:
  location: "{path:line}"
  description: |
    {Qué se corrigió}
  contract_compliance:
    input_validated: true
    output_parsed: true
    error_codes_handled: true
    streaming_compliant: true
  verified_locally: true

ready_for_recheck: true
```

---

## Quick Consultation (Developer → ML Engineer)

### Cuándo usar
- Preguntar sobre el protocolo de streaming antes de implementar
- Confirmar el fallback behavior esperado en un edge case
- Validar cómo parsear un output específico

### Format (simplificado)

```yaml
# Quick Consultation
type: "quick"
from: "@developer"
to: "@ml-engineer"
question: "{Pregunta directa sobre la interfaz LLM}"
code_snippet: |
  {Código relevante si aplica}
blocking: false
```

```yaml
# Quick Response
type: "quick_response"
from: "@ml-engineer"
answer: "{Respuesta directa}"
contract_reference: "{sección del Interface Contract que aplica}"
```

---

## Iteration Loop

### Máximo 2 ciclos violation-fix

```
@ml-engineer violation → @developer fix → @ml-engineer recheck (ciclo 1)
  → Si sigue incumpliendo el contrato:
@ml-engineer violation → @developer fix → @ml-engineer recheck (ciclo 2)
  → Si persiste: escalar a usuario (¿el contrato es implementable como está?)
```

---

## Señales de Escalación

### @developer consulta @ml-engineer cuando:

| Señal | Ejemplo | Acción |
|-------|---------|--------|
| Va a integrar una llamada LLM | "¿Cuál es el input/output schema?" | Pre-Implementation |
| Duda sobre streaming | "¿Cómo manejo el terminal event?" | Quick Consultation |
| No sabe qué hacer ante un error | "¿Reintento en LLM_SAFETY_BLOCKED?" | Quick Consultation |

### @ml-engineer escala a @developer cuando:

| Señal | Ejemplo | Acción |
|-------|---------|--------|
| Output no se parsea contra schema | "Se consume el texto crudo sin Zod" | Schema Violation |
| Falta manejo de fallback | "No hay retry ni fallback_model" | Schema Violation |
| Error code sin manejar | "LLM_BUDGET_EXCEEDED no está cubierto" | Schema Violation |

### Escala a usuario cuando:

| Señal | Ejemplo |
|-------|---------|
| El contrato no es implementable como está | "El output schema exige un campo que el modelo no produce confiablemente" |
| 2 ciclos sin cumplir el contrato | "La integración sigue rompiendo el shape esperado" |
| Cambio de proveedor afecta el contrato | "OpenAI no soporta el mismo streaming protocol" |

---

## Timeouts y Fallbacks

| Situación | Timeout | Fallback |
|-----------|---------|----------|
| Interface Handoff sin ack | Blocking | Escalar a usuario antes de codear a ciegas |
| Schema Violation sin fix | N/A (blocking) | Escalar a usuario |
| Quick Consultation sin respuesta | Continuar sin | Implementar con validación Zod estricta + documentar supuestos |
| Cambio de contrato sin propagar | N/A (blocking) | Bloquear merge hasta re-ack del developer |
| @ml-engineer no activado en /genesis | N/A | @developer usa structured outputs Zod por defecto + marca CONDITIONAL |

---

## Ver también

- **MLEngineer-Security Contract**: `agents/contracts/ml-engineer-security.md`
- **MLEngineer-Performance Contract**: `agents/contracts/ml-engineer-performance.md`
- **MLEngineer-QA Contract**: `agents/contracts/ml-engineer-qa.md`
- **Escalation Matrix**: `agents/_common/escalation-matrix.md`
- **Context Handoff**: `agents/_common/context-handoff.md`
- **LLM Integration**: `/llm-integration`
- **RAG Setup**: `/rag-setup`
