# ai-audit-ledger — PHASES (Phases 1-4)

> Sub-archivo de `SKILL.md`. Cargado via PHASE ROUTER.
> NUNCA ejecutar directamente — siempre invocado desde `skills/ai-audit-ledger/SKILL.md`.
> Recordatorio: el ledger es append-only e inmutable. El skill LEE el NDJSON y PRODUCE reportes; jamás reescribe líneas existentes. Schemas, tabla de patologías y formato CSV: `REFERENCE.md`.

---

## PHASE 1: Hook Setup & Ledger Bootstrap

### GATE IN
- [ ] Phase 0 (session-management) completada
- [ ] No se disparó ninguna BLOCKING CONDITION bloqueante del `SKILL.md`

### MUST DO
> ⚠️ Todas las acciones son OBLIGATORIAS

1. [ ] **Verificar el hook `PostToolUse otel-trace-emit`** en `hooks/hooks.json`:
   - Debe registrar `bash "${CLAUDE_PLUGIN_ROOT}/hooks/ai-audit/emit-span.sh"` con `matcher: ".*"` y `async: true`
   - Si no está registrado: registrarlo. Sin él el ledger no se alimenta y la auditoría es ciega

2. [ ] **Verificar el hook `Stop session-summary-force`** en `hooks/hooks.json`:
   - Debe forzar `mem_session_summary` cuando el agente no lo llamó (busca el flag `.king/audit/.session-summary-done`)
   - Si no está registrado: registrarlo

3. [ ] **Bootstrap del ledger**: asegurar que `.king/audit/` existe (`mkdir -p`). El `emit-span.sh` ya lo crea, pero el skill lo garantiza para los reportes
4. [ ] **Crear `.king/audit/reports/`** si no existe — destino de los 4 reportes `.md` y del CSV de export
5. [ ] **Registrar filtros activos** desde los flags: `--agent`, `--phase`, `--feature`, `--period`, `--export`, `--pathologies` (en memoria de sesión)

### CHECKPOINT
> ✅ Verificar antes de Phase 2

- [ ] `emit-span.sh` registrado como `PostToolUse otel-trace-emit` en `hooks/hooks.json`
- [ ] Hook `Stop session-summary-force` registrado en `hooks/hooks.json`
- [ ] `.king/audit/` y `.king/audit/reports/` existen
- [ ] Filtros activos registrados

### OUTPUTS
- `hooks/hooks.json` con ambos hooks registrados
- `.king/audit/` y `.king/audit/reports/` creados
- Filtros activos (en memoria de sesión)

### IF FAILS
```
emit-span.sh no está registrado en hooks/hooks.json:
  → Registrarlo (matcher ".*", async true). Sin el hook el ledger no recibe spans.
  → NUNCA usar run-hook.cmd; llamar bash "${CLAUDE_PLUGIN_ROOT}/hooks/ai-audit/emit-span.sh" directamente.
  → Comillas DOBLES alrededor de ${CLAUDE_PLUGIN_ROOT} (las simples rompen la expansión).

hooks/hooks.json no existe:
  → Crearlo con la estructura { "hooks": { "PostToolUse": [...], "Stop": [...] } }.

mkdir de .king/audit/ falla (permisos):
  → Pedir al usuario crear el directorio manualmente y reintentar.
```

---

## PHASE 2: Ingest & Normalize

### GATE IN
- [ ] Phase 1 completada — hooks registrados y `.king/audit/` existe

### MUST DO
> ⚠️ Todas las acciones son OBLIGATORIAS

1. [ ] **Leer las líneas NDJSON** de `.king/audit/*.jsonl` del período solicitado (default: día actual; `--period YYYY-MM` agrega todos los días del mes)
   - Si no hay líneas: advertir `"Ledger vacío para el período <X>"` y continuar con reportes vacíos (NO abortar, salvo en `--export csv` → ver BLOCKING CONDITION)

2. [ ] **Validar y normalizar cada entrada** contra el schema `king.ai_audit.v1` (ver `REFERENCE.md`):
   - Campos esperados: `ts, schema, event, agent_id, tool_name, duration_ms, tokens_estimated, result_status, phase, feature, session_id, input_hash`
   - Descartar (con conteo) líneas malformadas — el ledger es best-effort; una línea corrupta no aborta la ingesta

3. [ ] **Aplicar filtros activos**: `--agent`, `--phase`, `--feature` reducen el conjunto antes de los reportes
4. [ ] **Calcular el costo USD** por entrada: `tokens_estimated` × precio del modelo (ver tabla de precios en `REFERENCE.md` / `llm-integration-essentials.md`). Si no hay modelo en el span, usar el costo estimado directo
5. [ ] **Agregar índices en memoria**: por `feature`, por `agent_id`, por `phase` y por `(tool_name, input_hash, agent_id)` con ventana temporal (para la Phase 3 de patologías)

### CHECKPOINT
> ✅ Verificar antes de Phase 3

- [ ] N líneas NDJSON leídas y normalizadas; M líneas malformadas contadas (no abortaron)
- [ ] Filtros aplicados (si se pasaron)
- [ ] Costo USD calculado por entrada
- [ ] Índices por feature/agent/phase/(tool+hash) construidos

### OUTPUTS
- Conjunto de eventos normalizado y filtrado (en memoria de sesión), con costo USD por entrada y los índices de agregación

### IF FAILS
```
Ledger vacío para el período:
  → Advertir "Sin eventos en el ledger para <período>". Reportes se generan vacíos.
  → Si el flag es --export csv: abortar el export (no generar CSV vacío). Ver BLOCKING CONDITION.

Línea NDJSON malformada:
  → Descartarla, incrementar el contador de descartes, continuar. NO abortar la ingesta.
  → Reportar el conteo de descartes en el session document.

No hay tabla de precios de modelos:
  → Usar tokens_estimated como proxy y advertir que el costo USD es aproximado.
```

---

## PHASE 3: Pathology Scan

### GATE IN
- [ ] Phase 2 completada — eventos normalizados e índices construidos

### MUST DO
> ⚠️ Todas las acciones son OBLIGATORIAS. Tabla completa de patologías (señales + acciones): `REFERENCE.md`.

1. [ ] **Loop detection**: por cada `(tool_name, input_hash, agent_id)`, contar ocurrencias en ventanas deslizantes de 2 minutos
   - Si el MISMO tool se llamó **> 5 veces en 2 min con el mismo `input_hash`** → patología `loop_detection`
   - **Acción**: anexar un evento `pathology` al ledger + emitir **veto** del agente con `"Posible loop detectado — verificar condición de salida"` (Gherkin Scenario 1)

2. [ ] **Runaway agent**: por cada `agent_id`/`feature`, comparar el costo acumulado contra el estimado de los AC
   - Si `cost > 3x estimado` sin progreso (sin `result_status: success` que avance el AC) → patología `runaway_agent`
   - **Acción**: pausa + escalación al usuario

3. [ ] **Role drift**: por cada `agent_id`, verificar que las acciones (`tool_name`, `feature`) caen dentro de su scope declarado (ver scope de agente en `REFERENCE.md` / definición del agente)
   - Si ejecuta acciones fuera de su scope → patología `role_drift`
   - **Acción**: warning + log (capa S de CASTLE — `@security` lo evalúa)

4. [ ] **Cost spike**: por cada `agent_id`, comparar el costo de la sesión actual contra la media histórica del mismo agente (de Engram `ai_audit` / ledger histórico)
   - Si `costo sesión > 2x media del agente` → patología `cost_spike`
   - **Acción**: alerta FinOps

5. [ ] **Citar evidencia**: cada patología detectada referencia las líneas NDJSON (ts + input_hash) que la sustentan. NUNCA declarar una patología sin evidencia (ABSOLUTE RESTRICTION)
6. [ ] **Anexar eventos `pathology`** al ledger del día (append-only) — el ledger registra que se detectó la patología, sin mutar los spans originales

### CHECKPOINT
> ✅ Verificar antes de Phase 4

- [ ] Las 4 patologías evaluadas (loop, runaway, role drift, cost spike)
- [ ] Cada patología detectada cita las líneas NDJSON de evidencia
- [ ] Loop detection: veto emitido si se cruzó el umbral (>5 en 2 min, mismo input_hash)
- [ ] Eventos `pathology` anexados al ledger (sin mutar spans originales)

### OUTPUTS
- Lista de patologías detectadas con tipo, agente, evidencia y acción tomada
- Eventos `pathology` anexados a `.king/audit/YYYY-MM-DD.jsonl`

### IF FAILS
```
Loop detectado (>5 en 2 min, mismo input_hash):
  → Anexar evento pathology loop_detection + emitir veto del agente.
  → "Posible loop detectado — verificar condición de salida" (Gherkin Scenario 1).

Runaway agent (cost > 3x estimado sin progreso):
  → Pausa + escalación al usuario. NO continuar gastando.

Role drift (acción fuera de scope):
  → Warning + log. @security evalúa el riesgo de comportamiento (capa S).

Cost spike (sesión > 2x media del agente):
  → Alerta FinOps. Documentar en pathology-report.md.

No hay histórico para comparar (cost spike / runaway):
  → No se puede declarar la patología por falta de baseline. Documentar "sin baseline"
    y no marcar falso positivo.
```

---

## PHASE 4: Reports & Export

### GATE IN
- [ ] Phase 3 completada — patologías evaluadas con evidencia

### MUST DO
> ⚠️ Todas las acciones son OBLIGATORIAS. Formatos completos de reportes y CSV: `REFERENCE.md`.

1. [ ] **Generar `.king/audit/reports/tokens-by-feature.md`**: tokens agregados por `feature`, ordenado descendente, con % del total
2. [ ] **Generar `.king/audit/reports/cost-attribution-by-agent.md`**: costo USD estimado atribuido por `agent_id`, con tokens y nº de acciones. Validado por `@ml-engineer`
3. [ ] **Generar `.king/audit/reports/veto-rate-by-phase.md`**: por cada `phase` SDD, `vetos / total acciones` = veto-rate
4. [ ] **Generar `.king/audit/reports/pathology-report.md`**: una sección por patología (loop, runaway, role drift, cost spike) con detecciones, evidencia citada y acción tomada. Si `--pathologies` se pasó solo, este es el output principal
5. [ ] **Si `--export csv`** (Gherkin Scenario 2):
   - Generar `.king/audit/reports/<period>-cost-attribution.csv`
   - Columnas exactas: `agent_id, tool_name, tokens_estimated, cost_usd, phase, feature`
   - UTF-8 **sin BOM**, comas internas escapadas con comillas, header en la primera fila — importable en Excel/Sheets sin errores
   - Si el período tiene < 100 entradas: advertir (el Gherkin asume >= 100) pero generar igual si hay datos
6. [ ] **Persistir hallazgos en Engram**: `mem_save({ topic_key: 'ai_audit', tags: ['{agent_id}', '{phase}', '{feature}'] })` por cada patología/veto relevante

### CHECKPOINT
> ✅ Verificar antes de Phase N+1

- [ ] Los 4 reportes `.md` generados en `.king/audit/reports/`
- [ ] Si `--export csv`: CSV generado con las 6 columnas, UTF-8 sin BOM, importable
- [ ] `pathology-report.md` incluye las 4 patologías con evidencia
- [ ] Ninguna línea del ledger fue mutada (solo lectura + append de eventos pathology)
- [ ] Hallazgos persistidos en Engram (`ai_audit`, tags `[agent_id, phase, feature]`)

### OUTPUTS
- `.king/audit/reports/{tokens-by-feature,cost-attribution-by-agent,veto-rate-by-phase,pathology-report}.md`
- `.king/audit/reports/<period>-cost-attribution.csv` (si `--export csv`)
- Entradas en Engram `ai_audit`

### IF FAILS
```
--export csv con ledger vacío:
  → Abortar el export. Reportar "No hay entradas para el período <X>" (BLOCKING CONDITION).
  → NUNCA generar un CSV vacío silencioso.

CSV con BOM o comas sin escapar:
  → Re-generar UTF-8 sin BOM, escapando comas internas con comillas dobles.
  → Validar que abre en Excel/Sheets sin columnas corridas (Gherkin Scenario 2).

Engram no disponible al persistir:
  → Degradar a Chronicle con advertencia. Los reportes .md y el CSV NO dependen de Engram.
  → El ledger NDJSON sigue siendo la fuente cruda inmutable.

@ml-engineer no valida la atribución de costo:
  → Revisar la tabla de precios y el cálculo tokens × precio. No declarar el reporte final
    sin la validación del costo por agente.
```
