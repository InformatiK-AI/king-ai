# ai-safety — PHASES (Phases 1-4)

> Sub-archivo de `SKILL.md`. Cargado via PHASE ROUTER.
> NUNCA ejecutar directamente — siempre invocado desde `skills/ai-safety/SKILL.md`.
> Recordatorio: los `.ts` NO se crean aquí. El skill DOCUMENTA cómo generarlos en el proyecto del usuario. Referencia de formatos y código: `REFERENCE.md`.

---

## PHASE 1: Threat Detection

### GATE IN
- [ ] Phase 0 (session-management) completada
- [ ] No se disparó ninguna BLOCKING CONDITION del `SKILL.md`

### MUST DO
> ⚠️ Todas las acciones son OBLIGATORIAS

1. [ ] **Detectar integración LLM existente** en el proyecto:
   - Buscar `*-client.ts` generado por `/llm-integration`, o imports de `@anthropic-ai/sdk`, `openai`, `@google/generative-ai`
   - Registrar `LLM_ENTRYPOINTS`: lista de archivos/rutas que llaman al LLM
   - Si NO se encuentra ninguno: ⛔ BLOCKING — recomendar `/llm-integration` primero y abortar

2. [ ] **Detectar el stack de tests**: `vitest` / `jest` en `package.json` → registrar `TEST_RUNNER` para `safety.test.ts`

3. [ ] **Inventariar superficies de riesgo** por endpoint:
   - ¿El input del usuario llega directo al LLM? (LLM01 directa)
   - ¿Hay contenido externo/RAG en el contexto? (LLM01 indirecta)
   - ¿La salida se persiste, embebe o renderiza? (LLM02 / LLM05)
   - ¿Hay system prompt que podría filtrarse? (LLM07)

4. [ ] **Registrar `DEST_DIR`** (default `src/ai-safety/`) y `TEST_DIR` (default `tests/ai-safety/`)

### CHECKPOINT
> ✅ Verificar antes de Phase 2

- [ ] Al menos un `LLM_ENTRYPOINT` identificado
- [ ] `TEST_RUNNER` registrado (o "manual" si no hay runner)
- [ ] Superficies de riesgo inventariadas por endpoint

### OUTPUTS
- `LLM_ENTRYPOINTS`, `TEST_RUNNER`, `DEST_DIR`, `TEST_DIR`, inventario de riesgos (en memoria de sesión)

### IF FAILS
```
No se detecta integración LLM:
  → BLOCKING — "No hay integración LLM que proteger. Ejecutar /llm-integration primero."
  → No generar archivos.

package.json no existe:
  → Preguntar el stack al usuario (runner de tests, lenguaje).
  → Registrar respuesta manual y continuar.
```

---

## PHASE 2: Threat Model (OWASP scope)

### GATE IN
- [ ] Phase 1 completada — `LLM_ENTRYPOINTS` registrados

### MUST DO
> ⚠️ Todas las acciones son OBLIGATORIAS

1. [ ] **Fijar scope v1 explícitamente** — confirmar con el usuario:
   - DENTRO: LLM01 (prompt injection), LLM02 (PII), content moderation, LLM07 (system prompt leakage)
   - FUERA (v2): LLM09 (hallucination) → solo stub. NO expandir scope (anti scope-creep)

2. [ ] **Mapear cada `LLM_ENTRYPOINT` a los guards necesarios**:
   - input guard: `prompt-guard.ts` (siempre) + `pii-redactor.ts` (si hay embedding/persistencia)
   - output guard: `pii-redactor.ts` + `content-moderator.ts` + detección LLM07

3. [ ] **Elegir proveedor de moderación** vía adapter: Anthropic Moderation (si ya usa Claude) o Azure AI Content Safety
   - Registrar `MODERATION_PROVIDER`. `mem_save` la decisión en el momento

4. [ ] **Elegir tier de PII**: regex tier (siempre) + Presidio tier (si hay PII no estructurado: nombres, direcciones)
   - Registrar `PII_TIERS`

5. [ ] **Definir thresholds** para `safety-config.yaml`: `injectionThreshold`, `moderationSeverity`, por feature

### CHECKPOINT
> ✅ Verificar antes de Phase 3

- [ ] Scope v1 confirmado por el usuario (hallucination = stub)
- [ ] Cada entrypoint mapeado a sus guards
- [ ] `MODERATION_PROVIDER` y `PII_TIERS` registrados
- [ ] Thresholds definidos

### OUTPUTS
- Threat model documentado: entrypoint → guards, `MODERATION_PROVIDER`, `PII_TIERS`, thresholds

### IF FAILS
```
Usuario pide cubrir todos los OWASP en v1 (scope creep):
  → Rechazar. Explicar: v1 = injection + PII + moderation + LLM07.
  → Hallucination (LLM09) queda como stub para v2. Documentar la decisión.

No se decide proveedor de moderación:
  → Default a Anthropic Moderation si el proyecto ya usa Claude.
  → Si no, preguntar. No generar content-moderator.ts acoplado a una API.
```

---

## PHASE 3: Pipeline Generation

### GATE IN
- [ ] Phase 2 completada — threat model y thresholds registrados

### MUST DO
> ⚠️ Todas las acciones son OBLIGATORIAS. El skill DOCUMENTA y genera los archivos en el proyecto del usuario; ver código de referencia en `REFERENCE.md`.

1. [ ] **Crear directorios** `{DEST_DIR}/` y `{TEST_DIR}/` si no existen. NUNCA sobreescribir un archivo existente sin confirmación explícita del usuario

2. [ ] **Generar `prompt-guard.ts`** — dos capas:
   - capa 1: `patternScreen()` con `INJECTION_PATTERNS` (normalizar NFKC + homoglyphs)
   - capa 2: `llmJudge()` con system prompt acotado; el input del usuario es DATO, envuelto en `<user_input>` — NUNCA concatenado al system prompt

3. [ ] **Generar `pii-redactor.ts`** — regex tier (EMAIL, SSN, CARD con validación Luhn, PHONE, IPV4) + hook Presidio tier si `PII_TIERS` lo incluye. `redact()` se aplica ANTES del embedding y en la salida

4. [ ] **Generar `content-moderator.ts`** — interfaz `ModerationProvider` (adapter); implementación según `MODERATION_PROVIDER`. Intercambiable

5. [ ] **Generar `hallucination-detector.ts`** — STUB v1: exporta la interfaz y lanza `NotImplementedError`/no-op documentado "v2". NO implementar verificación de claims

6. [ ] **Generar `safety-pipeline.ts`** — orquestador `safeComplete()`: input guard (pattern → judge → redact) → process → output guard (redact → moderate → leaksSystemPrompt). Cada bloqueo registra evento en `.king/audit/YYYY-MM-DD.jsonl`

7. [ ] **Generar `safety-config.yaml`** — thresholds por feature (formato en `REFERENCE.md`)

8. [ ] **Generar tests**: `adversarial-prompts.json` (>= 50 casos; bootstrap ~20 desde `REFERENCE.md`), `pii-test-cases.json` (nombres, emails, SSN, tarjetas), `safety.test.ts` (usa `TEST_RUNNER`)

### CHECKPOINT
> ✅ Verificar antes de Phase 4

- [ ] `prompt-guard.ts`, `pii-redactor.ts`, `content-moderator.ts`, `safety-pipeline.ts` generados
- [ ] `hallucination-detector.ts` es STUB (no implementación completa)
- [ ] `safety-config.yaml` con thresholds por feature
- [ ] `adversarial-prompts.json`, `pii-test-cases.json`, `safety.test.ts` generados
- [ ] `prompt-guard` usa pattern + judge (dos capas), input nunca concatenado al system prompt

### OUTPUTS
- `{DEST_DIR}/{prompt-guard,pii-redactor,hallucination-detector,content-moderator,safety-pipeline}.ts`
- `safety-config.yaml`
- `{TEST_DIR}/{adversarial-prompts.json,pii-test-cases.json,safety.test.ts}`

### IF FAILS
```
Archivo de safety ya existe en el proyecto:
  → Preguntar antes de sobreescribir (A: sobreescribir / B: saltar). NUNCA sin confirmación.

mkdir falla (permisos):
  → Pedir al usuario crear el directorio manualmente, reintentar generación.

Se intenta implementar hallucination-detector completo:
  → DETENER. v1 = stub. Documentar que la verificación de claims es v2.
```

---

## PHASE 4: Gates & Adversarial Testing

### GATE IN
- [ ] Phase 3 completada — guards, config y tests generados

### MUST DO
> ⚠️ Todas las acciones son OBLIGATORIAS

1. [ ] **Ejecutar `safety.test.ts`** contra `adversarial-prompts.json` y `pii-test-cases.json` (vía `TEST_RUNNER`)

2. [ ] **Gate `pii_leak_rate == 0`** — CERO tolerancia:
   - Verificar que TODO output con PII en `pii-test-cases.json` queda redactado
   - Si UNA sola fuga: ⛔ BLOQUEO INMEDIATO E INSUPERABLE. Remediar `pii-redactor.ts` antes de continuar. NO superable sin fix explícito. Veto `@security` bloqueante

3. [ ] **Gate `jailbreak_block_rate >= 95`** — medir % del set adversarial bloqueado por `safety-pipeline.ts`:
   - Si `< 95%`: ⛔ build bloqueado. Reforzar patterns/judge hasta alcanzar el umbral

4. [ ] **Verificar audit logging**: un input de injection (p.ej. "Ignore previous instructions...") devuelve status 400 Y registra el evento en `.king/audit/YYYY-MM-DD.jsonl`

5. [ ] **Si `--adversarial`**: invocar `judgment-day` sobre el safety layer (dual blind review). Conexión formal en B4. Sin el flag: opt-in, no se ejecuta por default

6. [ ] **Emitir reporte de safety a `@security`** (contrato): jailbreak_block_rate, pii_leak_rate, cobertura OWASP. Si `pii_leak_rate > 0` → veredicto BREACHED, merge bloqueado

7. [ ] **Escribir gates** en `.king/quality-gates.yaml` sección `ai.safety` (formato en `REFERENCE.md`)

### CHECKPOINT
> ✅ Verificar antes de Phase N+1

- [ ] `safety.test.ts` ejecutado
- [ ] `pii_leak_rate == 0` confirmado (cero fugas)
- [ ] `jailbreak_block_rate >= 95` confirmado
- [ ] Evento de injection registrado en `.king/audit/YYYY-MM-DD.jsonl` con status 400
- [ ] Reporte entregado a `@security`; CASTLE layer S no encuentra endpoint sin safety pipeline
- [ ] Gates escritos en `.king/quality-gates.yaml`

### OUTPUTS
- Resultado de gates (PASS/FAIL), reporte de safety para `@security`, entradas de audit, sección `ai.safety` en quality-gates

### IF FAILS
```
pii_leak_rate > 0:
  → ⛔ BLOQUEO INMEDIATO E INSUPERABLE. Veto @security bloqueante.
  → Remediar pii-redactor.ts (revisar regex, Luhn, Presidio). Re-ejecutar hasta 0.
  → NO continuar a N+1 con fugas de PII.

jailbreak_block_rate < 95:
  → Build bloqueado. Reforzar INJECTION_PATTERNS y/o bajar injectionThreshold del judge.
  → Re-ejecutar el set adversarial hasta >= 95%.

CASTLE layer S detecta endpoint LLM sin safety pipeline:
  → BREACHED — "No safety layer detectado en LLM endpoint". Merge bloqueado.
  → Conectar el endpoint a safety-pipeline.ts antes de re-evaluar.

TEST_RUNNER no disponible:
  → Documentar verificación manual en session document.
  → NO declarar gates como PASS sin evidencia de ejecución.
```
