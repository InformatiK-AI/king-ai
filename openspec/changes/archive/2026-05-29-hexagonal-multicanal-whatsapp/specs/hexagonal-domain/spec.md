# Spec — hexagonal-domain

> Capability: el puerto de dominio del agente, agnóstico al transporte. RFC 2119.

## Requisito: el dominio NO conoce el transporte

El puerto (`lib/agent/ask.ts`) **MUST NOT** importar Next, tipos HTTP (`Request`/`Response`) ni el SDK del proveedor. La generación se inyecta vía `GenerateFn`; el único archivo que importa el SDK es `providers/ai-sdk.ts`.

```gherkin
Scenario: reutilización multicanal
  Given un InboundMessage con channel "web" o "whatsapp"
  When se invoca ask() o askStream()
  Then la misma orquestación produce un AgentReply
  And ningún adaptador duplica la lógica de safety/RAG/generación/moderación
```

## Requisito: degradación graceful de RAG

```gherkin
Scenario: retrieve falla o excede el timeout
  Given retrieve lanza un error o supera retrieveTimeoutMs
  When el dominio prepara el contexto
  Then responde con un system prompt de fallback (sin contexto RAG)
  And AgentReply.degraded == true
  And se registra el evento "rag_degraded"
```

## Requisito: moderación de salida real

`guardOutput` **MUST** evaluar el texto final con `moderateText` (ya no un pass-through). En modo `ask` (mensajería) la moderación corre ANTES de entregar; si bloquea, `AgentReply.blocked` se setea y `answer` es una respuesta segura.

## Requisito: resiliencia

```gherkin
Scenario: reintento ante fallo transitorio
  Given la generación falla con 5xx/429/red
  When ask() ejecuta la generación
  Then withRetry reintenta con backoff exponencial + jitter
  But NUNCA reintenta ante 401/403/422/SafetyError/AbortError
  And withTimeout acota la espera por intento
```

## Requisito: dos modos sobre una orquestación

`askStream` **MUST** emitir deltas en vivo y resolver la reply al cierre; `ask` **MUST** colapsar el stream a texto completo. Ambos comparten `prepare()` y `finalize()`.

## Verificación

`npm run test:unit` (`tests/unit/ask.test.ts`, `resilience.test.ts`, `guard-output.test.ts`) cubre happy path, degradación, bloqueo por moderación, propagación de `SafetyError`, límite por canal, retry/timeout y `isNonRetriable`. Sin LLM ni DB.
