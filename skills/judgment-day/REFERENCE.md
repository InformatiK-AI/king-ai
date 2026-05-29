# judgment-day — REFERENCE

> 📚 Documentación. Esta sección NO contiene acciones — formato del reporte, prompts de jueces, matriz de comparación, modos de uso y trazabilidad Gherkin.
> Fuente: `M03-ai-excellence-core.md` §M-20.

---

## ADR-01: Dos jueces ciegos en paralelo, no uno

Un solo revisor (humano o LLM) tiene blind spots consistentes. Dos jueces independientes (`claude-sonnet`) que revisan el MISMO target SIN verse exponen conjuntos de fallos distintos. La ceguera mutua es lo que hace válida la señal de consenso: si ambos llegaron al mismo veredicto por separado, la confianza es alta.

## ADR-02: Tiebreaker solo en desacuerdo (contención de costo)

Invocar `claude-opus` en CADA review sería caro y redundante. Judge-C solo se invoca cuando A y B discrepan — el único caso donde un árbitro más capaz aporta señal. Consenso A=B es firme y NO dispara tiebreaker. Esto acota el costo de Opus a las revisiones genuinamente ambiguas.

## ADR-03: El veredicto de C es final (sin promedios)

Cuando hay tiebreaker, el veredicto final ES el de Judge-C — no un promedio de A/B/C ni una votación por mayoría. C recibe los transcripts de A y B precisamente para arbitrar con más contexto; degradar su decisión a un voto más anularía el propósito del árbitro.

## ADR-04: `--adversarial` es un MODO, no un comando

`judgment-day` se invoca SIEMPRE a través de `--adversarial` sobre un comando host. No tiene comando propio. Esto mantiene un único protocolo adversarial reutilizable por `/review`, `/plan`, `/sdd-spec` y `/ai-safety`, en vez de duplicar lógica de jueces en cada uno.

---

## Modos de uso

```
/review --adversarial               # code review adversarial (diff actual)
/plan --adversarial                 # review adversarial del plan antes de ejecutar
/sdd-spec --adversarial             # review adversarial de la spec SDD
/ai-safety --adversarial            # threat modeling adversarial de la safety layer
```

| Modo | TARGET | Jueces revisan | Output extra |
|------|--------|----------------|--------------|
| `/review --adversarial` | diff actual | código | acciones pre-merge |
| `/plan --adversarial` | plan a ejecutar | el plan (no código) | sección "Adversarial Risk Assessment" en el plan |
| `/sdd-spec --adversarial` | delta spec SDD | la spec | sección "Adversarial Risk Assessment" en la spec |
| `/ai-safety --adversarial` | `safety-pipeline.ts` + set adversarial | threat model | gaps que los gates numéricos no capturan |

> En `/ai-safety`, `--adversarial` conecta con este skill como dual blind review profundo del safety layer (ver `skills/ai-safety/REFERENCE.md` §Integración). Para `@ml-engineer` puede ser OBLIGATORIO según `ml-engineer-security.md`.

---

## Escala de veredictos

| Veredicto | Significado | Acción |
|-----------|-------------|--------|
| `FORTIFIED` | Sin hallazgos bloqueantes; target sólido | Puede mergear |
| `CONDITIONAL` | Hallazgos no críticos; requiere acciones antes de merge | Remediar y re-juzgar |
| `BREACHED` | Riesgo bloqueante (security, contrato roto) | Merge bloqueado hasta fix |

---

## Matriz de comparación A vs B (Phase 2)

| Judge A | Judge B | Resultado | Judge-C |
|---------|---------|-----------|---------|
| FORTIFIED | FORTIFIED | CONSENSO → FORTIFIED | NO |
| CONDITIONAL | CONDITIONAL | CONSENSO → CONDITIONAL | NO |
| BREACHED | BREACHED | CONSENSO → BREACHED | NO |
| FORTIFIED | CONDITIONAL | DISCREPANCIA | SÍ (tiebreaker) |
| FORTIFIED | BREACHED | DISCREPANCIA | SÍ (tiebreaker) |
| CONDITIONAL | BREACHED | DISCREPANCIA | SÍ (tiebreaker) |

> El orden A/B es irrelevante: la matriz es simétrica. Solo cuenta si los tokens de veredicto coinciden.

---

## Prompt de juez (A y B, `claude-sonnet`)

> A y B reciben EXACTAMENTE el mismo prompt y paquete. Ninguno conoce al otro.

```
Eres un juez de revisión adversarial. Recibes un TARGET (código / plan / spec / safety layer).
Tu trabajo es encontrar TODO riesgo, gap o defecto, con foco en seguridad (prompt injection,
SQL injection, exfiltración de datos, contratos rotos).

Responde SOLO en este formato:

VEREDICTO: <FORTIFIED|CONDITIONAL|BREACHED>
HALLAZGOS:
- [severidad] descripción + evidencia (línea/ruta/escenario concreto)
ACCIONES_REQUERIDAS:
- ítem concreto y accionable

NO conoces a ningún otro juez. Juzga el TARGET por su mérito propio.
```

## Prompt de tiebreaker (C, `claude-opus`)

> Solo si A y B discreparon. Recibe el TARGET + transcripts de A y B.

```
Eres el juez árbitro (tiebreaker). Dos jueces independientes discreparon sobre el mismo TARGET.

Recibes:
- El TARGET original
- TRANSCRIPT_A (veredicto + hallazgos del Juez A)
- TRANSCRIPT_B (veredicto + hallazgos del Juez B)

Tu trabajo:
1. Determinar qué juez tuvo razón y POR QUÉ (riesgo que el otro pasó por alto, o falso positivo).
2. Emitir el veredicto FINAL (este es definitivo, no se promedia).

Responde:

VEREDICTO_FINAL: <FORTIFIED|CONDITIONAL|BREACHED>
RAZON_DEL_DESACUERDO: <explicación concreta, p.ej. "Judge A no consideró el riesgo de
prompt injection en el endpoint X que Judge B sí detectó">
ACCIONES_REQUERIDAS:
- ítem concreto
```

---

## Formato del reporte adversarial

> 2 secciones si hubo consenso (Judge A, Judge B). 3 secciones si hubo tiebreaker (+ Tiebreaker).

### Caso CONSENSO (A == B, sin tiebreaker)

```markdown
## Adversarial Review — Veredicto Final

### Judge A — Veredicto: BREACHED
[hallazgos de Judge A]

### Judge B — Veredicto: BREACHED
[hallazgos de Judge B]

**Veredicto final: BREACHED** (CONSENSO — 2 jueces independientes, evidencia combinada)

Acciones requeridas antes de merge:
1. [item concreto]
2. [item concreto]
```

### Caso TIEBREAKER (A != B → Judge C)

```markdown
## Adversarial Review — Veredicto Final

### Judge A — Veredicto: CONDITIONAL
[hallazgos de Judge A]

### Judge B — Veredicto: BREACHED
[hallazgos de Judge B]

### Tiebreaker (Judge C / Opus) — Veredicto: BREACHED
Razón del desacuerdo: Judge A no consideró el riesgo de prompt injection en el endpoint...
**Veredicto final: BREACHED** (TIEBREAKER — el veredicto de Judge C es definitivo)

Acciones requeridas antes de merge:
1. [item concreto]
2. [item concreto]
```

### Caso `/plan --adversarial` y `/sdd-spec --adversarial`

Además del reporte anterior, se incorpora al artefacto host una sección:

```markdown
## Adversarial Risk Assessment
- Riesgo: [descripción] — Mitigación propuesta: [acción]
- Veredicto adversarial: <FORTIFIED|CONDITIONAL|BREACHED>
```

> Para estos modos los jueces revisan el PLAN/SPEC (no código). El veredicto se traduce en riesgos y mitigaciones dentro del propio plan/spec antes de ejecutar.

---

## Audit log — formato `.king/audit/YYYY-MM-DD.jsonl`

Cada ejecución del protocolo registra una línea JSONL (append-only):

```json
{"ts":"2026-05-28T12:00:00Z","event":"adversarial_review","mode":"review","target":"diff","verdict":"BREACHED","origin":"tiebreaker","judges":["A","B","C"],"reason":"prompt injection en endpoint X"}
```

> `origin` es `consensus` (sin C) o `tiebreaker` (con C). `judges` lista los jueces realmente invocados.

---

## Trazabilidad Gherkin → BLOCKING / REQUIRED OUTPUT

> Cada escenario de `M03-ai-excellence-core.md` §M-20 mapea a una condición verificable.

| Escenario Gherkin | Mapea a |
|-------------------|---------|
| Veredicto firme cuando A y B concuerdan → BREACHED independiente, NO tiebreaker, consenso de 2 jueces | ABSOLUTE RESTRICTION "NUNCA invocar Judge-C si A=B" + Phase 2 CONSENSO + REQUIRED OUTPUT "veredicto final con origen CONSENSO" |
| Tiebreaker invocado en desacuerdo → A=FORTIFIED, B=CONDITIONAL → C con transcripts → veredicto final = C → 3 veredictos + razón | Phase 3 GATE IN + ABSOLUTE RESTRICTION "veredicto final ES el de C" + REQUIRED OUTPUT "sección Tiebreaker + razón del desacuerdo" |
| `--adversarial` disponible en `/plan` y `/sdd-spec` → protocolo sobre el plan (no código) + sección "Adversarial Risk Assessment" | BLOCKING CONDITION "host ∈ {review,plan,sdd-spec,ai-safety}" + REQUIRED OUTPUT "sección Adversarial Risk Assessment" |

---

## Integración CASTLE / @security (contrato)

- Un veredicto adversarial `BREACHED` sobre un endpoint LLM es **veto de merge** para `@security`.
- En `/ai-safety --adversarial`, los gaps detectados por los jueces complementan los gates numéricos (`jailbreak_block_rate`, `pii_leak_rate`): los jueces capturan riesgos contextuales que los thresholds no ven.
- Contrato `ml-engineer-security.md` define cuándo `--adversarial` es OBLIGATORIO (no opt-in) para safety layers de AI.

---

## Engram first-class (resumen)

| Fase | Acción | Obligatorio |
|------|--------|-------------|
| Phase 0 | `mem_context({ topic_key: 'ai_session' })` + `mem_search` de veredictos previos | Sí |
| Veredicto final | `mem_save({ scope })` en el momento (origen, razón del desacuerdo) | Sí |
| Ejecución del protocolo | `mem_save({ topic_key: 'ai_audit', tags: ['review','adversarial',mode,target] })` | Sí |
| Phase N+1 | `mem_session_summary({ include_decisions: true, include_costs: true })` — captura costo del tiebreaker Opus | Sí |
| Engram caído | Fallback a Chronicle con advertencia | Sí |

Ver `knowledge/domain/engram-integration.md` para el contrato completo.
