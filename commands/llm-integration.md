---
name: llm-integration
description: "Integrar proveedor LLM (Claude/OpenAI/Gemini) en proyectos con streaming, prompt caching y cost tracking"
argument-hint: "[--provider claude|openai|gemini] [--model <model>] [--dest <dir>]"
allowed-tools: [Read, Write, Edit, Grep, Glob, Bash, Agent]
---

# /llm-integration

Ejecutar el skill de LLM integration.

## Instrucciones

1. Invocar el skill usando la herramienta Skill con `skill: king-ai:llm-integration`
2. Argumentos opcionales:
   - `--provider claude|openai|gemini`: provider LLM a integrar (default: se pregunta)
   - `--model <model>`: modelo específico (default: claude-sonnet-4-6 / gpt-4o-mini / gemini-2.0-flash)
   - `--dest <dir>`: directorio destino para templates generados (default: src/lib/llm/)
3. Seguir todas las fases en orden:
   - Phase 0 (Session) → Phase 1-2 (PROVIDER-SETUP.md) → Phase 3-4 (IMPLEMENTATION.md) → Phase N+1 (Session)
4. Agentes: @developer (primario), @ml-engineer (validación de setup)
5. Presentar resumen final con archivos generados y próximos pasos

Si no se detecta package.json en el proyecto, advertir al usuario que se requiere un proyecto existente.
Si el usuario quiere generar features AI sobre esta integración, sugerir ejecutar `/ai-feature-scaffold` después.
