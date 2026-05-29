# Engram First-Class Integration

Engram es la capa de memoria persistente de `king-ai`. No es opcional ni un add-on: es un **first-class citizen** que TODOS los skills de `king-ai` DEBEN consumir. Este documento define las APIs primarias, los patterns obligatorios, el fallback a Chronicle y la preparación para el grafo NEXUS.

---

## 1. Por qué Engram es first-class

Un agente AI sin memoria persistente repite los mismos análisis, vuelve a proponer decisiones ya descartadas y pierde el contexto entre sesiones. Engram resuelve esto persistiendo decisiones, vetos, convenciones y costos en un store local (SQLite + `sqlite-vec`) que sobrevive a compactaciones, cierres de sesión y cambios de máquina.

La regla central de `king-ai`:

> Si un skill toma una decisión de diseño AI, descarta un enfoque, o descubre una restricción del proyecto, esa información se persiste en Engram **en el momento**, no al final. La memoria que no se escribe cuando ocurre el evento se pierde.

---

## 2. APIs primarias — cuándo y cómo

Engram expone tres APIs que cubren el 90% de los casos de uso en `king-ai`.

| API | Cuándo usarla | Qué hace |
|-----|--------------|----------|
| `mem_context` | Al **inicio** de cada skill y tras una compactación | Pre-carga el historial reciente de la sesión por `topic_key` |
| `mem_search` | Antes de proponer una decisión o repetir un análisis | Búsqueda por similaridad vectorial sobre observaciones previas |
| `mem_save` | Inmediatamente al tomar una decisión, descartar un enfoque o descubrir una convención | Persiste una observación con `topic_key`, `tags` y `scope` |

### 2.1 `mem_context` — pre-cargar contexto

Recupera las últimas N observaciones de un `topic_key`. Se llama SIEMPRE al arrancar un skill para que el agente razone con la memoria de sesiones anteriores, no desde cero.

```typescript
// Al inicio de cada skill de king-ai
const aiContext = await mem_context({
  topic_key: 'ai_session',
  limit: 5,
});
// aiContext contiene decisiones, vetos y convenciones recientes.
// El agente las inyecta en su razonamiento antes de actuar.
```

### 2.2 `mem_search` — recuperar decisiones pasadas

Búsqueda semántica por similaridad. Úsala ANTES de proponer una arquitectura: si ya se evaluó pgvector vs Pinecone para código similar, la decisión previa debe pesar.

```typescript
const prior = await mem_search({
  query: 'vector database choice for RAG self-hosted',
  tags: ['rag', 'architecture'],
  limit: 3,
});
// Si prior contiene un veto previo, NO re-proponer ese enfoque sin justificación nueva.
```

### 2.3 `mem_save` — persistir decisiones

Persiste una observación. `topic_key` agrupa, `tags` filtran, `scope` define visibilidad (`project` | `cross_project`).

```typescript
await mem_save({
  topic_key: 'rag_architecture_decision',
  content: 'Elegido pgvector sobre Pinecone: menor latencia en self-hosted, costo 0 en licencias, control total del tenant_id en queries.',
  tags: ['rag', 'architecture', 'vector_db'],
  scope: 'project',
});
```

> Regla de granularidad: una observación = una decisión atómica. No mezclar tres decisiones en un solo `mem_save` — la búsqueda semántica pierde precisión y el grafo NEXUS no puede relacionar nodos.

---

## 3. Hooks SessionStart — pre-cargar contexto automáticamente

El contexto AI no debe depender de que el agente "se acuerde" de llamar `mem_context`. Se pre-carga vía hook `SessionStart`, de modo que cada sesión arranca con la memoria ya disponible.

```bash
# .claude/hooks/session-start-engram.sh
# Hook SessionStart: inyecta contexto AI antes de que el agente razone.
mem_context --topic-key ai_session --limit 5 --format inject
```

El `topic_key: ai_session` es el canal estándar de continuidad entre sesiones de `king-ai`. Cualquier skill que cierre con `mem_session_summary` (ver §8) alimenta este canal, y el hook `SessionStart` lo recupera en la siguiente sesión.

| Hook | `topic_key` | Propósito |
|------|------------|-----------|
| `SessionStart` | `ai_session` | Pre-cargar decisiones y convenciones de la sesión anterior |
| `SessionEnd` / Phase N+1 | `ai_session` | Persistir el resumen de sesión vía `mem_session_summary` |

---

## 4. AI Audit Ledger en Engram

El audit trail de operaciones de agentes AI persiste en Engram como un canal dedicado e inmutable. Cada acción relevante de un agente (decisión, veto, ejecución de fase) se registra con metadata que permite reconstruir la trazabilidad completa.

- **`topic_key`**: `ai_audit`
- **`tags`**: `[agent_id, phase, feature]`

```typescript
// Registrar una entrada en el AI Audit Ledger
await mem_save({
  topic_key: 'ai_audit',
  content: 'ml-engineer aprobó el diseño RAG en phase=build para feature=auth. Veredicto: pgvector, tenant-scoped queries obligatorias.',
  tags: ['ml-engineer', 'build', 'auth'],
  scope: 'project',
});
```

Los tres tags son obligatorios y posicionales en convención: `agent_id` identifica quién actuó, `phase` el momento del SDLC (`plan`, `build`, `qa`, `review`), y `feature` el alcance. Esto permite consultas del tipo "todas las decisiones del ml-engineer en la fase build de auth" mediante `mem_search` filtrado por tags.

> El AI Audit Ledger es complementario al audit-ledger de king-core (que vive en Chronicle). Engram aporta la capa **semántica y consultable** del audit; Chronicle aporta el log append-only crudo.

---

## 5. Fallback automático a Chronicle

Engram puede no estar disponible (plugin no instalado, store corrupto, modo restringido). En ese caso, los skills de `king-ai` **NO deben romper el flujo**: degradan a Chronicle (el log append-only de king-core) y continúan, emitiendo una advertencia.

```typescript
// Wrapper de persistencia con fallback transparente
async function persistMemory(obs: MemoryObservation): Promise<void> {
  if (await engramAvailable()) {
    await mem_save(obs);
    return;
  }

  // Degradar a Chronicle sin interrumpir el flujo
  console.warn(
    '[king-ai] Engram no disponible — degradando a Chronicle. ' +
    'La memoria semántica (búsqueda vectorial, cross-project) NO estará disponible esta sesión.'
  );
  await chronicleAppend({
    channel: obs.topic_key,
    payload: obs.content,
    tags: obs.tags,
  });
}
```

Reglas del fallback:

| Capacidad | Engram | Chronicle (fallback) |
|-----------|--------|---------------------|
| Persistencia append-only | Sí | Sí |
| Búsqueda por similaridad vectorial | Sí | No (solo grep/lectura lineal) |
| Cross-project (`scope: cross_project`) | Sí | No |
| Pre-carga `mem_context` | Sí | Lectura del log crudo |
| Encrypted at rest | Sí | Depende de la config de Chronicle |

> El fallback es de **degradación grácil**, no de paridad. La advertencia DEBE informar al usuario que pierde la capa semántica, para que sepa que las decisiones se persisten pero no serán consultables por similaridad hasta restaurar Engram.

---

## 6. Cross-project patterns — precursor de NEXUS

Las decisiones que trascienden un proyecto (convenciones de arquitectura AI, vetos universales, patterns de seguridad) se persisten con `scope: cross_project`. Esto las hace visibles desde cualquier proyecto que comparta el store Engram, y constituye el **precursor del grafo NEXUS** — el futuro grafo de conocimiento que relacionará decisiones entre todos los proyectos del usuario.

```typescript
// Pattern que aplica a CUALQUIER proyecto con LLM, no solo a este
await mem_save({
  topic_key: 'ai_security_pattern',
  content: 'Nunca llamar al LLM desde el client bundle: la API key queda expuesta en DevTools. Proxy server-side obligatorio vía /api/.',
  tags: ['security', 'llm', 'universal'],
  scope: 'cross_project',
});
```

| `scope` | Visibilidad | Uso |
|---------|------------|-----|
| `project` | Solo el proyecto actual | Decisiones específicas del contexto (elección de DB, naming, etc.) |
| `cross_project` | Todos los proyectos del store | Patterns universales, vetos de seguridad, convenciones de arquitectura AI |

> Cuando NEXUS llegue, los nodos `cross_project` ya estarán sembrados y serán los primeros candidatos a relacionarse en el grafo. Persistir con `scope: cross_project` HOY es invertir en el grafo de mañana.

---

## 7. Configuración de producción

### 7.1 Encrypted at rest

Para industrias reguladas (salud, finanzas, legal), Engram cifra el store en reposo mediante una clave provista por entorno. Sin la clave, el store no se puede leer.

```bash
# Encrypted at rest — requerido en industrias reguladas
export ENGRAM_ENCRYPTION_KEY="<clave-de-32-bytes-base64>"
```

> La clave NUNCA va en el repo ni en el chat. Se inyecta vía variable de entorno o gestor de secretos. Si `ENGRAM_ENCRYPTION_KEY` está presente, Engram cifra automáticamente; si se rota la clave, el store anterior queda ilegible (rotación = re-encriptación explícita).

### 7.2 Vector similarity (`sqlite-vec`)

Engram usa `sqlite-vec` para búsqueda por similaridad de embeddings. El caso de uso clave en `king-ai`: **pre-cargar el contexto de vetos anteriores para código similar**. Cuando el agente va a revisar o generar código parecido a algo ya evaluado, `mem_search` recupera por vecindad vectorial las decisiones y vetos previos sobre ese patrón.

```typescript
// Antes de revisar un módulo de auth, recuperar vetos sobre código similar
const priorVetoes = await mem_search({
  query: 'JWT refresh token rotation implementation',
  tags: ['veto', 'security'],
  limit: 5,
});
// Si hubo un veto previo sobre el mismo patrón, el agente lo aplica sin re-debatir.
```

### 7.3 Multi-user shared mode

Para equipos, Engram opera contra un servidor central compartido en lugar del store local. Todos los miembros leen y escriben la misma memoria, de modo que una decisión tomada por un dev queda disponible para el resto.

```bash
# Multi-user shared mode — servidor central de equipo
export ENGRAM_MODE="shared"
export ENGRAM_SERVER_URL="https://engram.equipo.internal"
export ENGRAM_AUTH_TOKEN="<token-por-usuario>"
```

| Modo | Store | Cuándo |
|------|-------|--------|
| `local` (default) | SQLite local del usuario | Trabajo individual |
| `shared` | Servidor central del equipo | Equipos que comparten convenciones y vetos AI |

---

## 8. Pattern obligatorio para TODOS los skills de `king-ai`

Este es el contrato de integración. Todo skill de `king-ai` DEBE seguir las tres fases: cargar contexto al inicio, persistir decisiones cuando ocurren, y cerrar con un session summary.

```typescript
// ── Phase 0: Load Context ───────────────────────────────────────────
// Al inicio de CADA skill: cargar contexto AI de sesiones anteriores.
const aiContext = await mem_context({ topic_key: 'ai_session', limit: 5 });

// ── Durante el skill: persistir CADA decisión de diseño AI ─────────
// En el momento en que se toma la decisión, NO al final.
await mem_save({
  topic_key: 'rag_architecture_decision',
  content: 'Elegido pgvector sobre Pinecone: menor latencia en self-hosted, costo 0 en licencias.',
  tags: ['rag', 'architecture', 'vector_db'],
  scope: 'project',
});

// ── Phase N+1: Write Session ───────────────────────────────────────
// Al finalizar el skill: session summary OBLIGATORIO antes de cerrar.
await mem_session_summary({ include_decisions: true, include_costs: true });
```

### Checklist de cumplimiento por skill

| Fase | Acción | Obligatorio |
|------|--------|-------------|
| Phase 0 (inicio) | `mem_context({ topic_key: 'ai_session' })` | Sí |
| Decisión AI | `mem_save({ ... scope })` en el momento | Sí |
| Veto / descarte | `mem_save({ tags: ['veto', ...] })` | Sí |
| Acción de agente | `mem_save({ topic_key: 'ai_audit', tags: [agent_id, phase, feature] })` | Sí |
| Phase N+1 (cierre) | `mem_session_summary({ include_decisions, include_costs })` | Sí |
| Engram caído | Fallback a Chronicle con advertencia | Sí |

> Un skill de `king-ai` que NO sigue este pattern está incompleto. La memoria no es una feature opcional del agente — es la diferencia entre un agente que aprende y uno que olvida en cada sesión.
