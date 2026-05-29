# ai-feature-scaffold — GENERATION (Phases 3-4)

> Sub-archivo de `SKILL.md`. Cargado via PHASE ROUTER para Phases 3 y 4.
> NUNCA ejecutar directamente — siempre invocado desde `skills/ai-feature-scaffold/SKILL.md`.

---

## PHASE 3: Code Generation

### GATE IN
- [ ] Phase 1 completada — `DETECTED_TYPESCRIPT`, `DETECTED_FRAMEWORK`, `DETECTED_ORM`, `LLM_CONFIG_EXISTS` registrados
- [ ] Phase 2 completada — `FEATURE_TYPE`, `CHANNELS`, `EMBEDDINGS_PROVIDER`, `VECTOR_DB`, `ORM`, `TENANT_FILTER`, `DEST_DIR` registrados

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

   **Si `FEATURE_TYPE = chatbot`** (arquitectura hexagonal multicanal, ADR-005):

   _Puerto de dominio (SIEMPRE — agnóstico al canal)_:
   - `templates/agent/types.ts` → `{DEST_DIR}/agent/types.ts`
     - Contrato canónico: `Channel`, `channelLimit`, `AgentRequest`, `AgentResponse`, `GenerateFn`
   - `templates/agent/ask.ts` → `{DEST_DIR}/agent/ask.ts`
     - Puerto de dominio: expone `ask(req): Promise<AgentResponse>` y `askStream(req): AskStreamHandle`
     - Dependencias por INYECCIÓN (`retrieve`, `generate`, `guardInput`, `guardOutput`, `resilience`).
       En el template esas deps NO se importan de módulos concretos del proyecto (no existe
       `../rag` / `../safety` aún): defaults mínimos o TODOs de cableado
   - `templates/agent/resilience.ts` → `{DEST_DIR}/agent/resilience.ts`
     - `withTimeout`, `withRetry` (backoff exponencial + jitter), `DEFAULT_RESILIENCE`
   - `templates/agent/index.ts` → `{DEST_DIR}/agent/index.ts` (fachada del dominio)
   - `templates/agent/providers/llmprovider-adapter.ts` → `{DEST_DIR}/agent/providers/llmprovider-adapter.ts`
     - Implementa `GenerateFn` sobre `LLMProvider` (ADR-004) o el SDK directo; único archivo que
       conoce el cliente concreto

   _Adaptador de entrada WEB (SSE)_:
   - `templates/chatbot/chat-api-route.ts` → `{DEST_DIR}/chat-api-route.ts`
     - Traduce el request HTTP a `AgentRequest` (`channel: "web"`) y llama `askStream()`
     - Adaptar import del cliente LLM según `LLM_CONFIG_EXISTS`:
       - Si existe: `import { llmClient } from 'src/lib/llm/{provider}-client'`
       - Si no existe: comentar el import con nota `// TODO: configurar con /llm-integration`
     - Adaptar ruta según `DETECTED_FRAMEWORK`:
       - nextjs: export `POST` como Route Handler (`app/api/chat/route.ts`)
       - express/hono/fastify: export como handler de ruta
   - `templates/chatbot/ChatComponent.tsx` → `{DEST_DIR}/ChatComponent.tsx`
   - `templates/chatbot/chatbot.test.ts` → `{DEST_DIR}/chatbot.test.ts`

   _Adaptador de entrada WHATSAPP (solo si `CHANNELS = web+whatsapp`)_:
   - `templates/channels/whatsapp/signature.ts` → `{DEST_DIR}/channels/whatsapp/signature.ts`
     - Verificación de firma `X-Hub-Signature-256` (HMAC-SHA256 timing-safe); secreto desde env
   - `templates/channels/whatsapp/idempotency.ts` → `{DEST_DIR}/channels/whatsapp/idempotency.ts`
     - `claimMessage` (INSERT ... ON CONFLICT DO NOTHING) contra `webhook_dedup`
   - `templates/channels/whatsapp/parse.ts` → `{DEST_DIR}/channels/whatsapp/parse.ts`
     - Traduce el payload de Meta a `AgentRequest` canónico (`channel: "whatsapp"`)
   - `templates/channels/whatsapp/send.ts` → `{DEST_DIR}/channels/whatsapp/send.ts`
   - `templates/channels/whatsapp/whatsapp-route.ts` → `{DEST_DIR}/channels/whatsapp/whatsapp-route.ts`
     - Flujo: firma → parse → ack inmediato (< 30s) → proceso async con dedup → `agent.ask()` → send
   - `templates/channels/whatsapp/whatsapp.test.ts` → `{DEST_DIR}/channels/whatsapp/whatsapp.test.ts`
   - `templates/channels/whatsapp/migrations/create_webhook_dedup.sql` → `src/db/migrations/create_webhook_dedup.sql`

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
   # Para canal WhatsApp (CHANNELS=web+whatsapp): WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN, WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID
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

5. [ ] **Si `CHANNELS = web+whatsapp`**: verificar robustez del adaptador WhatsApp:
   - **Firma de webhook verificada**: el handler `POST` rechaza con 401 cuando `verifySignature`
     falla (HMAC-SHA256 timing-safe, secreto desde `process.env.WHATSAPP_APP_SECRET`)
   - **Idempotencia presente**: `claimMessage(messageId)` se invoca antes de procesar; duplicados
     se descartan vía la PK de `webhook_dedup`
   - **Timeout en llamadas a LLM/retrieve**: el puerto de dominio envuelve `generate` y `retrieve`
     con `withTimeout` (ver `agent/resilience.ts`); confirmar que ninguna llamada queda sin deadline
   - Si falta cualquiera de los tres: agregar antes de continuar — son requisitos de seguridad/robustez,
     no WARNINGs

6. [ ] **Si `CHANNELS = web+whatsapp`**: APPEND los gates al `.king/quality-gates.yaml` del proyecto
   (crear el archivo si no existe — nunca sobreescribir gates previos):
   ```yaml
   # AI Feature: chatbot multicanal — /ai-feature-scaffold
   ai.channel:
     webhook_signature_verified: true   # firma HMAC timing-safe en adaptadores de webhook
     idempotency_required: true         # claimMessage() antes de procesar mensajes entrantes
   ai.resilience:
     llm_timeout_required: true         # withTimeout en toda llamada a generate
     retrieve_timeout_required: true    # withTimeout en retrieve (degradación graceful si falla)
     retry_backoff: exponential-jitter  # withRetry en modo completo (no streaming)
   ```

7. [ ] **Mostrar resumen al usuario** con paths exactos:
   ```
   Archivos generados en {DEST_DIR}/:
     {lista de archivos generados}

   Migración SQL:
     (RAG)      src/db/migrations/add_embeddings.sql
     (WhatsApp) src/db/migrations/create_webhook_dedup.sql

   Variables de entorno (.env.example):
     {lista de variables agregadas}

   Próximos pasos:
   1. Configurar variables de entorno en .env
   2. (Si RAG) Ejecutar migración: psql -f src/db/migrations/add_embeddings.sql
   3. (Si WhatsApp) Ejecutar migración: psql -f src/db/migrations/create_webhook_dedup.sql
   4. Cablear las deps inyectables del puerto agent/ (retrieve / generate / guardInput / guardOutput)
   5. Ejecutar tests: npm test {DEST_DIR}/
   6. Implementar lógica de negocio: /build
   ```

### CHECKPOINT
> ✅ Verificar antes de Phase N+1

- [ ] Todos los archivos generados verificados con `ls`
- [ ] Security gate pasado — grep sin keys hardcodeadas
- [ ] Filtros de acceso verificados (para RAG: tenant_id o user_id presente)
- [ ] (web+whatsapp) Firma de webhook verificada, idempotencia presente, timeout en LLM/retrieve
- [ ] (web+whatsapp) Gates `ai.channel` / `ai.resilience` agregados a `.king/quality-gates.yaml`
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
│  [chatbot — puerto de dominio hexagonal, SIEMPRE]
├── agent/
│   ├── types.ts                         → Contrato canónico (AgentRequest/AgentResponse/Channel/GenerateFn)
│   ├── ask.ts                           → Puerto: ask() + askStream(), deps inyectables
│   ├── resilience.ts                    → withTimeout / withRetry (backoff + jitter)
│   ├── index.ts                         → Fachada del dominio
│   └── providers/llmprovider-adapter.ts → GenerateFn sobre LLMProvider (ADR-004) o SDK directo
│
│  [chatbot — adaptador de entrada WEB, SIEMPRE]
├── chat-api-route.ts                    → Adaptador SSE: HTTP → AgentRequest(web) → askStream()
├── ChatComponent.tsx                    → UI component (React)
└── chatbot.test.ts                      → Tests del chatbot
│
│  [chatbot — adaptador de entrada WHATSAPP, solo CHANNELS=web+whatsapp]
├── channels/whatsapp/
│   ├── signature.ts                     → Verificación HMAC-SHA256 timing-safe
│   ├── idempotency.ts                   → claimMessage() contra webhook_dedup
│   ├── parse.ts                         → Payload de Meta → AgentRequest(whatsapp)
│   ├── send.ts                          → Envío vía WhatsApp Cloud API
│   ├── whatsapp-route.ts                → firma → parse → ack → async + dedup → agent.ask() → send
│   └── whatsapp.test.ts                 → Tests del adaptador WhatsApp
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
├── add_embeddings.sql                   → Extensión pgvector + tabla de embeddings (solo RAG con pgvector)
└── create_webhook_dedup.sql             → Tabla webhook_dedup para idempotencia (solo canal WhatsApp)
```

### Templates esperados

```
skills/ai-feature-scaffold/templates/
├── agent/                               (puerto de dominio hexagonal — chatbot)
│   ├── types.ts
│   ├── ask.ts
│   ├── resilience.ts
│   ├── index.ts
│   └── providers/
│       └── llmprovider-adapter.ts
├── channels/whatsapp/                   (adaptador de entrada WhatsApp)
│   ├── signature.ts
│   ├── idempotency.ts
│   ├── parse.ts
│   ├── send.ts
│   ├── whatsapp-route.ts
│   ├── whatsapp.test.ts
│   └── migrations/
│       └── create_webhook_dedup.sql
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

Firma alineada con el cliente real de `shared/llm-provider.ts` de `/llm-integration`:

```typescript
interface LLMProvider {
  complete(messages: Message[], options?: CompletionOptions): Promise<CompletionResult>;
  stream(messages: Message[], options?: CompletionOptions): AsyncIterable<string>;
  getCapabilities(): ProviderCapabilities;
  getSessionUsage(): TokenUsage;
  calculateCostUSD(usage: TokenUsage): number;
}
```

El código generado importa el cliente via esta interfaz, no directamente el SDK del provider.
El puerto `GenerateFn` del dominio se implementa sobre `LLMProvider` (ver
`templates/agent/providers/llmprovider-adapter.ts`) o sobre el SDK directo.
