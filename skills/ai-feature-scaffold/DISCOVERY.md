# ai-feature-scaffold — DISCOVERY (Phases 1-2)

> Sub-archivo de `SKILL.md`. Cargado via PHASE ROUTER para Phases 1 y 2.
> NUNCA ejecutar directamente — siempre invocado desde `skills/ai-feature-scaffold/SKILL.md`.

---

## PHASE 1: Stack Detection

### GATE IN
- [ ] Phase 0 (session-management) completada

### MUST DO
> ⚠️ Todas las acciones son OBLIGATORIAS

1. [ ] **Leer `package.json`** del proyecto del usuario (buscar en cwd)

2. [ ] **Detectar TypeScript**: buscar `"typescript"` en `dependencies` o `devDependencies`
   - Si TypeScript encontrado: continuar a paso 3
   - Si NO encontrado: mostrar advertencia y preguntar al usuario:
     ```
     ADVERTENCIA: Este proyecto no parece ser TypeScript.
     Los templates generados por /ai-feature-scaffold son TypeScript.

     ¿Querés continuar de todas formas?
       A) Continuar — generaré TypeScript, adaptalo a tu stack
       B) Abortar — volvé cuando tengas TypeScript configurado
     ```
   - Si el usuario elige B: DETENER con mensaje:
     `"Skill abortado. Configurá TypeScript en tu proyecto y volvé a ejecutar /ai-feature-scaffold."`
   - Si el usuario elige A: registrar supuesto y continuar

3. [ ] **Detectar framework HTTP**: buscar en `dependencies` y `devDependencies`:
   - `"next"` → Next.js (App Router si version ≥ 14)
   - `"express"` → Express
   - `"hono"` → Hono
   - `"fastify"` → Fastify
   - Ninguno → registrar como "desconocido"

4. [ ] **Detectar ORM** (crítico para RAG): buscar en `dependencies` y `devDependencies`:
   - `"prisma"` o `"@prisma/client"` → Prisma
   - `"drizzle-orm"` → Drizzle
   - `"pg"` o `"@neondatabase/serverless"` → pg raw
   - Ninguno → registrar como "no detectado"

5. [ ] **Verificar configuración LLM existente** (ADR-003):
   - Buscar `src/lib/llm/` o `lib/llm/` en el filesystem
   - Verificar si `LLM_PROVIDER` o `ANTHROPIC_API_KEY` está en `.env` o `.env.example`
   - Si NO existe configuración LLM: mostrar advertencia (NO abortar):
     ```
     ⚠️ No se detectó integración LLM configurada en el proyecto.
     Recomendado: ejecutar /llm-integration primero para configurar el cliente LLM.
     ¿Continuar de todas formas? (generaré el código con imports que deberás ajustar)
     ```

6. [ ] **Registrar detecciones** para uso en Phases 2-3:
   - `DETECTED_TYPESCRIPT`: true | false (con advertencia aceptada)
   - `DETECTED_FRAMEWORK`: nextjs | express | hono | fastify | unknown
   - `DETECTED_ORM`: prisma | drizzle | pg-raw | unknown
   - `LLM_CONFIG_EXISTS`: true | false

### CHECKPOINT
> ✅ Verificar antes de continuar a Phase 2

- [ ] Stack detectado: TypeScript confirmado (o usuario aprobó continuar)
- [ ] Framework HTTP identificado (nextjs / express / hono / fastify / unknown)
- [ ] ORM detectado o marcado como "no detectado"
- [ ] Estado de configuración LLM documentado

### IF FAILS
> ❌ Qué hacer si la fase falla

```
package.json no existe:
  → No abortar — preguntar al usuario: "¿Cuál es tu stack? (ej: Next.js + TypeScript + Prisma)"
  → Registrar respuesta manual como DETECTED_FRAMEWORK, DETECTED_ORM y DETECTED_TYPESCRIPT
  → Continuar a Phase 2

package.json existe pero no tiene dependencies:
  → Registrar DETECTED_TYPESCRIPT: false, DETECTED_FRAMEWORK: unknown, DETECTED_ORM: unknown
  → Mostrar advertencia TypeScript igualmente

ORM no detectado y usuario eligió RAG:
  → Preguntar cuál usa antes de continuar a Phase 2
  → No asumir ORM — es una decisión crítica para la generación de código
```

---

## PHASE 2: Feature Configuration

### GATE IN
- [ ] Phase 1 completada
- [ ] Stack detectado o usuario confirmó continuar con advertencias

### MUST DO
> ⚠️ Todas las acciones son OBLIGATORIAS

1. [ ] **Preguntar tipo de feature** via AskUserQuestion:
   ```
   ¿Qué tipo de feature AI querés generar?

     A) chatbot — Chat con SSE streaming, historial de conversación, UI component
     B) semantic-search — Búsqueda semántica con embeddings, cosine similarity, re-ranking
     C) rag — RAG completo con vector DB, pipeline retrieve→rerank→augment→generate
   ```

2. [ ] **Configurar opciones adicionales según tipo seleccionado**:

   **Si chatbot**:
   - Confirmar provider LLM (default: detectado del env o Claude)
   - Confirmar directorio UI destino (default: `src/components/chat/`)
   - Preguntar canales (arquitectura hexagonal multicanal, ADR-005):
     ```
     ¿Qué canales va a servir el chatbot?
       A) web — solo web con SSE streaming (default)
       B) web+whatsapp — web SSE + webhook WhatsApp (firma HMAC + idempotencia)
     ```
   - Nota: el puerto de dominio (`agent/ask.ts`) es el mismo para todos los canales; cada canal
     agrega solo su adaptador de entrada. WhatsApp requiere Postgres para la tabla de idempotencia.

   **Si semantic-search**:
   - Preguntar provider de embeddings:
     ```
     ¿Qué provider de embeddings usás?
       A) OpenAI — text-embedding-3-small (recomendado, 1536 dims)
       B) Gemini — text-embedding-004 (768 dims, free tier)
     ```
   - Nota: Claude no provee embeddings — requiere OpenAI o Gemini

   **Si rag**:
   - Preguntar vector DB:
     ```
     ¿Qué vector DB usás?
       A) pgvector — PostgreSQL con extensión vector (recomendado si ya tenés Postgres)
       B) Pinecone — SaaS managed, requiere PINECONE_API_KEY
       C) Weaviate — open source o cloud, requiere WEAVIATE_URL
     ```
   - Si ORM no detectado en Phase 1: confirmar cuál usa ahora
   - Preguntar si las queries requieren filtro de tenant:
     ```
     ¿Las queries de RAG requieren filtro por tenant?
       A) Sí — agrego filtro tenant_id en todas las queries
       B) No — filtro solo por user_id
     ```

3. [ ] **Confirmar directorio destino** para archivos generados:
   - Mostrar: "¿Dónde genero los archivos? (default: `src/features/{feature-type}/`)"
   - Registrar respuesta como `DEST_DIR`

4. [ ] **Registrar configuración** para Phase 3:
   - `FEATURE_TYPE`: chatbot | semantic-search | rag
   - `CHANNELS`: web | web+whatsapp (solo chatbot; default: web)
   - `EMBEDDINGS_PROVIDER`: openai | gemini | none (solo chatbot)
   - `VECTOR_DB`: pgvector | pinecone | weaviate | none (solo si rag)
   - `ORM`: prisma | drizzle | pg-raw (solo si rag)
   - `TENANT_FILTER`: true | false (solo si rag)
   - `DEST_DIR`: path confirmado por usuario

### CHECKPOINT
> ✅ Verificar antes de continuar a Phase 3

- [ ] Feature type seleccionado (chatbot / semantic-search / rag)
- [ ] Opciones específicas del feature configuradas
- [ ] Para chatbot: canales confirmados (`CHANNELS`: web | web+whatsapp)
- [ ] Para RAG: vector DB y ORM confirmados
- [ ] Directorio destino registrado en `DEST_DIR`

### IF FAILS
> ❌ Qué hacer si la fase falla

```
Usuario eligió RAG y ORM no está en los soportados (prisma/drizzle/pg-raw):
  → Documentar: "ORM no soportado, generaré con pg raw"
  → Registrar DETECTED_ORM: pg-raw y continuar

Embeddings requeridos (semantic-search o rag) y no hay OpenAI ni Gemini configurado:
  → Advertir: "Claude no provee embeddings. Necesitás OPENAI_API_KEY o GOOGLE_API_KEY."
  → Preguntar cuál configurará — no abortar

Usuario no selecciona feature type:
  → NO continuar — repetir la pregunta
  → No asumir tipo por defecto — es una decisión del usuario

Usuario no confirma directorio:
  → Usar default: src/features/{feature-type}/
  → Documentar supuesto en session document
```

---

## REFERENCE

> 📚 Información adicional. Esta sección NO contiene acciones.

### Defaults por feature type

| Feature | Embeddings | Vector DB | Directorio default |
|---------|------------|-----------|-------------------|
| chatbot | ninguno | ninguno | `src/features/chatbot/` |
| semantic-search | openai (text-embedding-3-small) | — | `src/features/semantic-search/` |
| rag | openai (text-embedding-3-small) | pgvector | `src/features/rag/` |

### Compatibilidad de providers de embeddings

| Provider | Modelo | Dimensiones | Requiere |
|----------|--------|-------------|---------|
| OpenAI | text-embedding-3-small | 1536 | `OPENAI_API_KEY` |
| Gemini | text-embedding-004 | 768 | `GOOGLE_API_KEY` |
| Claude | — | — | No provee embeddings |
