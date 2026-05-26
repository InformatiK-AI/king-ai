# llm-integration — IMPLEMENTATION (Phases 3-4)

> Sub-archivo de `SKILL.md`. Cargado via PHASE ROUTER para Phases 3 y 4.
> NUNCA ejecutar directamente — siempre invocado desde `skills/llm-integration/SKILL.md`.

---

## PHASE 3: Code Generation

### GATE IN
- [ ] Phase 1 completada — `DETECTED_TYPESCRIPT` y `DETECTED_FRAMEWORK` registrados
- [ ] Phase 2 completada — `SELECTED_PROVIDER`, `SELECTED_MODEL`, `DEST_DIR`, `ENV_VAR_NAME` registrados

### MUST DO
> ⚠️ Todas las acciones son OBLIGATORIAS

1. [ ] **Crear directorio destino** si no existe:
   ```bash
   mkdir -p {DEST_DIR}/cost-tracking
   ```

2. [ ] **Para cada archivo a generar, verificar si ya existe**:
   - Si existe: preguntar al usuario ANTES de sobreescribir:
     ```
     El archivo {path} ya existe. ¿Sobreescribir?
       A) Sí — sobreescribir con el template nuevo
       B) No — mantener el existente y saltar este archivo
     ```
   - NUNCA sobreescribir sin confirmación explícita

3. [ ] **Generar cliente del provider** desde templates:
   - Claude: `templates/claude/claude-client.ts` → `{DEST_DIR}/claude-client.ts`
   - OpenAI: `templates/openai/openai-client.ts` → `{DEST_DIR}/openai-client.ts`
   - Gemini: `templates/gemini/gemini-client.ts` → `{DEST_DIR}/gemini-client.ts`

   El cliente generado DEBE:
   - Implementar la interfaz `LLMProvider` (ADR-004): `complete()`, `stream()`, `getCapabilities()`
   - Leer la API key exclusivamente de `process.env.{ENV_VAR_NAME}`
   - Usar `{SELECTED_MODEL}` como modelo default exportado como constante

4. [ ] **Generar templates compartidos** (independientemente del provider):
   - `templates/shared/streaming/sse-handler.ts` → `{DEST_DIR}/sse-handler.ts`
   - `templates/shared/cost-tracking/token-counter.ts` → `{DEST_DIR}/cost-tracking/token-counter.ts`
   - `templates/shared/cost-tracking/llm_usage.sql` → `src/db/migrations/create_llm_usage.sql`

5. [ ] **Generar SSE handler del provider**:
   - `templates/{SELECTED_PROVIDER}/chatbot-sse-{SELECTED_PROVIDER}.ts` → `{DEST_DIR}/chatbot-sse.ts`

6. [ ] **Actualizar `.env.example`** — APPEND, nunca sobreescribir el archivo completo:
   ```
   # LLM Provider — /llm-integration
   LLM_PROVIDER={SELECTED_PROVIDER}
   {ENV_VAR_NAME}=your-api-key-here
   LLM_MODEL={SELECTED_MODEL}
   ```
   - Si `.env.example` no existe: crearlo con el bloque anterior

7. [ ] **Ofrecer instalar dependencia del provider**:
   ```
   ¿Instalo la dependencia del provider?
     Claude → npm install @anthropic-ai/sdk
     OpenAI → npm install openai
     Gemini → npm install @google/generative-ai
   ```
   - Si el usuario acepta: ejecutar el comando correspondiente
   - Si el usuario declina: documentar en session document, continuar

### CHECKPOINT
> ✅ Verificar antes de continuar a Phase 4

- [ ] `{DEST_DIR}/{SELECTED_PROVIDER}-client.ts` generado
- [ ] `{DEST_DIR}/sse-handler.ts` generado
- [ ] `{DEST_DIR}/chatbot-sse.ts` generado
- [ ] `{DEST_DIR}/cost-tracking/token-counter.ts` generado
- [ ] `src/db/migrations/create_llm_usage.sql` generado
- [ ] `.env.example` actualizado con bloque del provider
- [ ] Dependencia instalada o declive documentado

### IF FAILS
> ❌ Qué hacer si la fase falla

```
Template no encontrado en skills/llm-integration/templates/:
  → BLOCKING — reportar path exacto del template faltante al usuario
  → No generar archivo vacío como sustituto

mkdir -p falla (permisos):
  → Preguntar al usuario que cree el directorio manualmente
  → Reintentar solo la generación de archivos después de confirmación

npm install falla:
  → Registrar el error en session document
  → Continuar — la instalación manual es responsabilidad del usuario
  → Documentar el comando correcto en el resumen final

Usuario dice "No" a sobreescribir todos los archivos:
  → Continuar con los que sí se pueden generar
  → Registrar archivos omitidos en session document
```

---

## PHASE 4: Validation

### GATE IN
- [ ] Phase 3 completada — archivos generados en `{DEST_DIR}/`

### MUST DO
> ⚠️ Todas las acciones son OBLIGATORIAS

1. [ ] **Verificar que los archivos generados existen**:
   ```bash
   ls {DEST_DIR}/
   ls src/db/migrations/create_llm_usage.sql
   ```
   - Si algún archivo esperado no existe: reportar como WARNING (no BLOCKING si fue omitido por el usuario)

2. [ ] **Security gate — buscar API keys hardcodeadas** en todos los archivos generados:
   ```bash
   grep -r "sk-ant-\|sk-\|AIza\|AAAA" {DEST_DIR}/
   ```
   - Si encuentra coincidencias: ERROR CRÍTICO
     ```
     ERROR CRÍTICO: API key hardcodeada detectada en {archivo}.
     Remediando antes de continuar...
     ```
   - Reemplazar el valor hardcodeado con `process.env.{ENV_VAR_NAME}`
   - Re-ejecutar el grep hasta obtener resultado limpio
   - NO continuar a Phase N+1 con keys hardcodeadas

3. [ ] **Verificar uso de `process.env.*`** en el cliente generado:
   - Buscar que la API key se lee de `process.env.{ENV_VAR_NAME}`
   - Si no se encuentra: corregir antes de continuar

4. [ ] **Mostrar resumen de archivos generados** con paths exactos:
   ```
   Archivos generados en {DEST_DIR}/:
     {SELECTED_PROVIDER}-client.ts
     sse-handler.ts
     chatbot-sse.ts
     cost-tracking/token-counter.ts

   Migración SQL:
     src/db/migrations/create_llm_usage.sql

   Variables de entorno (.env.example):
     LLM_PROVIDER={SELECTED_PROVIDER}
     {ENV_VAR_NAME}=your-api-key-here
     LLM_MODEL={SELECTED_MODEL}
   ```

5. [ ] **Mostrar próximos pasos al usuario**:
   ```
   Próximos pasos:

   1. Configurar variable de entorno:
      export {ENV_VAR_NAME}=tu-api-key

   2. Importar el cliente en tu código:
      import { createLLMClient } from '{DEST_DIR}/{SELECTED_PROVIDER}-client'

   3. Ejecutar la migración SQL:
      (usar el ORM o cliente de BD de tu proyecto)

   4. Para generar un chatbot, search o RAG sobre esta integración:
      /ai-feature-scaffold
   ```

### CHECKPOINT
> ✅ Verificar antes de Phase N+1

- [ ] Todos los archivos generados verificados con `ls`
- [ ] Security gate pasado — grep sin resultados de keys hardcodeadas
- [ ] `process.env.*` confirmado en el cliente generado
- [ ] Resumen de archivos presentado al usuario
- [ ] Próximos pasos comunicados

### IF FAILS
> ❌ Qué hacer si la fase falla

```
Security gate encuentra key hardcodeada:
  → ERROR CRÍTICO — no continuar a N+1
  → Remediar en el archivo afectado
  → Volver a ejecutar el grep completo

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
{DEST_DIR}/                          (default: src/lib/llm/)
├── {provider}-client.ts             → Implementa LLMProvider
├── sse-handler.ts                   → SSE streaming compartido
├── chatbot-sse.ts                   → SSE handler específico del provider
└── cost-tracking/
    └── token-counter.ts             → Tracking de tokens y costo

src/db/migrations/
└── create_llm_usage.sql             → Tabla de usage para auditoría
```

### Interfaz LLMProvider (ADR-004)

```typescript
interface LLMProvider {
  complete(request: CompletionRequest): Promise<CompletionResponse>;
  stream(request: CompletionRequest): AsyncIterable<StreamChunk>;
  getCapabilities(): ProviderCapabilities;
}
```

Todos los clientes generados deben implementar esta interfaz. El archivo de tipos compartidos (`types.ts`) se incluye como parte de los templates compartidos.

### Templates esperados

```
skills/llm-integration/templates/
├── claude/
│   ├── claude-client.ts
│   └── chatbot-sse-claude.ts
├── openai/
│   ├── openai-client.ts
│   └── chatbot-sse-openai.ts
├── gemini/
│   ├── gemini-client.ts
│   └── chatbot-sse-gemini.ts
└── shared/
    ├── streaming/
    │   └── sse-handler.ts
    └── cost-tracking/
        ├── token-counter.ts
        └── llm_usage.sql
```
