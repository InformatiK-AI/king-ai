# LLM Integration Essentials (para inyección)

> Versión compacta para inyección en agents. Para full knowledge: `knowledge/domain/llm-patterns.md`

## Provider Comparison

| Provider | Streaming | Prompt Caching | Max Context | Embeddings | Default Model |
|----------|-----------|----------------|-------------|------------|---------------|
| Anthropic Claude | SSE nativo via messages.stream() | cache_control manual (TTL: 5m/1h, 10% precio) | 200K tokens | NO (usar OpenAI/Gemini) | claude-sonnet-4-6 |
| OpenAI | SSE, stream_options: {include_usage: true} requerido | Automático (50% descuento, en usage.prompt_tokens_details.cached_tokens) | 128K tokens | text-embedding-3-small (1536 dims, reducible a 256) | gpt-4o-mini |
| Google Gemini | generateContentStream(), usage post-stream | NO nativo | 1M tokens | text-embedding-004 (768 dims) | gemini-2.0-flash |

## Interfaz LLMProvider (ADR-004)

```typescript
interface LLMProvider {
  complete(messages: Message[], options?: CompletionOptions): Promise<CompletionResult>
  stream(messages: Message[], options?: StreamOptions): AsyncIterable<string>
  getCapabilities(): { streaming: boolean; promptCaching: boolean; maxContextTokens: number }
}
```

## Patrones Críticos

### Retry — solo en errores retryables
- Retry: 429 (rate_limit), 5xx, timeout
- NO retry: 401, 403 (auth), 400 (request inválido)
- Backoff: `Math.min(1000 * 2^attempt + random(100), 30000)`

### Cost Tracking — campos obligatorios en llm_usage
`provider, model, input_tokens, output_tokens, cache_write_tokens, cache_read_tokens, cost_usd, latency_ms`
NO guardar: `prompt_text`, `response_text`, `user_ip` (PII)

### Prompt Caching (Claude only)
```typescript
system: [{ type: "text", text: SYSTEM_PROMPT,
  cache_control: { type: "ephemeral", ttl: "5m" } }]
// Ahorro: cache_read = 10% del precio de input
// Detectar hit: usage.cache_read_input_tokens > 0
```

## Señales de Alerta

- API key en código (no en process.env.*) → CRÍTICO
- Llamada LLM desde client bundle → CRÍTICO
- Sin rate limiting en endpoint LLM → ALTO
- Concatenar user message con system prompt → ALTO (prompt injection)
- Sin filtro tenant_id en query de embeddings → ALTO

## Checklist Pre-Entrega

- [ ] API keys en process.env.* solamente
- [ ] Código LLM solo server-side
- [ ] Rate limiting en todos los endpoints LLM
- [ ] Roles explícitos en la API (no string concatenation)
- [ ] Cost tracking en finally block (no bloquea el request)
- [ ] llm_usage sin columnas PII
