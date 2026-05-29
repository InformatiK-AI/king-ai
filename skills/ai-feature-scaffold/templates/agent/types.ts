// Server-side only
// Template generado por /ai-feature-scaffold — adaptar imports según tu stack
//
// Contrato canónico del dominio del agente (frontera hexagonal). El dominio (ask.ts) SOLO
// conoce estos tipos: nunca el payload crudo de un canal ni el SDK de un proveedor.
// Refleja el agente standalone ya validado: lib/agent/types.ts.

// Message y TokenUsage se reutilizan del módulo compartido de /llm-integration.
// Ajustá la ruta a donde tu stack ubique el token-counter.
import type { Message, TokenUsage } from "../shared/cost-tracking/token-counter";

export type { Message, TokenUsage };

/** Canal de origen/destino de un mensaje. Agnóstico al transporte. */
export type Channel = "web" | "whatsapp" | "telegram" | "slack" | "cli";

/**
 * Límite de longitud de respuesta por canal (en caracteres).
 * web/cli no truncan; WhatsApp/Telegram = 4096; Slack = 3000 (bloque de texto).
 */
export const channelLimit: Record<Channel, number> = {
  web: Number.POSITIVE_INFINITY,
  cli: Number.POSITIVE_INFINITY,
  whatsapp: 4096,
  telegram: 4096,
  slack: 3000,
};

/**
 * Mensaje entrante normalizado. Cada adaptador (web/whatsapp/telegram/slack/cli) traduce su
 * payload nativo a esta forma; el dominio nunca ve la estructura cruda del canal.
 */
export interface AgentRequest {
  channel: Channel;
  /** ID estable en el canal de origen (WhatsApp `wamid...`; web/cli: uuid). Clave de idempotencia. */
  messageId: string;
  /** Remitente (wa_id / chatId / sessionId). Para dedup y futura multi-sesión. */
  from: string;
  text: string;
  /** Historial de turnos previos (opcional). El dominio decide si lo usa al generar. */
  history?: Message[];
  /** Metadatos crudos del canal (timestamps, phone_number_id, etc.). El dominio NO los usa. */
  raw?: Record<string, unknown>;
}

/** Fuente citada, derivada del contexto recuperado. */
export interface Source {
  ref: number;
  source: string;
  score: number;
}

/** Respuesta del agente, agnóstica al transporte. Cada adaptador la traduce a su canal. */
export interface AgentResponse {
  answer: string;
  sources?: Source[];
  usage?: TokenUsage;
  latencyMs: number;
  /** true si se respondió sin contexto RAG por fallo/timeout de retrieve (degradación graceful). */
  degraded: boolean;
  /** Presente solo si la moderación de salida bloqueó la respuesta del modelo. */
  blocked?: { reason: string };
}

// --- Puerto de salida: recuperación de contexto (RAG, driven port) ---

export interface RetrieveOptions {
  topK?: number;
}

export interface RetrievedChunk {
  source: string;
  score: number;
  text: string;
}

export interface RetrievedContext {
  /** System prompt aumentado con el contexto recuperado. */
  systemPrompt: string;
  chunks: RetrievedChunk[];
}

// --- Puerto de salida: generación LLM (driven port, ADR-004) ---

export interface GenerateParams {
  system: string;
  prompt: string;
  /** Modelo concreto (lo inyecta el cost gate: primario o fallback). */
  model: string;
  /** Historial opcional de turnos previos. */
  history?: Message[];
  signal?: AbortSignal;
}

export interface GenerateResult {
  /** Deltas de texto del modelo. */
  stream: AsyncIterable<string>;
  /** Uso de tokens, resuelto al terminar el stream. */
  usage: Promise<TokenUsage | undefined>;
}

/**
 * Puerto de salida de generación. El dominio depende de esta función, nunca del SDK concreto.
 * ADR-004 (LLMProvider): se implementa sobre el cliente generado por /llm-integration
 * (que implementa LLMProvider: complete/stream) o sobre el SDK del proveedor directamente.
 * Ver providers/llmprovider-adapter.ts para un ejemplo de cableado.
 */
export type GenerateFn = (params: GenerateParams) => Promise<GenerateResult>;
