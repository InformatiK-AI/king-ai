# ai-cost-gate — PHASES (Phases 1-4)

> Sub-archivo de `SKILL.md`. Cargado via PHASE ROUTER.
> NUNCA ejecutar directamente — siempre invocado desde `skills/ai-cost-gate/SKILL.md`.
> Recordatorio: los `.ts` NO se crean aquí. El skill DOCUMENTA cómo generarlos en el proyecto del usuario. Referencia de formatos y código: `REFERENCE.md`.

---

## PHASE 1: LLM & Backend Detection

### GATE IN
- [ ] Phase 0 (session-management) completada
- [ ] No se disparó ninguna BLOCKING CONDITION del `SKILL.md`

### MUST DO
> ⚠️ Todas las acciones son OBLIGATORIAS

1. [ ] **Detectar integración LLM existente** en el proyecto:
   - Buscar `*-client.ts` generado por `/llm-integration`, o imports de `@anthropic-ai/sdk`, `openai`, `@google/generative-ai`
   - Registrar `LLM_ENTRYPOINTS`: lista de archivos/rutas que llaman al LLM
   - Si NO se encuentra ninguno: ⛔ BLOCKING — recomendar `/llm-integration` primero y abortar (no hay costo que gobernar)

2. [ ] **Detectar backend de quota** (Redis/Upstash):
   - Buscar `ioredis`, `redis`, `@upstash/redis` en `package.json`; variables `REDIS_URL` / `UPSTASH_REDIS_REST_URL` en `.env*`
   - Registrar `QUOTA_BACKEND` (`redis` | `upstash` | `none`)
   - Si `--quota-backend <url>` se pasó explícitamente: usarlo
   - Si `none` y sin flag: ⚠️ NO abortar. Advertir `"Sin backend de quota: per-user limits no pueden aplicarse"` y OFRECER continuar solo con circuit breaker + budget enforcer. Registrar `QUOTA_MODE = degraded`

3. [ ] **Confirmar generación de `circuit-breaker.ts`**:
   - Si el usuario lo excluye explícitamente: ⛔ `@ml-engineer` veta BREACHED. No continuar sin circuit breaker

4. [ ] **Detectar el stack de tests**: `vitest` / `jest` en `package.json` → registrar `TEST_RUNNER` para el load test del breaker

5. [ ] **Registrar `DEST_DIR`** (default `src/cost-gate/`) y la ubicación de `cost-gate.config.yaml` (raíz del proyecto)

### CHECKPOINT
> ✅ Verificar antes de Phase 2

- [ ] Al menos un `LLM_ENTRYPOINT` identificado
- [ ] `QUOTA_BACKEND` registrado (`redis` | `upstash` | `none`) y `QUOTA_MODE` (`full` | `degraded`)
- [ ] `circuit-breaker.ts` confirmado para generación (no excluido)
- [ ] `TEST_RUNNER` registrado (o "manual" si no hay runner)

### OUTPUTS
- `LLM_ENTRYPOINTS`, `QUOTA_BACKEND`, `QUOTA_MODE`, `TEST_RUNNER`, `DEST_DIR` (en memoria de sesión)

### IF FAILS
```
No se detecta integración LLM:
  → BLOCKING — "No hay integración LLM cuyo costo gobernar. Ejecutar /llm-integration primero."
  → No generar archivos.

No hay backend de quota (Redis/Upstash) y sin --quota-backend:
  → NO abortar. Advertir "Sin backend de quota: per-user limits no pueden aplicarse".
  → Ofrecer continuar: A) solo circuit breaker + budget enforcer (QUOTA_MODE=degraded)
                       B) abortar y configurar Redis/Upstash primero (ver REFERENCE.md)
  → Por default ofrecer A. quota-tracker.ts se genera como stub no-op documentado.

Usuario excluye circuit-breaker.ts:
  → @ml-engineer veta BREACHED. Explicar: sin breaker no hay protección ante
    degradación del modelo (cost p95 disparado). NO continuar.

package.json no existe:
  → Preguntar el stack al usuario (runner de tests, lenguaje, backend de cache).
  → Registrar respuesta manual y continuar.
```

---

## PHASE 2: Budget/Quota Model

### GATE IN
- [ ] Phase 1 completada — `LLM_ENTRYPOINTS` y `QUOTA_BACKEND` registrados

### MUST DO
> ⚠️ Todas las acciones son OBLIGATORIAS

1. [ ] **Mapear cada feature a su budget**: por cada `LLM_ENTRYPOINT`, definir un `feature_id` con:
   - `usd_per_request_p95` — costo p95 tolerado por request (gate Environment)
   - `usd_monthly_budget` — presupuesto mensual de la feature
   - `per_user_daily_tokens` — quota diaria por usuario (solo si `QUOTA_MODE = full`)

2. [ ] **Definir la `fallback_chain` por feature** — SOLO modelos más baratos en orden descendente de costo:
   - Cadena de referencia: `opus → sonnet → haiku` (`claude-sonnet-4-5`, `claude-haiku-4-5`)
   - NUNCA listar un modelo más caro que el primario. `mem_save` la decisión de chain en el momento
   - Registrar `FALLBACK_CHAINS` por feature

3. [ ] **Configurar el circuit breaker**: `error_threshold_pct` (default 50), `window_seconds` (default 60), `half_open_requests` (default 3)
   - El breaker abre cuando el costo p95 o el error rate supera el threshold en la ventana deslizante

4. [ ] **Definir las quotas por tier de usuario** (solo si `QUOTA_MODE = full`): `free`, `pro`, `enterprise` → `per_user_daily_tokens` por tier

5. [ ] **Fijar el método de estimación PRE-call**: token counting del provider (Anthropic count_tokens / tiktoken) para `cost-estimator.ts`. La estimación es PREVIA al gasto, nunca posterior

### CHECKPOINT
> ✅ Verificar antes de Phase 3

- [ ] Cada feature tiene `usd_per_request_p95`, `usd_monthly_budget` y `fallback_chain`
- [ ] Toda `fallback_chain` degrada SOLO hacia modelos más baratos (validado por `@ml-engineer`)
- [ ] Config del circuit breaker definida (threshold, ventana, half-open)
- [ ] Si `QUOTA_MODE = full`: quotas por tier definidas. Si `degraded`: documentado que per-user no aplica
- [ ] Método de estimación PRE-call fijado

### OUTPUTS
- Budget model documentado: feature → (`p95`, `monthly`, `fallback_chain`), config del breaker, quotas por tier, método de estimación

### IF FAILS
```
fallback_chain incluye un modelo más caro que el primario:
  → Rechazar. @ml-engineer veta. El fallback SOLO degrada (opus→sonnet→haiku).
  → Reordenar la cadena por costo ascendente inverso (más barato al final).

No se define usd_per_request_p95 para una feature:
  → Pedir el valor. Sin él, CASTLE E no puede evaluar el gate de costo.
  → Usar el costo medio del modelo primario * 2 como default conservador y advertir.

QUOTA_MODE=degraded pero el usuario insiste en per-user quota:
  → Explicar: per-user requiere estado compartido (Redis/Upstash) para contar tokens
    por usuario a través de requests. Sin backend, no es posible. Ofrecer setup (REFERENCE.md).
```

---

## PHASE 3: Cost-Gate Generation

### GATE IN
- [ ] Phase 2 completada — budget model, chains y config del breaker registrados

### MUST DO
> ⚠️ Todas las acciones son OBLIGATORIAS. El skill DOCUMENTA y genera los archivos en el proyecto del usuario; ver código de referencia en `REFERENCE.md`.

1. [ ] **Crear directorio** `{DEST_DIR}/` si no existe. NUNCA sobreescribir un archivo existente sin confirmación explícita del usuario

2. [ ] **Generar `cost-estimator.ts`** — `estimate(messages, model)`: cuenta tokens PRE-call y multiplica por el precio del modelo. Devuelve `usd` estimado ANTES de la llamada. NUNCA estima post-call

3. [ ] **Generar `budget-enforcer.ts`** — `check(featureId, estimatedUsd, userId)`:
   - Verifica `usd_per_request_p95` (este request) y `usd_monthly_budget` (acumulado de la feature) ANTES de gastar
   - Si excede: señala al `model-router` para hacer fallback (NO error 500)

4. [ ] **Generar `quota-tracker.ts`** — per-user quota con `QUOTA_BACKEND`:
   - Si `QUOTA_MODE = full`: incrementa tokens del usuario en Redis/Upstash con TTL diario; al exceder `per_user_daily_tokens` devuelve **HTTP 429** con `"daily token quota exceeded"` y registra en el AI Audit Ledger
   - Si `QUOTA_MODE = degraded`: stub no-op que SIEMPRE permite, con comentario `"quota disabled: no backend configured"`

5. [ ] **Generar `circuit-breaker.ts`** — máquina de estados open/half-open/closed con ventana deslizante:
   - `closed` → cuenta errores/costo p95; si supera `error_threshold_pct` en `window_seconds` → `open`
   - `open` → rechaza el modelo primario, delega al router para fallback; tras el timeout → `half-open`
   - `half-open` → permite `half_open_requests`; si pasan → `closed`, si fallan → `open`
   - OBLIGATORIO: cada transición open/close registra evento en el AI Audit Ledger

6. [ ] **Generar `model-router.ts`** — `route(featureId, ctx)`:
   - Consulta breaker + budget enforcer; si el primario está bloqueado, recorre la `fallback_chain` (opus→sonnet→haiku) hasta encontrar un modelo permitido
   - Devuelve SIEMPRE una respuesta (degradada si hace falta), NUNCA error 500 por circuito abierto

7. [ ] **Generar `cost-gate.config.yaml`** — budgets por feature, `fallback_chain`, quotas por tier, config del breaker (formato completo en `REFERENCE.md`)

8. [ ] **Integrar el router en los `LLM_ENTRYPOINTS`**: documentar el wiring `estimate → budget → quota → route → call` en cada entrypoint

### CHECKPOINT
> ✅ Verificar antes de Phase 4

- [ ] `cost-estimator.ts`, `budget-enforcer.ts`, `model-router.ts`, `circuit-breaker.ts` generados
- [ ] `quota-tracker.ts` generado (full con Redis/Upstash, o stub no-op si degraded)
- [ ] `cost-gate.config.yaml` con budgets, chains, quotas y config del breaker
- [ ] El router degrada SOLO hacia modelos más baratos y nunca devuelve 500 por circuito abierto
- [ ] El estimador cuenta tokens PRE-call (no post-call)

### OUTPUTS
- `{DEST_DIR}/{cost-estimator,budget-enforcer,quota-tracker,model-router,circuit-breaker}.ts`
- `cost-gate.config.yaml`

### IF FAILS
```
Archivo de cost-gate ya existe en el proyecto:
  → Preguntar antes de sobreescribir (A: sobreescribir / B: saltar). NUNCA sin confirmación.

mkdir falla (permisos):
  → Pedir al usuario crear el directorio manualmente, reintentar generación.

QUOTA_MODE=degraded:
  → quota-tracker.ts se genera como stub no-op (siempre permite). Documentar la limitación.
  → NO generar dependencia a Redis/Upstash que el proyecto no tiene.

Se intenta omitir circuit-breaker.ts:
  → DETENER. @ml-engineer veta BREACHED. El breaker es obligatorio.
```

---

## PHASE 4: Gates & Load Testing

### GATE IN
- [ ] Phase 3 completada — los 5 `.ts` y `cost-gate.config.yaml` generados

### MUST DO
> ⚠️ Todas las acciones son OBLIGATORIAS

1. [ ] **Test del circuit breaker bajo degradación** (vía `TEST_RUNNER`):
   - Simular que el costo p95 sube de `0.05` a `0.12` (degradación del modelo)
   - Verificar que `circuit-breaker.ts` ABRE el circuito tras `half_open_requests` (3) requests consecutivos sobre threshold
   - Verificar que `model-router.ts` hace fallback a `claude-haiku-4-5`
   - Verificar que el usuario recibe respuesta (degradada) SIN error 500
   - Mapea Gherkin: "Circuit breaker activa fallback automático"

2. [ ] **Test de quota per-user** (solo si `QUOTA_MODE = full`):
   - Usuario free con `per_user_daily_tokens: 50000` consume 50001 tokens
   - Verificar que el request es rechazado con **HTTP 429** y mensaje `"daily token quota exceeded"`
   - Verificar que el evento queda registrado en el AI Audit Ledger
   - Mapea Gherkin: "Quota per-user bloqueada al límite diario"
   - Si `QUOTA_MODE = degraded`: documentar que este test NO aplica (stub no-op) y por qué

3. [ ] **Gate `usd_per_request_p95`** (CASTLE E):
   - Medir el costo p95 por request en el load test contra el threshold de cada feature
   - Si SUPERA el threshold → CASTLE E **advierte** (WARNING). No es bloqueo duro: el fallback lo mitiga, pero se reporta

4. [ ] **Verificar audit logging**: un evento de quota 429 Y una transición open/close del breaker quedan en `.king/audit/YYYY-MM-DD.jsonl` y en Engram `ai_audit`

5. [ ] **Emitir reporte de costo a `@ml-engineer`** (contrato): estado del breaker, `usd_per_request_p95` por feature, `fallback_chain`, modo de quota. Si falta `circuit-breaker.ts` → veredicto **BREACHED**

6. [ ] **Escribir gates** en `.king/quality-gates.yaml` sección `ai.cost` (formato en `REFERENCE.md`)

### CHECKPOINT
> ✅ Verificar antes de Phase N+1

- [ ] Circuit breaker: abre tras 3 requests sobre threshold, router hace fallback a haiku, respuesta degradada sin 500
- [ ] Quota: 429 al exceder `per_user_daily_tokens` + evento en audit (o documentado como N/A si degraded)
- [ ] `usd_per_request_p95` medido; CASTLE E advierte si supera threshold
- [ ] Eventos 429 y open/close del breaker en `.king/audit/YYYY-MM-DD.jsonl`
- [ ] Reporte entregado a `@ml-engineer`; `circuit-breaker.ts` presente (no BREACHED)
- [ ] Gates escritos en `.king/quality-gates.yaml`

### OUTPUTS
- Resultado de gates (PASS/WARNING), reporte de costo para `@ml-engineer`, entradas de audit, sección `ai.cost` en quality-gates

### IF FAILS
```
Circuit breaker NO abre o el router devuelve error 500 en lugar de fallback:
  → ⛔ Bloqueo. Corregir la máquina de estados / wiring del router.
  → El usuario SIEMPRE debe recibir respuesta degradada, nunca 500. Re-ejecutar el test.

usd_per_request_p95 supera el threshold:
  → CASTLE E ADVIERTE (WARNING, no bloqueo). Documentar el finding.
  → Recomendar: bajar el primario de la chain o ajustar el threshold con justificación.

falta circuit-breaker.ts:
  → @ml-engineer veta BREACHED. Volver a Phase 3 y generarlo. No declarar gates PASS.

TEST_RUNNER no disponible:
  → Documentar verificación manual del breaker en el session document.
  → NO declarar gates como PASS sin evidencia de ejecución.

QUOTA_MODE=degraded en el test de quota:
  → El test de 429 no aplica (no hay backend). Documentar la limitación, no marcar FAIL.
  → El gate del breaker SÍ aplica y debe pasar.
```
