# ML Engineering Essentials (para inyección)

> Versión compacta para inyección en agents. Referencia completa: `knowledge/domain/ml-patterns.md`

## Selección de Modelo Claude

| Tarea | Modelo | Cuándo NO usar |
|-------|--------|----------------|
| Extracción, clasificación simple | claude-haiku-4-5 | Razonamiento complejo |
| Skills, agentes, análisis | claude-sonnet-4-6 | Tareas triviales (costo innecesario) |
| Razonamiento profundo, arquitectura | claude-opus-4-6 | Producción a escala (latencia + costo) |

## Token Budget Patterns

```python
# Prompt caching (obligatorio para prompts > 1024 tokens)
client.messages.create(
    model="claude-sonnet-4-6",
    system=[{"type": "text", "text": system_prompt,
             "cache_control": {"type": "ephemeral"}}],
    messages=messages
)

# Presupuesto de tokens por operación
BUDGET = {"haiku": 2_000, "sonnet": 8_000, "opus": 20_000}
```

## Fallback Pattern

```
Intento principal → timeout 30s → retry 1 vez → fallback a haiku → error visible al usuario
NUNCA: loop infinito de retries, silenciar errores de API
```

## Señales de Alerta

- Enviar todo el contexto cuando solo parte es relevante
- No usar prompt caching con prompts largos repetitivos
- Temperatura > 0.7 para tareas que requieren consistencia
- Sin rate limiting → costos descontrolados
- Ignorar `input_tokens` / `output_tokens` en respuesta
- Usar opus para tareas que haiku resuelve correctamente

## Checklist de Integración IA

- [ ] Modelo apropiado para la complejidad de la tarea
- [ ] Prompt caching habilitado para system prompts largos
- [ ] Rate limiting implementado (tokens/min, requests/min)
- [ ] Fallback definido cuando la API no responde
- [ ] Costo estimado por operación documentado
- [ ] Temperatura ajustada al tipo de tarea (0.0-0.3 para consistencia)
