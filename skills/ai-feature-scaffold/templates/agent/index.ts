// Server-side only
// Template generado por /ai-feature-scaffold — adaptar imports según tu stack
//
// Fachada del dominio del agente. Los adaptadores (web, whatsapp, telegram, slack, cli)
// importan desde aquí; nunca de los módulos internos.
export { ask, askStream, createAgent } from "./ask";
export type { Agent, AskDeps, AskStreamHandle, GuardOutputResult } from "./ask";
export {
  withRetry,
  withTimeout,
  isNonRetriable,
  TimeoutError,
  DEFAULT_RESILIENCE,
  type ResilienceConfig,
  type RetryConfig,
} from "./resilience";
export {
  channelLimit,
  type AgentRequest,
  type AgentResponse,
  type Channel,
  type GenerateFn,
  type GenerateParams,
  type GenerateResult,
  type Message,
  type RetrievedChunk,
  type RetrievedContext,
  type RetrieveOptions,
  type Source,
  type TokenUsage,
} from "./types";
