---
name: ai-feature-scaffold
description: "Generar features AI-powered (chatbot SSE, búsqueda semántica, RAG) en el proyecto del usuario"
argument-hint: "[--feature chatbot|semantic-search|rag] [--provider claude|openai|gemini] [--vector-db pgvector|pinecone|weaviate]"
allowed-tools: [Read, Write, Edit, Grep, Glob, Bash, Agent]
---

# /ai-feature-scaffold

Ejecutar el skill de AI feature scaffolding.

## Instrucciones

1. Invocar el skill usando la herramienta Skill con `skill: king-ai:ai-feature-scaffold`
2. Argumentos opcionales:
   - `--feature chatbot|semantic-search|rag`: tipo de feature AI a generar (default: se pregunta)
   - `--provider claude|openai|gemini`: provider LLM (default: detectado del env o Claude)
   - `--vector-db pgvector|pinecone|weaviate`: vector DB para RAG (default: se pregunta si se elige RAG)
3. Seguir todas las fases en orden:
   - Phase 0 (Session) → Phase 1-2 (DISCOVERY.md) → Phase 3-4 (GENERATION.md) → Phase N+1 (Session)
4. Agentes: @developer (primario), @ml-engineer (validación LLM patterns), @security (verificación templates)
5. Presentar resumen final con archivos generados, variables de entorno y próximos pasos

Si no se detecta integración LLM en el proyecto, recomendar ejecutar `/llm-integration` primero.
Si se elige RAG sin ORM detectado, preguntar el ORM antes de generar código.
