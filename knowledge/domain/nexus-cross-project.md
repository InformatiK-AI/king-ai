# NEXUS Cross-project Memory Graph

> **⚠️ NOTA DESTACADA — M-22 es P2 (DIFERIDO)**
>
> Este documento describe el **diseño** del grafo NEXUS de memoria cross-project.
> Su **implementación activa está DIFERIDA**: el grafo operativo depende de que
> Engram exponga la extensión **`sqlite-vec`** (similarity search por embeddings),
> que es una **mejora a Engram fuera del scope de king-ai / M03**.
>
> Lo que SÍ se entrega ahora:
> - Schema SQL completo de `cross_project_patterns`.
> - Reglas de confidence scoring.
> - Flujo de uso documentado (CONDUCTOR ↔ NEXUS).
> - Skills que alimentarán el grafo.
> - Fallback funcional **sin `sqlite-vec`** (búsqueda por tag) para no bloquear valor.
>
> Lo que NO se entrega aún: el código del grafo activo, los hooks de auto-emisión
> de patterns y la indexación vectorial. NO implementar contra este documento hasta
> que `sqlite-vec` esté disponible en Engram.

---

## Overview

NEXUS es un **grafo de memoria compartida entre proyectos**. Su objetivo es que un
pattern resuelto correctamente en el **proyecto A** (por ejemplo, una integración
OAuth2 con PKCE sobre Postgres) pueda **sugerirse automáticamente** cuando el
CONDUCTOR detecta una necesidad equivalente en el **proyecto B**, sin que el usuario
tenga que recordarlo ni reescribirlo.

La pieza clave es el **confidence scoring**: un pattern NO se sugiere por existir,
sino por haber sido **verificado** (aprobado por usuarios) más veces de las que fue
**rechazado**. Esto convierte la memoria cross-project en un sistema que **aprende**
qué reusos funcionan y cuáles generan ruido.

| Concepto | Significado |
|----------|-------------|
| `pattern_key` | Identificador semántico estable del pattern (`dominio/técnica-stack`) |
| `confidence` | Probabilidad aprendida de que el reuso sea útil (0.0–1.0) |
| `embedding` | Vector del pattern para búsqueda por similitud (`sqlite-vec`) |
| `source_project` | Proyecto donde el pattern se originó |
| `target_projects` | Proyectos donde el pattern ya fue reusado con éxito |
| Threshold | Umbral mínimo de `confidence` para **sugerir** (`> 0.7`) |

---

## Schema SQL

El grafo vive en la **base de datos de Engram**, apoyado en la extensión
`sqlite-vec` para la columna `embedding`. Una sola tabla concentra el estado:

```sql
-- Tabla principal en la DB de Engram (requiere extensión sqlite-vec)
CREATE TABLE cross_project_patterns (
  pattern_key       TEXT PRIMARY KEY,   -- "auth/oauth2-pkce-postgres"
  source_project    TEXT NOT NULL,      -- proyecto origen del pattern
  target_projects   TEXT,               -- JSON array: ["proj-b","proj-c"]
  confidence        REAL DEFAULT 0.5,   -- rango 0.0–1.0
  verified_count    INTEGER DEFAULT 0,  -- nº de aprobaciones acumuladas
  rejected_count    INTEGER DEFAULT 0,  -- nº de rechazos acumulados
  embedding         BLOB,               -- vector sqlite-vec para similarity
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_verified_at  TIMESTAMP
);

-- Índice para ordenar sugerencias por confianza descendente
CREATE INDEX idx_cpp_confidence ON cross_project_patterns(confidence DESC);
```

**Notas de diseño:**

- `pattern_key` es la **clave semántica**, no un UUID. Sigue la convención
  `dominio/técnica-stack` (ej. `auth/oauth2-pkce-postgres`, `cache/redis-write-through`).
  Estable y legible — facilita el debugging y el `mem_search` manual.
- `target_projects` se almacena como **JSON array serializado** (SQLite no tiene tipo
  array nativo). Se parsea en la capa de aplicación.
- `embedding` es opcional a nivel de schema (`BLOB` nullable): si `sqlite-vec` no está
  disponible, la fila sigue siendo válida y se opera por el **fallback de tags** (ver
  más abajo).
- `confidence` arranca en `0.5` — neutral: ni se sugiere ni se descarta hasta acumular
  evidencia.

---

## Confidence Scoring

El `confidence` evoluciona con el feedback del usuario sobre cada sugerencia. Las
reglas son **asimétricas a propósito**: penalizar más fuerte el rechazo que premiar
la aprobación evita que un pattern marginalmente útil contamine otros proyectos.

| Evento | Δ confidence | Límite | Contador |
|--------|--------------|--------|----------|
| **Aprobación** (usuario reusa el pattern) | `+0.1` | cap `0.95` | `verified_count++` |
| **Rechazo** (usuario descarta la sugerencia) | `-0.2` | floor `0.05` | `rejected_count++` |
| **Sugerencia** (condición para mostrar) | — | requiere `confidence > 0.7` | — |

**Por qué los límites no son 1.0 / 0.0:**

- **cap 0.95** — nunca se llega a certeza absoluta. Siempre queda margen para que un
  cambio de contexto degrade el pattern. Evita la rigidez del "esto siempre funciona".
- **floor 0.05** — un pattern muy rechazado no se elimina, solo se hunde. Conserva
  historia (`rejected_count`) y permite recuperación si el contexto cambia.

```sql
-- Aprobación: el usuario aceptó reusar el pattern
UPDATE cross_project_patterns
SET confidence       = MIN(confidence + 0.1, 0.95),
    verified_count   = verified_count + 1,
    last_verified_at = CURRENT_TIMESTAMP
WHERE pattern_key = :pattern_key;

-- Rechazo: el usuario descartó la sugerencia
UPDATE cross_project_patterns
SET confidence     = MAX(confidence - 0.2, 0.05),
    rejected_count = rejected_count + 1
WHERE pattern_key = :pattern_key;
```

**Lectura del threshold:** solo se sugiere un pattern cuando `confidence > 0.7`. Con
`confidence` inicial `0.5`, un pattern necesita al menos **3 aprobaciones netas**
(`0.5 → 0.6 → 0.7 → 0.8`) antes de cruzar el umbral. Esto garantiza que NEXUS solo
propone reusos con evidencia real, no corazonadas.

---

## Flujo de uso

El consumidor del grafo es el **CONDUCTOR**, que interroga NEXUS cuando un Builder
está a punto de generar código en un proyecto. El ciclo es de 5 pasos:

```
┌──────────────────────────────────────────────────────────────────┐
│                    NEXUS — Flujo de sugerencia                      │
└──────────────────────────────────────────────────────────────────┘

  Proyecto B                CONDUCTOR                  NEXUS (Engram)
      │                        │                           │
 1.   │  genera código ──────▶ │                           │
      │                        │ 2. query por similarity ─▶│
      │                        │                           │ busca top-5
      │                        │ ◀─ patterns (conf DESC) ──│ por embedding
      │                        │                           │
      │ ◀─ 3. sugiere si ──────│   (confidence > 0.7)      │
      │      conf > 0.7        │                           │
 4.   │  aprueba / rechaza ──▶ │ ── update confidence ────▶│
      │                        │                           │
 5.   │                        │ ── mem_save scope:       ─▶│ persiste
      │                        │    cross_project          │ nuevo pattern
```

1. **El Builder genera código en el proyecto B.** Se detecta una intención
   (ej. "necesito auth con OAuth2").
2. **CONDUCTOR consulta NEXUS** por similitud de embedding, ordenando por confianza:

   ```sql
   SELECT pattern_key, source_project, confidence
   FROM cross_project_patterns
   WHERE embedding MATCH :query_embedding   -- sqlite-vec similarity
   ORDER BY confidence DESC
   LIMIT 5;
   ```

3. **Si algún resultado tiene `confidence > 0.7`**, CONDUCTOR **sugiere reusar** el
   pattern del proyecto origen (`source_project`). Por debajo del threshold, no se
   muestra nada — el silencio es preferible al ruido.
4. **El usuario aprueba o rechaza** la sugerencia → el `confidence` se actualiza con
   las reglas de scoring (aprobación `+0.1` / rechazo `-0.2`). Si aprueba, el proyecto
   B se agrega a `target_projects`.
5. **Al finalizar**, si surgió un pattern nuevo y exitoso, se persiste con
   `mem_save` usando `scope: cross_project`, generando (o reforzando) la fila en
   `cross_project_patterns`.

---

## Skills que alimentan NEXUS

El grafo no se llena manualmente. Ciertos skills **emiten patterns automáticamente**
cuando el usuario **confirma** que la implementación fue exitosa. En la primera fase,
dos skills actúan como fuentes:

| Skill | Pattern emitido (ejemplo `pattern_key`) | Cuándo emite |
|-------|-----------------------------------------|--------------|
| `/rag-setup` | `rag/pgvector-hybrid-search` | Tras confirmar que el pipeline RAG quedó operativo |
| `/ai-cost-gate` | `ai-cost/token-budget-guardrail` | Tras confirmar que el gate de costo se integró sin fricción |

**Regla de emisión:** un skill solo crea una fila en NEXUS si el usuario **confirma
éxito explícito**. Nunca se emite un pattern por el simple hecho de ejecutar el skill —
eso inflaría el grafo con ruido de baja confianza. La emisión nace con
`confidence = 0.5` (neutral) y debe ganarse el threshold como cualquier otro pattern.

---

## Fallback sin sqlite-vec

Mientras `sqlite-vec` NO esté disponible en Engram (estado actual — ver nota
destacada), NEXUS **degrada con elegancia** a búsqueda por **tag**, no por similitud
vectorial. Esto permite tener valor parcial sin bloquear el módulo entero.

**Estrategia de fallback:**

- Cada pattern lleva uno o más **tags** derivados de su `pattern_key`
  (ej. `auth/oauth2-pkce-postgres` → tags `auth`, `oauth2`, `postgres`).
- La consulta del CONDUCTOR busca por **coincidencia exacta de tag** en lugar de
  `embedding MATCH`, manteniendo el resto del flujo idéntico (mismo threshold, mismas
  reglas de scoring).

```sql
-- Fallback: búsqueda por tag (sin similarity vectorial)
SELECT pattern_key, source_project, confidence
FROM cross_project_patterns
WHERE pattern_key LIKE :domain_prefix || '%'   -- ej. 'auth/%'
  AND confidence > 0.7
ORDER BY confidence DESC
LIMIT 5;
```

**Limitaciones del fallback (asumidas a propósito):**

| Aspecto | Con `sqlite-vec` | Fallback por tag |
|---------|------------------|------------------|
| Match | Similitud semántica (vectorial) | Coincidencia de dominio/tag |
| Cobertura | Detecta patterns análogos no obvios | Solo lo que comparte tag literal |
| Falsos negativos | Bajos | Altos (no hay difusión semántica) |
| Dependencia | Engram + `sqlite-vec` | Solo SQLite estándar |

El fallback es **suficiente para validar el flujo end-to-end** y para patterns con
dominio bien etiquetado, pero **no sustituye** la búsqueda vectorial — por eso M-22
permanece P2 hasta que `sqlite-vec` aterrice en Engram.

---

## Resumen accionable

- NEXUS es **diseño, no implementación activa** (M-22 = P2, DIFERIDO).
- La tabla `cross_project_patterns` es la **única estructura** del grafo; ya está
  especificada y lista para crearse cuando Engram soporte `sqlite-vec`.
- El `confidence` aprende del feedback: **`+0.1` aprobación (cap `0.95`)**,
  **`-0.2` rechazo (floor `0.05`)**, **sugerir solo `> 0.7`**.
- El **CONDUCTOR** es el consumidor; `/rag-setup` y `/ai-cost-gate` son las primeras
  **fuentes**.
- Sin `sqlite-vec`, se opera por **fallback de tags** — funcional pero con menor
  cobertura semántica. NO implementar el grafo vectorial hasta que la dependencia
  exista.
