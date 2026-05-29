# ai-observability — PHASES (Phases 1-4)

> Sub-archivo de `SKILL.md`. Cargado via PHASE ROUTER.
> NUNCA ejecutar directamente — siempre invocado desde `skills/ai-observability/SKILL.md`.
> Recordatorio: los `.ts` NO se crean aquí. El skill DOCUMENTA cómo generarlos en el proyecto del usuario. Referencia de formatos, tabla de spans, tradeoffs de backend y código: `REFERENCE.md`.

---

## PHASE 1: OTel Base Detection

### GATE IN
- [ ] Phase 0 (session-management) completada
- [ ] No se disparó ninguna BLOCKING CONDITION del `SKILL.md`

### MUST DO
> ⚠️ Todas las acciones son OBLIGATORIAS

1. [ ] **Detectar integración LLM existente** en el proyecto:
   - Buscar `*-client.ts` generado por `/llm-integration`, o imports de `@anthropic-ai/sdk`, `openai`, `@google/generative-ai`
   - Registrar `LLM_ENTRYPOINTS`: lista de archivos/rutas donde se llama al LLM (cada uno DEBE quedar trazado)
   - Si NO se encuentra ninguno: ⛔ BLOCKING — recomendar `/llm-integration` primero y abortar

2. [ ] **Detectar OTel base** (prerequisito, gap E4):
   - Buscar `@opentelemetry/api`, `@opentelemetry/sdk-node`, un `NodeSDK`/`tracerProvider` ya inicializado, o `OTEL_EXPORTER_OTLP_ENDPOINT` en `.env`
   - Si EXISTE: registrar `OTEL_BASE = present` y reutilizar el provider
   - Si NO existe: registrar `OTEL_BASE = missing` — el skill lo INSTALA como prerequisito en Phase 2 (NO bloquea; ver IF FAILS)

3. [ ] **Detectar el stack de tests**: `vitest` / `jest` en `package.json` → registrar `TEST_RUNNER` para `tracing-coverage.test.ts`

4. [ ] **Registrar `DEST_DIR`** (default `src/observability/`), `TEST_DIR` (default `tests/observability/`) y `PROMPTS_DIR` (default `prompts/`)

### CHECKPOINT
> ✅ Verificar antes de Phase 2

- [ ] Al menos un `LLM_ENTRYPOINT` identificado
- [ ] `OTEL_BASE` registrado (`present` o `missing`)
- [ ] `TEST_RUNNER` registrado (o "manual" si no hay runner)
- [ ] `DEST_DIR`, `TEST_DIR`, `PROMPTS_DIR` registrados

### OUTPUTS
- `LLM_ENTRYPOINTS`, `OTEL_BASE`, `TEST_RUNNER`, `DEST_DIR`, `TEST_DIR`, `PROMPTS_DIR` (en memoria de sesión)

### IF FAILS
```
No se detecta integración LLM:
  → BLOCKING — "No hay llamadas LLM que trazar. Ejecutar /llm-integration primero."
  → No generar archivos.

OTel base ausente (OTEL_BASE = missing):
  → NO bloquear. El skill instala OTel base como prerequisito en Phase 2:
    @opentelemetry/api, @opentelemetry/sdk-node, exporter OTLP, e inicialización del provider.
  → Advertir al usuario que se añadirá la dependencia base.

package.json no existe:
  → Preguntar el stack al usuario (runner de tests, lenguaje).
  → Registrar respuesta manual y continuar.
```

---

## PHASE 2: Tracer Instrumentation

### GATE IN
- [ ] Phase 1 completada — `LLM_ENTRYPOINTS` y `OTEL_BASE` registrados

### MUST DO
> ⚠️ Todas las acciones son OBLIGATORIAS. El skill DOCUMENTA y genera los archivos en el proyecto del usuario; ver código de referencia en `REFERENCE.md`.

1. [ ] **Si `OTEL_BASE = missing`**: instalar OTel base (prerequisito, no bloquea):
   - Añadir `@opentelemetry/api` + `@opentelemetry/sdk-node` + exporter OTLP a `package.json`
   - Documentar la inicialización del `tracerProvider` con el exporter apuntando a `OTEL_EXPORTER_OTLP_ENDPOINT`
   - `mem_save` la decisión "OTel base instalado como prerequisito"

2. [ ] **Crear directorios** `{DEST_DIR}/` y `{TEST_DIR}/` si no existen. NUNCA sobreescribir un archivo existente sin confirmación explícita del usuario

3. [ ] **Generar `otel-llm-tracer.ts`** — wrapper que envuelve cada llamada LLM en un span con GenAI semconv (tabla completa en `REFERENCE.md`):
   - Atributos GenAI OBLIGATORIOS: `gen_ai.system`, `gen_ai.request.model`, `gen_ai.request.max_tokens`, `gen_ai.response.finish_reason`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`
   - Atributos King custom OBLIGATORIOS: `king.feature_id`, `king.agent_id`, `king.sdd_phase`
   - El span se abre ANTES de la llamada y se cierra SIEMPRE (try/finally) — un error del LLM NO debe dejar un span sin cerrar
   - El contenido del prompt/output NO se registra crudo por default (política PII)

4. [ ] **Generar `token-attribution.ts`** — etiqueta cada span con `king.feature_id`, `session_id`, `user_id` desde el contexto de request. Propaga el `traceContext` para correlación distribuida

5. [ ] **Instrumentar cada `LLM_ENTRYPOINT`** para que pase por `otel-llm-tracer.ts`. Registrar `INSTRUMENTED` (lista) vs `LLM_ENTRYPOINTS` — deben coincidir 1:1 (base del gate `tracing_coverage_pct: 100`)

### CHECKPOINT
> ✅ Verificar antes de Phase 3

- [ ] OTel base presente (instalado si faltaba)
- [ ] `otel-llm-tracer.ts` generado con los atributos `gen_ai.*` y `king.*` obligatorios
- [ ] `token-attribution.ts` generado (`feature_id`, `session_id`, `user_id`)
- [ ] `INSTRUMENTED` cubre el 100% de `LLM_ENTRYPOINTS`
- [ ] Span se cierra en try/finally (sin spans colgados ante error del LLM)

### OUTPUTS
- `{DEST_DIR}/otel-llm-tracer.ts`, `{DEST_DIR}/token-attribution.ts`
- Lista `INSTRUMENTED` (debe igualar `LLM_ENTRYPOINTS`)

### IF FAILS
```
Un LLM_ENTRYPOINT no se puede instrumentar (código de terceros / SDK opaco):
  → Envolver la llamada en el wrapper del tracer en el punto de uso.
  → Si es imposible: documentar el gap; el gate tracing_coverage_pct seguirá < 100 hasta resolverlo.

Span queda sin atributo gen_ai.* o king.* obligatorio:
  → DETENER. El span es inválido para el gate. Completar atributos antes de avanzar.

Instalación de OTel base falla (permisos / red):
  → Pedir al usuario instalar las dependencias OTel manualmente, reintentar.
```

---

## PHASE 3: Backend + Registry + Metrics

### GATE IN
- [ ] Phase 2 completada — `otel-llm-tracer.ts` emite spans válidos

### MUST DO
> ⚠️ Todas las acciones son OBLIGATORIAS. Ver formatos y código en `REFERENCE.md`.

1. [ ] **Elegir backend de UI de trazas** vía adapter `langfuse-helicone` (tradeoffs en `REFERENCE.md`):
   - `--backend=langfuse` (default, self-host posible, prompt management nativo) o `--backend=helicone` (proxy, setup mínimo)
   - Registrar `TRACE_BACKEND`. `mem_save` la decisión en el momento

2. [ ] **Generar `langfuse-client.ts`** — implementación del adapter `TraceBackend` para el backend elegido. Intercambiable: `LangfuseClient` y `HeliconeClient` exponen la MISMA interfaz. NUNCA acoplar el tracer a uno concreto

3. [ ] **Generar `prompt-registry.ts`** — carga prompts desde `{PROMPTS_DIR}/` con:
   - `version` (semver del prompt) y `hash` (git hash del archivo de prompt)
   - Inyecta `king.prompt.version` y `king.prompt.hash` como atributos del span (prompt versioning trazable)

4. [ ] **Generar `metrics-exporter.ts`** — métricas Prometheus:
   - `llm_request_duration_seconds` (histogram, labels `model`, `feature_id`, `status`)
   - `llm_tokens_total` (counter, labels `model`, `feature_id`, `token_type`=input|output)
   - Expone `/metrics` o registra en el `meterProvider` OTel (tabla completa en `REFERENCE.md`)

5. [ ] **Configurar sampling** — `OTEL_TRACES_SAMPLER_ARG`: 10% en prod, 100% en dev. El sampling afecta la EXPORTACIÓN de spans, NO la cobertura del gate (el gate mide instrumentación, no spans muestreados). Documentar esta distinción

6. [ ] **Actualizar `.env.example`** con `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_TRACES_SAMPLER`, `OTEL_TRACES_SAMPLER_ARG`, `LANGFUSE_SECRET_KEY`/`LANGFUSE_PUBLIC_KEY`/`LANGFUSE_HOST` (y `HELICONE_API_KEY` si aplica). NUNCA con valores reales (placeholders)

### CHECKPOINT
> ✅ Verificar antes de Phase 4

- [ ] `TRACE_BACKEND` elegido y registrado
- [ ] `langfuse-client.ts` generado como adapter intercambiable (langfuse-helicone)
- [ ] `prompt-registry.ts` genera `version` + `hash` git e inyecta `king.prompt.*`
- [ ] `metrics-exporter.ts` expone `llm_request_duration_seconds` y `llm_tokens_total`
- [ ] Sampling configurado (10% prod / 100% dev) y documentado como independiente de la cobertura
- [ ] `.env.example` actualizado con placeholders (sin claves reales)

### OUTPUTS
- `{DEST_DIR}/{langfuse-client,prompt-registry,metrics-exporter}.ts`
- `.env.example` actualizado

### IF FAILS
```
No se decide backend de trazas:
  → Default a Langfuse. Si el proyecto usa proxy/gateway: ofrecer Helicone.
  → No generar langfuse-client.ts acoplado a una API — siempre vía adapter.

prompts/ no existe:
  → Crear el directorio y documentar que los prompts se externalizan ahí.
  → prompt-registry.ts degrada a hash inline si no hay archivos de prompt aún.

Se intenta poner claves reales en .env.example:
  → DETENER. Solo placeholders. Las claves van en .env (gitignored) o gestor de secretos.
```

---

## PHASE 4: Coverage Gate + Contract Test

### GATE IN
- [ ] Phase 3 completada — tracer, backend, registry y métricas generados

### MUST DO
> ⚠️ Todas las acciones son OBLIGATORIAS

1. [ ] **Generar `tracing-coverage.test.ts`** (contract test de spans, CASTLE T):
   - Por cada `LLM_ENTRYPOINT`, verificar que la llamada produce UN span con los atributos `gen_ai.*` y `king.*` obligatorios (Gherkin Scenario 1)
   - Usa el `TEST_RUNNER` y un span exporter en memoria para inspeccionar los atributos emitidos

2. [ ] **Gate `tracing_coverage_pct == 100`** — CERO tolerancia:
   - `tracing_coverage_pct = INSTRUMENTED / LLM_ENTRYPOINTS * 100`
   - Si `< 100`: ⛔ veto bloqueante de `@ml-engineer`. Instrumentar el endpoint faltante antes de continuar. NO superable sin trazar TODA llamada LLM (Gherkin Scenario 2)

3. [ ] **Verificar atributos por span** — el contract test confirma que cada span tiene: `gen_ai.system`, `gen_ai.request.model`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, `king.feature_id`, `king.agent_id`. Falta de cualquiera → span inválido → gate FAIL (Gherkin Scenario 1)

4. [ ] **Verificar correlación y métricas** — un request de ejemplo genera el span en el backend (`TRACE_BACKEND`) Y incrementa `llm_tokens_total`/`llm_request_duration_seconds`

5. [ ] **Escribir gates** en `.king/quality-gates.yaml` sección `ai.observability` (formato en `REFERENCE.md`): `tracing_coverage_pct: 100`

6. [ ] **Emitir reporte de cobertura a `@ml-engineer`** (contrato CASTLE T): `tracing_coverage_pct`, lista de endpoints trazados, backend, sampling. Si `tracing_coverage_pct < 100` o hay endpoint sin `otel-llm-tracer.ts` → veredicto BREACHED, merge bloqueado (Gherkin Scenario 2)

### CHECKPOINT
> ✅ Verificar antes de Phase N+1

- [ ] `tracing-coverage.test.ts` ejecutado vía `TEST_RUNNER`
- [ ] `tracing_coverage_pct == 100` confirmado (cada llamada LLM tiene span)
- [ ] Cada span tiene los atributos `gen_ai.*` y `king.*` obligatorios
- [ ] Span aparece en el backend elegido y las métricas Prometheus se incrementan
- [ ] Gate `tracing_coverage_pct: 100` escrito en `.king/quality-gates.yaml`
- [ ] Reporte entregado a `@ml-engineer`; CASTLE layer T no encuentra endpoint LLM sin tracer

### OUTPUTS
- `{TEST_DIR}/tracing-coverage.test.ts`
- Resultado del gate (PASS/FAIL), reporte de cobertura para `@ml-engineer`, sección `ai.observability` en quality-gates

### IF FAILS
```
tracing_coverage_pct < 100:
  → ⛔ Veto @ml-engineer bloqueante (CASTLE T). Merge bloqueado.
  → Instrumentar el endpoint faltante con otel-llm-tracer.ts. Re-ejecutar hasta 100%.
  → NO continuar a N+1 con cobertura < 100.

CASTLE layer T detecta LLM call sin OTel span (ej. /api/chat):
  → BREACHED — "LLM call en /api/chat sin OTel span". Merge bloqueado.
  → Conectar el endpoint a otel-llm-tracer.ts antes de re-evaluar.

Span sin atributo gen_ai.* o king.* obligatorio:
  → Gate FAIL. Completar atributos en otel-llm-tracer.ts. Re-ejecutar el contract test.

TEST_RUNNER no disponible:
  → Documentar verificación manual en session document.
  → NO declarar el gate como PASS sin evidencia de ejecución del contract test.
```
