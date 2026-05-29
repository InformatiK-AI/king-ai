# judgment-day — PHASES (Phases 1-3)

> Sub-archivo de `SKILL.md`. Cargado via PHASE ROUTER.
> NUNCA ejecutar directamente — siempre invocado desde `skills/judgment-day/SKILL.md`.
> Recordatorio: A y B son sub-agentes `claude-sonnet` CIEGOS entre sí. C es `claude-opus` y SOLO se invoca si A y B discrepan. Formato del reporte y prompts de jueces: `REFERENCE.md`.

---

## PHASE 1: Dual Blind Judges

### GATE IN
- [ ] Phase 0 (session-management) completada — MODO host y TARGET resueltos
- [ ] No se disparó ninguna BLOCKING CONDITION del `SKILL.md`
- [ ] El entorno soporta lanzar dos sub-agentes en paralelo

### MUST DO
> ⚠️ Todas las acciones son OBLIGATORIAS

1. [ ] **Construir el paquete de revisión** del TARGET según el MODO:
   - `review`: el diff actual (código)
   - `plan`: el plan a ejecutar (NO código — review del plan)
   - `sdd-spec`: la spec SDD (delta spec del cambio)
   - `ai-safety`: `safety-pipeline.ts` + set adversarial (threat modeling)

2. [ ] **Lanzar Judge-A** (`claude-sonnet`) con el paquete de revisión y el prompt de juez (ver `REFERENCE.md`):
   - Instrucción explícita: emitir veredicto `FORTIFIED` | `CONDITIONAL` | `BREACHED` + hallazgos con evidencia
   - Judge-A NO recibe ninguna referencia a Judge-B

3. [ ] **Lanzar Judge-B** (`claude-sonnet`) con el MISMO paquete y el MISMO prompt de juez, **en PARALELO** con A:
   - Judge-B NO recibe el output de Judge-A ni su existencia — ceguera mutua estricta
   - Ambos lanzamientos ocurren en el mismo turno de fan-out, no en secuencia

4. [ ] **Recolectar AMBOS transcripts** (A y B) completos: veredicto + hallazgos + evidencia de cada uno

### CHECKPOINT
> ✅ Verificar antes de Phase 2

- [ ] Judge-A y Judge-B se lanzaron en paralelo (no secuencial)
- [ ] Ningún juez vio el output del otro (ceguera mutua verificada)
- [ ] Transcript de A completo: veredicto + hallazgos
- [ ] Transcript de B completo: veredicto + hallazgos

### OUTPUTS
- `VERDICT_A`, `FINDINGS_A`, `TRANSCRIPT_A`
- `VERDICT_B`, `FINDINGS_B`, `TRANSCRIPT_B`

### IF FAILS
```
Un juez no devuelve veredicto en {FORTIFIED|CONDITIONAL|BREACHED}:
  → Re-lanzar ese juez con el prompt corregido. NO inferir su veredicto.
  → NUNCA continuar a Phase 2 con un veredicto faltante o ambiguo.

El fan-out paralelo no está disponible:
  → ⛔ BLOCKING (ver SKILL.md). El protocolo de jueces ciegos no puede garantizarse.
  → NO degradar a ejecución secuencial compartiendo contexto.

El TARGET está vacío (diff vacío / sin plan / sin spec):
  → ⛔ no hay qué juzgar. Reportar y abortar sin emitir veredicto.
```

---

## PHASE 2: Compare Verdicts

### GATE IN
- [ ] Phase 1 completada — `VERDICT_A` y `VERDICT_B` recibidos

### MUST DO
> ⚠️ Todas las acciones son OBLIGATORIAS

1. [ ] **Comparar `VERDICT_A` vs `VERDICT_B`** con la matriz de `REFERENCE.md`:
   - **Concuerdan** = mismo veredicto (ambos `FORTIFIED`, ambos `CONDITIONAL`, o ambos `BREACHED`)
   - **Discrepan** = cualquier par distinto

2. [ ] **Si concuerdan → CONSENSO (firme)**:
   - Veredicto final = el veredicto compartido
   - **NO invocar Judge-C** (anti-desperdicio, ABSOLUTE RESTRICTION)
   - Combinar `FINDINGS_A` + `FINDINGS_B` como evidencia consolidada
   - Saltar Phase 3 → ir directo a FINAL CHECKPOINT

3. [ ] **Si discrepan → escalar a Phase 3** (tiebreaker):
   - Marcar `TIEBREAKER_REQUIRED = true`
   - Preservar `TRANSCRIPT_A` y `TRANSCRIPT_B` para pasar a Judge-C

4. [ ] **Redactar las 2 secciones base** del reporte (`### Judge A`, `### Judge B`) con sus veredictos y hallazgos

### CHECKPOINT
> ✅ Verificar antes de avanzar

- [ ] Comparación A vs B resuelta como CONSENSO o DISCREPANCIA
- [ ] Si CONSENSO: Judge-C NO invocado; evidencia combinada lista; Phase 3 saltada
- [ ] Si DISCREPANCIA: `TIEBREAKER_REQUIRED = true`; transcripts preservados
- [ ] Secciones `### Judge A` y `### Judge B` redactadas

### OUTPUTS
- `CONSENSUS` (bool), `TIEBREAKER_REQUIRED` (bool)
- Si consenso: `FINAL_VERDICT` + evidencia combinada
- Secciones Judge A / Judge B del reporte

### IF FAILS
```
Los veredictos parecen "casi iguales" (p.ej. uno explicó más):
  → Solo cuenta el TOKEN de veredicto (FORTIFIED/CONDITIONAL/BREACHED). Si difieren → discrepan.
  → NO forzar consenso por similitud de prosa.

Tentación de invocar Judge-C "para confirmar" pese a consenso:
  → PROHIBIDO. Consenso A=B es firme. Invocar Opus aquí viola la ABSOLUTE RESTRICTION.
```

---

## PHASE 3: Tiebreaker (condicional)

> ⚠️ Esta fase SOLO se ejecuta si `TIEBREAKER_REQUIRED == true` (A y B discreparon).
> Si hubo consenso, esta fase NO corre (GATE IN la salta en silencio).

### GATE IN
- [ ] Phase 2 completada con `TIEBREAKER_REQUIRED == true`
- [ ] `TRANSCRIPT_A` y `TRANSCRIPT_B` disponibles

### MUST DO
> ⚠️ Todas las acciones son OBLIGATORIAS

1. [ ] **Lanzar Judge-C** (`claude-opus`) con:
   - El paquete de revisión original (mismo TARGET)
   - `TRANSCRIPT_A` y `TRANSCRIPT_B` completos como input adicional
   - Instrucción: arbitrar el desacuerdo, identificar qué juez tuvo razón y POR QUÉ, emitir veredicto final

2. [ ] **Recibir el veredicto de Judge-C** — este ES el `FINAL_VERDICT`. NO se promedia ni se sustituye por A/B

3. [ ] **Extraer la razón del desacuerdo** del transcript de C (p.ej. "Judge A no consideró el riesgo de prompt injection en el endpoint...")

4. [ ] **Redactar la 3ª sección** del reporte (`### Tiebreaker (Judge C / Opus)`) con: veredicto de C, razón del desacuerdo, y `**Veredicto final: {VERDICT_C}**`

### CHECKPOINT
> ✅ Verificar antes de FINAL CHECKPOINT

- [ ] Judge-C invocado con transcripts de A y B como input
- [ ] `FINAL_VERDICT == VERDICT_C` (el de C, no A ni B)
- [ ] Razón del desacuerdo redactada explícitamente
- [ ] Sección `### Tiebreaker (Judge C / Opus)` presente en el reporte

### OUTPUTS
- `VERDICT_C` = `FINAL_VERDICT`, razón del desacuerdo, sección Tiebreaker del reporte

### IF FAILS
```
Judge-C no resuelve (devuelve "no concluyente"):
  → Re-lanzar C con instrucción de DECIDIR obligatoriamente entre los veredictos en conflicto.
  → El protocolo requiere un veredicto final firme; C no puede abstenerse.

Tentación de promediar A, B y C o elegir "mayoría":
  → PROHIBIDO. Si hubo tiebreaker, el veredicto final ES el de C. Sin promedios ni votación.
```
