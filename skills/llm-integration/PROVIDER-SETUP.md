# llm-integration — PROVIDER-SETUP (Phases 1-2)

> Sub-archivo de `SKILL.md`. Cargado via PHASE ROUTER para Phases 1 y 2.
> NUNCA ejecutar directamente — siempre invocado desde `skills/llm-integration/SKILL.md`.

---

## PHASE 1: Stack Detection

### GATE IN
- [ ] Phase 0 (session-management) completada

### MUST DO
> ⚠️ Todas las acciones son OBLIGATORIAS

1. [ ] **Leer `package.json`** del proyecto del usuario (buscar en cwd)

2. [ ] **Detectar TypeScript**: buscar `"typescript"` en `dependencies` o `devDependencies`
   - Si TypeScript encontrado: continuar a paso 3
   - Si NO encontrado: ver bloque de advertencia abajo

3. [ ] **Si NO es TypeScript**: mostrar advertencia y preguntar al usuario:
   ```
   ADVERTENCIA: Este proyecto no parece ser TypeScript.
   Los templates generados por /llm-integration son TypeScript.

   ¿Querés continuar de todas formas?
     A) Continuar — generaré TypeScript, adaptalo a tu stack
     B) Abortar — volvé cuando tengas TypeScript configurado
   ```
   - Si el usuario elige B: DETENER con mensaje:
     `"Skill abortado. Configurá TypeScript en tu proyecto y volvé a ejecutar /llm-integration."`
   - Si el usuario elige A: registrar supuesto y continuar

4. [ ] **Detectar framework HTTP**: buscar en `dependencies` y `devDependencies`:
   - `"next"` → Next.js (App Router o Pages)
   - `"express"` → Express
   - `"hono"` → Hono
   - `"fastify"` → Fastify
   - Ninguno → registrar como "desconocido"

5. [ ] **Registrar detecciones** para uso en Phase 3:
   - `DETECTED_TYPESCRIPT`: true | false (con advertencia aceptada)
   - `DETECTED_FRAMEWORK`: nextjs | express | hono | fastify | unknown

### CHECKPOINT
> ✅ Verificar antes de continuar a Phase 2

- [ ] Stack detectado o usuario confirmó continuar con advertencia TypeScript
- [ ] Framework HTTP identificado (nextjs / express / hono / fastify / unknown)

### IF FAILS
> ❌ Qué hacer si la fase falla

```
package.json no existe:
  → No abortar — preguntar al usuario: "¿Cuál es tu stack? (ej: Next.js + TypeScript)"
  → Registrar respuesta manual como DETECTED_FRAMEWORK y DETECTED_TYPESCRIPT
  → Continuar a Phase 2

package.json existe pero no tiene scripts/dependencies:
  → Registrar DETECTED_TYPESCRIPT: false, DETECTED_FRAMEWORK: unknown
  → Mostrar advertencia TypeScript igualmente
```

---

## PHASE 2: Provider Configuration

### GATE IN
- [ ] Phase 1 completada
- [ ] Stack detectado o usuario confirmó continuar

### MUST DO
> ⚠️ Todas las acciones son OBLIGATORIAS

1. [ ] **Preguntar al usuario qué provider configura**:
   ```
   ¿Qué LLM provider querés integrar?

     A) Claude (Anthropic) — streaming nativo, prompt caching, 200K context
     B) OpenAI — GPT-4o/mini, cache automático, precio más bajo
     C) Gemini — Google, free tier generoso, context 1M
   ```

2. [ ] **Verificar si la API key del provider está en el ambiente**:
   - Claude: `process.env.ANTHROPIC_API_KEY`
   - OpenAI: `process.env.OPENAI_API_KEY`
   - Gemini: `process.env.GOOGLE_API_KEY`
   - Si la key NO está presente: informar qué variable configurar, NO abortar:
     ```
     INFO: {ENV_VAR} no está configurada en el ambiente.
     La configurarás después. Los archivos generados ya usan process.env.{ENV_VAR}.
     ```

3. [ ] **Preguntar modelo por defecto** (o confirmar defaults):
   - Claude: `claude-sonnet-4-6` (default)
   - OpenAI: `gpt-4o-mini` (default)
   - Gemini: `gemini-2.0-flash` (default)
   - Mostrar: "¿Usás el modelo default ({default}) o querés especificar otro?"

4. [ ] **Confirmar directorio destino** para archivos generados:
   - Mostrar: "¿Dónde genero los archivos? (default: `src/lib/llm/`)"
   - Registrar respuesta como `DEST_DIR` (default: `src/lib/llm/`)

5. [ ] **Registrar configuración** para Phase 3:
   - `SELECTED_PROVIDER`: claude | openai | gemini
   - `SELECTED_MODEL`: string
   - `ENV_VAR_NAME`: ANTHROPIC_API_KEY | OPENAI_API_KEY | GOOGLE_API_KEY
   - `DEST_DIR`: path confirmado por usuario

### CHECKPOINT
> ✅ Verificar antes de continuar a Phase 3

- [ ] Provider seleccionado (claude / openai / gemini)
- [ ] Modelo confirmado (default o customizado por el usuario)
- [ ] Directorio destino registrado en `DEST_DIR`
- [ ] Variable de entorno requerida documentada

### IF FAILS
> ❌ Qué hacer si la fase falla

```
Usuario no selecciona provider:
  → NO continuar — repetir la pregunta
  → No asumir provider por defecto — es una decisión del usuario

Usuario no confirma directorio:
  → Usar default: src/lib/llm/
  → Documentar supuesto en session document

Usuario especifica modelo desconocido:
  → Aceptar — el modelo es responsabilidad del usuario
  → Documentar en session document como "modelo custom no verificado"
```

---

## REFERENCE

> 📚 Información adicional. Esta sección NO contiene acciones.

### Defaults por provider

| Provider | SDK npm | ENV VAR | Modelo default |
|----------|---------|---------|----------------|
| Claude | `@anthropic-ai/sdk` | `ANTHROPIC_API_KEY` | `claude-sonnet-4-6` |
| OpenAI | `openai` | `OPENAI_API_KEY` | `gpt-4o-mini` |
| Gemini | `@google/generative-ai` | `GOOGLE_API_KEY` | `gemini-2.0-flash` |
