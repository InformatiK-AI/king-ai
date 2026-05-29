// Server-side only
// Template generado por /ai-feature-scaffold — adaptar imports según tu stack
//
// Adaptador de salida: implementa el puerto GenerateFn sobre un LLMProvider (ADR-004).
// ÚNICO archivo del dominio que conoce el cliente concreto. Cambiar de proveedor = cambiar
// la instancia de LLMProvider inyectada, NO este archivo ni el dominio.
//
// Ajustá la ruta del import de LLMProvider a donde tu stack ubique el cliente de /llm-integration.
import type { LLMProvider } from "../../../../llm-integration/templates/shared/llm-provider";
import type { GenerateFn, GenerateParams, GenerateResult, Message, TokenUsage } from "../types";

/** Traduce los GenerateParams del dominio a la lista de Message del LLMProvider. */
function toMessages(params: GenerateParams): Message[] {
  return [...(params.history ?? []), { role: "user", content: params.prompt }];
}

/**
 * Crea una GenerateFn cableada sobre un LLMProvider concreto (Anthropic, OpenAI, Google…).
 * - El stream del modelo viene de `provider.stream(messages, options)` (AsyncIterable<string>).
 * - El system prompt se pasa por `options.system` (extendé CompletionOptions si tu provider lo soporta).
 * - El uso de tokens se lee de `provider.getSessionUsage()` al terminar de drenar el stream.
 */
export function makeLLMProviderGenerate(provider: LLMProvider): GenerateFn {
  const generate: GenerateFn = async (params): Promise<GenerateResult> => {
    const messages = toMessages(params);

    // El system prompt va por options; el modelo lo selecciona el cost gate aguas arriba.
    // Nota: CompletionOptions base no declara `system` ni `model` — extendé la interfaz de tu
    // provider para soportarlos, o configurá el modelo al instanciar el provider.
    const options = { system: params.system, model: params.model, signal: params.signal };

    const source = provider.stream(messages, options as never);

    // getSessionUsage() es acumulativo a nivel de sesión: tomamos un snapshot antes y después
    // para aislar el delta de ESTA generación.
    const before = provider.getSessionUsage();
    let resolveUsage!: (u: TokenUsage | undefined) => void;
    const usage = new Promise<TokenUsage | undefined>((res) => {
      resolveUsage = res;
    });

    async function* stream(): AsyncIterable<string> {
      try {
        for await (const delta of source) yield delta;
      } finally {
        const after = provider.getSessionUsage();
        resolveUsage(diffUsage(before, after));
      }
    }

    return { stream: stream(), usage };
  };

  return generate;
}

/** Delta de uso entre dos snapshots de sesión. */
function diffUsage(before: TokenUsage, after: TokenUsage): TokenUsage {
  return {
    inputTokens: after.inputTokens - before.inputTokens,
    outputTokens: after.outputTokens - before.outputTokens,
    cacheWriteTokens: after.cacheWriteTokens - before.cacheWriteTokens,
    cacheReadTokens: after.cacheReadTokens - before.cacheReadTokens,
  };
}
