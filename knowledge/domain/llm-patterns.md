# LLM Integration Patterns

Patrones de producción para integrar Claude, OpenAI y Gemini en aplicaciones TypeScript.

---

## 1. Adapter Pattern para Multi-Provider

El objetivo es aislar la dependencia del provider detrás de una interfaz. Cualquier componente de la aplicación llama a `LLMProvider` — el proveedor concreto es un detalle de configuración.

```typescript
// types/llm.ts
export interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface CompletionOptions {
  model?: string
  temperature?: number
  maxTokens?: number
  systemPrompt?: string
}

export interface CompletionResult {
  content: string
  usage: {
    inputTokens: number
    outputTokens: number
    cacheReadTokens?: number
    cacheWriteTokens?: number
  }
  latencyMs: number
}

export interface StreamOptions extends CompletionOptions {
  onChunk?: (chunk: string) => void
}

export interface LLMCapabilities {
  streaming: boolean
  promptCaching: boolean
  maxContextTokens: number
  embeddings: boolean
}

export interface LLMProvider {
  complete(messages: Message[], options?: CompletionOptions): Promise<CompletionResult>
  stream(messages: Message[], options?: StreamOptions): AsyncIterable<string>
  getCapabilities(): LLMCapabilities
}

// lib/llm/factory.ts
export function createProvider(provider: 'claude' | 'openai' | 'gemini'): LLMProvider {
  switch (provider) {
    case 'claude':  return new ClaudeProvider()
    case 'openai':  return new OpenAIProvider()
    case 'gemini':  return new GeminiProvider()
  }
}
```

Cada adapter concreto implementa `LLMProvider` y maneja detalles del SDK (auth, retry, serialización).

---

## 2. Streaming SSE por Provider

### Diferencias clave entre providers

| Provider | API de stream | Usage disponible | Formato chunk |
|----------|--------------|-----------------|---------------|
| Claude | `client.messages.stream()` | En evento `message_delta` y `message_stop` | `text_delta.text` |
| OpenAI | `client.chat.completions.create({ stream: true, stream_options: { include_usage: true } })` | En último chunk (delta vacío) | `choices[0].delta.content` |
| Gemini | `model.generateContentStream()` | Solo disponible post-stream en `response.usageMetadata` | `chunk.text()` |

### Patrón de serialización hacia el cliente (Next.js App Router)

```typescript
// app/api/chat/route.ts
export async function POST(req: Request) {
  const { messages } = await req.json()
  const provider = createProvider(process.env.LLM_PROVIDER as 'claude')

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of provider.stream(messages)) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk })}\n\n`))
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
```

---

## 3. Prompt Caching (Claude)

### Cuándo cachear

| Candidato | TTL recomendado | Ahorro esperado |
|-----------|----------------|-----------------|
| System prompt extenso (>1000 tokens) | 5m | 90% del costo de input en llamadas repetidas |
| Contexto RAG estático (documentos base) | 1h | 90% del costo de input del contexto |
| Historial de conversación largo | 5m | 90% en mensajes previos reutilizados |

### Implementación

```typescript
// Marcar el system prompt para caching
const response = await client.messages.create({
  model: 'claude-sonnet-4-6',
  system: [
    {
      type: 'text',
      text: SYSTEM_PROMPT,
      cache_control: { type: 'ephemeral' },  // TTL: 5m por defecto
    },
  ],
  messages,
  max_tokens: 1024,
})

// Detectar cache hit
const { usage } = response
const isCacheHit = (usage.cache_read_input_tokens ?? 0) > 0
const savedTokens = usage.cache_read_input_tokens ?? 0
```

> El campo `cache_control.ttl` acepta `"5m"` o `"1h"`. Los cache writes cuestan 25% extra sobre el precio base; los reads cuestan 10%. El break-even es en la segunda llamada que reutiliza el bloque.

---

## 4. RAG Pipeline

Los 4 pasos fundamentales: Retrieve → Rerank → Augment → Generate.

```typescript
// lib/rag/pipeline.ts
interface RagOptions {
  tokenBudget: number       // tokens máximos para contexto RAG
  topK: number              // chunks a recuperar
  rerankThreshold: number   // score mínimo para incluir chunk
}

async function buildRagContext(
  query: string,
  tenantId: string,
  opts: RagOptions
): Promise<string> {
  // Step 1: Retrieve — recuperar chunks por similaridad de embedding
  const embedding = await embedText(query)
  const chunks = await db.query(
    `SELECT content, similarity(embedding, $1) as score
     FROM documents
     WHERE tenant_id = $2          -- SIEMPRE filtrar por tenant
     ORDER BY embedding <=> $1
     LIMIT $3`,
    [embedding, tenantId, opts.topK * 2]  // recuperar 2x para reranking
  )

  // Step 2: Rerank — descartar chunks bajo el umbral
  const relevant = chunks
    .filter(c => c.score >= opts.rerankThreshold)
    .slice(0, opts.topK)

  // Step 3: Augment — construir contexto respetando token budget
  let context = ''
  let tokenCount = 0
  for (const chunk of relevant) {
    const chunkTokens = estimateTokens(chunk.content)
    if (tokenCount + chunkTokens > opts.tokenBudget) break
    context += `\n---\n${chunk.content}`
    tokenCount += chunkTokens
  }

  // Step 4: el context se inyecta en el system message antes de llamar al LLM
  return context
}

function estimateTokens(text: string): number {
  // Aproximación: 1 token ~ 4 caracteres en inglés/español
  return Math.ceil(text.length / 4)
}
```

---

## 5. Cost Tracking en Producción

### Tabla `llm_usage` (PostgreSQL)

```sql
CREATE TABLE llm_usage (
  id              BIGSERIAL PRIMARY KEY,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tenant_id       UUID NOT NULL,
  provider        TEXT NOT NULL,          -- 'claude' | 'openai' | 'gemini'
  model           TEXT NOT NULL,
  input_tokens    INTEGER NOT NULL,
  output_tokens   INTEGER NOT NULL,
  cache_write_tokens INTEGER DEFAULT 0,
  cache_read_tokens  INTEGER DEFAULT 0,
  cost_usd        NUMERIC(10, 6) NOT NULL,
  latency_ms      INTEGER NOT NULL,
  feature         TEXT,                   -- e.g. 'chat', 'rag', 'summarize'
  -- NO guardar: prompt_text, response_text, user_ip (PII)
  CONSTRAINT llm_usage_provider_check CHECK (provider IN ('claude', 'openai', 'gemini'))
);

CREATE INDEX idx_llm_usage_tenant_date ON llm_usage(tenant_id, created_at DESC);
```

### Cálculo de costo y patrón fire-and-forget

```typescript
// lib/llm/cost-tracker.ts
const COST_PER_MILLION: Record<string, { input: number; output: number; cacheWrite: number; cacheRead: number }> = {
  'claude-sonnet-4-6':  { input: 3.00,  output: 15.00, cacheWrite: 3.75,  cacheRead: 0.30  },
  'gpt-4o-mini':        { input: 0.15,  output: 0.60,  cacheWrite: 0,     cacheRead: 0.075 },
  'gemini-2.0-flash':   { input: 0.075, output: 0.30,  cacheWrite: 0,     cacheRead: 0     },
}

function calculateCostUSD(model: string, usage: CompletionResult['usage']): number {
  const rates = COST_PER_MILLION[model] ?? COST_PER_MILLION['claude-sonnet-4-6']
  return (
    (usage.inputTokens       * rates.input      / 1_000_000) +
    (usage.outputTokens      * rates.output     / 1_000_000) +
    (usage.cacheWriteTokens ?? 0) * rates.cacheWrite / 1_000_000 +
    (usage.cacheReadTokens  ?? 0) * rates.cacheRead  / 1_000_000
  )
}

// Patrón fire-and-forget: el tracking nunca bloquea el request
async function trackUsage(params: {
  tenantId: string
  provider: string
  model: string
  result: CompletionResult
  feature?: string
}): Promise<void> {
  const cost = calculateCostUSD(params.model, params.result.usage)
  // Usar setImmediate para no bloquear la respuesta al usuario
  setImmediate(async () => {
    try {
      await db.query(
        `INSERT INTO llm_usage
           (tenant_id, provider, model, input_tokens, output_tokens,
            cache_write_tokens, cache_read_tokens, cost_usd, latency_ms, feature)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          params.tenantId, params.provider, params.model,
          params.result.usage.inputTokens, params.result.usage.outputTokens,
          params.result.usage.cacheWriteTokens ?? 0,
          params.result.usage.cacheReadTokens  ?? 0,
          cost, params.result.latencyMs, params.feature ?? null,
        ]
      )
    } catch (err) {
      // Loguear pero NUNCA relanzar: el fallo de tracking no debe interrumpir el flujo
      console.error('[llm_usage] tracking failed', err)
    }
  })
}
```

Llamar en el bloque `finally` del adapter para garantizar que se registra incluso en errores parciales.

---

## 6. Anti-Patrones LLM

| Anti-Patrón | Consecuencia | Alternativa |
|-------------|-------------|-------------|
| API key hardcodeada en código | Credential exposure — key comprometida al hacer commit | Usar `process.env.ANTHROPIC_API_KEY` + `.env.local` en `.gitignore` |
| Llamada LLM desde client bundle | Key visible en DevTools → cualquier usuario la extrae | Proxy server-side: todo el tráfico LLM pasa por `/api/` |
| Sin rate limiting en endpoints LLM | DoS económico: un atacante puede vaciar la cuenta de API en minutos | `express-rate-limit` o middleware Next.js: 10 req/min/IP por defecto |
| Sin validar context window antes de llamar | Error 400 en producción cuando el prompt supera el límite del modelo | Llamar a `estimateTokens()` antes de la llamada; truncar o resumir si excede |
| Concatenar system + user en un solo string | Prompt injection: el usuario puede escapar el rol y sobreescribir instrucciones | Usar roles explícitos en la API (`role: 'system'` / `role: 'user'`) separados |
| Sin filtro `tenant_id` en queries de embeddings | Data exfiltration: un tenant puede recuperar documentos de otro | Siempre `WHERE tenant_id = $1` antes de filtrar por similaridad |
