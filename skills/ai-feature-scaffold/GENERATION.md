# ai-feature-scaffold — GENERATION (Phases 3-4)

> Sub-archivo de `SKILL.md`. Cargado via PHASE ROUTER para Phases 3 y 4.
> NUNCA ejecutar directamente — siempre invocado desde `skills/ai-feature-scaffold/SKILL.md`.

---

## PHASE 3: Code Generation

### GATE IN
- [ ] Phase 1 completada — `DETECTED_TYPESCRIPT`, `DETECTED_FRAMEWORK`, `DETECTED_ORM`, `LLM_CONFIG_EXISTS` registrados
- [ ] Phase 2 completada — `FEATURE_TYPE`, `EMBEDDINGS_PROVIDER`, `VECTOR_DB`, `ORM`, `TENANT_FILTER`, `DEST_DIR` registrados

### MUST DO
> ⚠️ Todas las acciones son OBLIGATORIAS

1. [ ] **Crear directorio destino** si no existe:
   ```bash
   mkdir -p {DEST_DIR}
   ```

2. [ ] **Para cada archivo a generar, verificar si ya existe**:
   - Si existe: preguntar al usuario ANTES de sobreescribir:
     ```
     El archivo {path} ya existe. ¿Sobreescribir?
       A) Sí — sobreescribir con el template nuevo
       B) No — mantener el existente y saltar este archivo
     ```
   - NUNCA sobreescribir sin confirmación explícita

3. [ ] **Generar archivos según `FEATURE_TYPE`**:

   **Si `FEATURE_TYPE = chatbot`**:
   - `templates/chatbot/chat-api-route.ts` → `{DEST_DIR}/chat-api-route.ts`
     - Adaptar import del cliente LLM según `LLM_CONFIG_EXISTS`:
       - Si existe: `import { llmClient } from 'src/lib/llm/{provider}-client'`
       - Si no existe: comentar el import con nota `// TODO: configurar con /llm-integration`
     - Adaptar ruta según `DETECTED_FRAMEWORK`:
       - nextjs: export `POST` como Route Handler (`app/api/chat/route.ts`)
       - express/hono/fastify: export como handler de ruta
   - `templates/chatbot/ChatComponent.tsx` → `{DEST_DIR}/ChatComponent.tsx`
   - `templates/chatbot/chatbot.test.ts` → `{DEST_DIR}/chatbot.test.ts`

   **Si `FEATURE_TYPE = semantic-search`**:
   - `templates/semantic-search/embedding-client.ts` → `{DEST_DIR}/embedding-client.ts`
     - Adaptar al `EMBEDDINGS_PROVIDER` seleccionado:
       - openai: usa `openai.embeddings.create()` con `text-embedding-3-small`
       - gemini: usa `@google/generative-ai` con `text-embedding-004`
   - `templates/semantic-search/semantic-search.ts` → `{DEST_DIR}/semantic-search.ts`
   - `templates/semantic-search/semantic-search.test.ts` → `{DEST_DIR}/semantic-search.test.ts`

   **Si `FEATURE_TYPE = rag`**:
   - Según `VECTOR_DB`:
     - pgvector: `templates/rag/pgvector-store.ts` → `{DEST_DIR}/vector-store.ts`
     - pinecone: `templates/rag/pinecone-store.ts` → `{DEST_DIR}/vector-store.ts`
     - weaviate: `templates/rag/weaviate-store.ts` → `{DEST_DIR}/vector-store.ts`
   - `templates/rag/rag-pipeline-claude.ts` → `{DEST_DIR}/rag-pipeline.ts`
     - Adaptar ORM en las queries según `ORM`:
       - prisma: usar `prisma.$queryRaw` con typed results
       - drizzle: usar `db.execute(sql\`...\`)`
       - pg-raw: usar `pool.query()`
     - Si `TENANT_FILTER = true`: incluir `AND tenant_id = $tenant` en todas las queries vectoriales
     - Si `TENANT_FILTER = false`: incluir solo `AND user_id = $userId`
   - `templates/rag/migrations/add_embeddings.sql` → `src/db/migrations/add_embeddings.sql`
   - `templates/rag/rag.test.ts` → `{DEST_DIR}/rag.test.ts`

4. [ ] **Actualizar `.env.example`** — APPEND al final, nunca sobreescribir:
   ```
   # AI Feature: {FEATURE_TYPE} — /ai-feature-scaffold
   LLM_PROVIDER={provider detectado o placeholder}
   # Para embeddings (chatbot/search/rag): OPENAI_API_KEY o GOOGLE_API_KEY
   # Para RAG con Pinecone: PINECONE_API_KEY, PINECONE_INDEX
   # Para RAG con Weaviate: WEAVIATE_URL, WEAVIATE_API_KEY
   ```
   - Si `.env.example` no existe: crearlo con el bloque anterior

### CHECKPOINT
> ✅ Verificar antes de continuar a Phase 4

- [ ] `{DEST_DIR}/` creado y accesible
- [ ] Todos los archivos del feature generados (o documentados como omitidos por el usuario)
- [ ] Test file incluido en los archivos generados
- [ ] `.env.example` actualizado

### IF FAILS
> ❌ Qué hacer si la fase falla

```
Template no encontrado en skills/ai-feature-scaffold/templates/:
  → BLOCKING — reportar path exacto del template faltante al usuario
  → No generar archivo vacío como sustituto

mkdir -p falla (permisos):
  → Preguntar al usuario que cree el directorio manualmente
  → Reintentar solo la generación de archivos después de confirmación

Usuario dice "No" a sobreescribir todos los archivos:
  → Continuar con los que sí se pueden generar
  → Registrar archivos omitidos en session document

ORM en RAG pipeline no está soportado:
  → Generar con pg raw y documentar en session document
  → Agregar comentario en el código generado indicando qué adaptar
```

---

## PHASE 4: Security Validation

### GATE IN
- [ ] Phase 3 completada — archivos del feature generados en `{DEST_DIR}/`

### MUST DO
> ⚠️ Todas las acciones son OBLIGATORIAS

1. [ ] **Verificar que los archivos generados existen**:
   ```bash
   ls {DEST_DIR}/
   ```
   - Si algún archivo esperado no existe (y no fue omitido por el usuario): reportar como ERROR

2. [ ] **Security gate — buscar API keys hardcodeadas** en todos los archivos generados:
   ```bash
   grep -r "sk-ant-\|sk-\|AIza\|Bearer " {DEST_DIR}/
   ```
   - Si encuentra coincidencias: ERROR CRÍTICO — no continuar a Phase N+1:
     ```
     ERROR CRÍTICO: API key hardcodeada detectada en {archivo}.
     Remediando antes de continuar...
     ```
   - Reemplazar el valor hardcodeado con `process.env.{VARIABLE_NAME}`
   - Re-ejecutar el grep hasta obtener resultado limpio

3. [ ] **Si `FEATURE_TYPE = rag`**: verificar filtros de acceso en el código generado:
   - Confirmar que todas las queries vectoriales tienen `AND tenant_id = $tenant` o `AND user_id = $userId`
   - Si falta el filtro: agregar antes de continuar — es un riesgo de data leak entre usuarios

4. [ ] **Verificar validación de input** en endpoints generados:
   - Al menos un schema de validación (zod / joi / yup) en el handler de entrada
   - Si no hay validación: agregar comentario `// TODO: validar input con zod antes de producción`

5. [ ] **Mostrar resumen al usuario** con paths exactos:
   ```
   Archivos generados en {DEST_DIR}/:
     {lista de archivos generados}

   Migración SQL (si RAG):
     src/db/migrations/add_embeddings.sql

   Variables de entorno (.env.example):
     {lista de variables agregadas}

   Próximos pasos:
   1. Configurar variables de entorno en .env
   2. (Si RAG) Ejecutar migración: psql -f src/db/migrations/add_embeddings.sql
   3. Ejecutar tests: npm test {DEST_DIR}/
   4. Implementar lógica de negocio: /build
   ```

### CHECKPOINT
> ✅ Verificar antes de Phase N+1

- [ ] Todos los archivos generados verificados con `ls`
- [ ] Security gate pasado — grep sin keys hardcodeadas
- [ ] Filtros de acceso verificados (para RAG: tenant_id o user_id presente)
- [ ] Resumen de archivos y próximos pasos presentados al usuario

### IF FAILS
> ❌ Qué hacer si la fase falla

```
Security gate encuentra key hardcodeada:
  → ERROR CRÍTICO — no continuar a N+1
  → Remediar en el archivo afectado
  → Volver a ejecutar el grep completo

Filtro de acceso faltante en RAG:
  → Agregar filtro en el archivo afectado antes de continuar
  → No documentar como WARNING — es un data leak en potencia

Archivo esperado no existe (no fue omitido por el usuario):
  → Reportar como ERROR
  → Ofrecer regenerar el archivo faltante
  → Volver al paso correspondiente de Phase 3

grep no disponible en el ambiente:
  → Revisar manualmente los archivos generados
  → Documentar revisión manual en session document
  → Continuar — no BLOCKING si se documenta
```

---

## REFERENCE

> 📚 Información adicional. Esta sección NO contiene acciones.

### Estructura de directorios generada

```
{DEST_DIR}/                              (default: src/features/{feature-type}/)
│
│  [chatbot]
├── chat-api-route.ts                    → Handler SSE con streaming
├── ChatComponent.tsx                    → UI component (React)
└── chatbot.test.ts                      → Tests del chatbot
│
│  [semantic-search]
├── embedding-client.ts                  → Cliente de embeddings (OpenAI/Gemini)
├── semantic-search.ts                   → Búsqueda semántica con cosine similarity
└── semantic-search.test.ts              → Tests de búsqueda
│
│  [rag]
├── vector-store.ts                      → Store según vector DB elegida
├── rag-pipeline.ts                      → Pipeline retrieve→rerank→augment→generate
└── rag.test.ts                          → Tests del pipeline RAG

src/db/migrations/
└── add_embeddings.sql                   → Extensión pgvector + tabla de embeddings (solo RAG con pgvector)
```

### Templates esperados

```
skills/ai-feature-scaffold/templates/
├── chatbot/
│   ├── chat-api-route.ts
│   ├── ChatComponent.tsx
│   └── chatbot.test.ts
├── semantic-search/
│   ├── embedding-client.ts
│   ├── semantic-search.ts
│   └── semantic-search.test.ts
└── rag/
    ├── pgvector-store.ts
    ├── pinecone-store.ts
    ├── weaviate-store.ts
    ├── rag-pipeline-claude.ts
    ├── rag.test.ts
    └── migrations/
        └── add_embeddings.sql
```

### Interfaz LLMProvider (ADR-004)

```typescript
interface LLMProvider {
  complete(request: CompletionRequest): Promise<CompletionResponse>;
  stream(request: CompletionRequest): AsyncIterable<StreamChunk>;
  getCapabilities(): ProviderCapabilities;
}
```

El código generado importa el cliente via esta interfaz, no directamente el SDK del provider.
