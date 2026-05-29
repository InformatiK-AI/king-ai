// Server-side only
// Template generado por /ai-feature-scaffold — adaptar imports según tu stack
//
// Puerto de dominio del agente (hexagonal). Orquesta safety → retrieve → generación → moderación
// SIN conocer el transporte: no importa Next, HTTP ni el SDK del proveedor. Los adaptadores
// (web, whatsapp, telegram, slack, cli) traducen su canal a/desde AgentRequest/AgentResponse.
// Refleja el agente standalone ya validado: lib/agent/ask.ts.
//
// Las dependencias (retrieve/generate/guardInput/guardOutput/resilience) se reciben por INYECCIÓN.
// Los defaults de este template NO importan ../rag, ../safety ni ../cost (aún no existen en tu
// proyecto): son defaults mínimos pensados para arrancar y cablear progresivamente.
import {
  withRetry,
  withTimeout,
  DEFAULT_RESILIENCE,
  type ResilienceConfig,
} from "./resilience";
import {
  channelLimit,
  type AgentRequest,
  type AgentResponse,
  type GenerateFn,
  type GenerateParams,
  type RetrievedContext,
  type RetrieveOptions,
  type Source,
  type TokenUsage,
} from "./types";

const DEFAULT_TOP_K = 5;
const SAFE_REFUSAL = "Lo siento, no puedo ayudar con eso.";
const DEFAULT_FALLBACK_SYSTEM_PROMPT =
  "Sos un asistente preciso. No hay contexto disponible en este momento; respondé con cautela y aclará explícitamente si no podés confirmar algo.";

/** Resultado de la moderación de salida. */
export interface GuardOutputResult {
  safe: boolean;
  text: string;
  reason?: string;
}

/** Dependencias inyectables del puerto. Defaults = mínimos seguros; tests/proyecto pasan mocks/cableado real. */
export interface AskDeps {
  /**
   * Recuperación de contexto (RAG). Default: sin contexto (degradación a fallbackSystemPrompt).
   * TODO: cableá tu pipeline RAG de /ai-feature-scaffold (rag/) cuando exista.
   */
  retrieve: (query: string, opts?: RetrieveOptions) => Promise<RetrievedContext>;
  /**
   * Generación LLM (puerto de salida). Default: lanza para forzar el cableado.
   * TODO: implementá GenerateFn sobre tu cliente LLMProvider de /llm-integration
   * (ver providers/llmprovider-adapter.ts) o sobre el SDK del proveedor.
   */
  generate: GenerateFn;
  /** Moderación de entrada. Default: identidad. TODO: cableá tu módulo de safety (puede lanzar SafetyError). */
  guardInput: (text: string) => Promise<string>;
  /** Moderación de salida. Default: marca todo como seguro. TODO: cableá tu módulo de safety. */
  guardOutput: (text: string) => GuardOutputResult;
  /**
   * Envuelve la generación con cost gate + observability y provee el modelo a usar.
   * Default: usa `defaultModel` sin instrumentación. TODO: cableá withCostGate/withObservability.
   */
  withGeneration: <T>(name: string, fn: (model: string) => Promise<T>) => Promise<T>;
  /** Modelo por defecto que recibe `withGeneration` mientras no haya cost gate. */
  defaultModel: string;
  /** Hook de eventos (degradación, etc.). Default: log estructurado a stderr. */
  logEvent: (event: string, payload: Record<string, unknown>) => void;
  resilience: ResilienceConfig;
  fallbackSystemPrompt: string;
  topK: number;
}

const defaultDeps: AskDeps = {
  retrieve: async () => ({ systemPrompt: DEFAULT_FALLBACK_SYSTEM_PROMPT, chunks: [] }),
  generate: async () => {
    // TODO: implementá GenerateFn sobre tu cliente LLMProvider de /llm-integration
    // (ver providers/llmprovider-adapter.ts) o pasá `generate` por override.
    throw new Error("ask: 'generate' no está cableado. Inyectá una GenerateFn (ver providers/llmprovider-adapter.ts).");
  },
  guardInput: async (text) => text,
  guardOutput: (text) => ({ safe: true, text }),
  withGeneration: (_name, fn) => fn(defaultDeps.defaultModel),
  defaultModel: "claude-sonnet-4-6",
  logEvent: (event, payload) => {
    console.error(JSON.stringify({ event, ...payload }));
  },
  resilience: DEFAULT_RESILIENCE,
  fallbackSystemPrompt: DEFAULT_FALLBACK_SYSTEM_PROMPT,
  topK: DEFAULT_TOP_K,
};

export interface AskStreamHandle {
  /** Deltas de texto del modelo. La moderación final se aplica en `reply`, no por-delta. */
  textStream: AsyncIterable<string>;
  /** Reply completa (moderada, con usage/latency/sources). Se resuelve al drenar `textStream`. */
  reply: Promise<AgentResponse>;
}

interface Prepared {
  safeInput: string;
  context: RetrievedContext;
  degraded: boolean;
  sources: Source[];
  history?: AgentRequest["history"];
  t0: number;
}

function sourcesFrom(context: RetrievedContext): Source[] {
  return context.chunks.map((c, i) => ({ ref: i + 1, source: c.source, score: c.score }));
}

function clampLength(text: string, limit: number): string {
  if (!Number.isFinite(limit) || text.length <= limit) return text;
  return text.slice(0, limit);
}

function errName(e: unknown): string {
  if (e instanceof Error) return e.name || e.message;
  return String(e);
}

/** Safety PRE + retrieve con degradación graceful. Común a ambos modos. */
async function prepare(req: AgentRequest, deps: AskDeps): Promise<Prepared> {
  const t0 = Date.now();
  const safeInput = await deps.guardInput(req.text); // puede lanzar SafetyError

  let context: RetrievedContext;
  let degraded = false;
  try {
    context = await withTimeout(
      deps.retrieve(safeInput, { topK: deps.topK }),
      deps.resilience.retrieveTimeoutMs,
      "retrieve",
    );
  } catch (error) {
    degraded = true;
    deps.logEvent("rag_degraded", { reason: errName(error) });
    context = { systemPrompt: deps.fallbackSystemPrompt, chunks: [] };
  }

  return { safeInput, context, degraded, sources: sourcesFrom(context), history: req.history, t0 };
}

/** Moderación de salida + construcción de la reply. Común a ambos modos. */
function finalize(
  full: string,
  usage: TokenUsage | undefined,
  p: Prepared,
  channel: AgentRequest["channel"],
  guardOutput: AskDeps["guardOutput"],
): AgentResponse {
  const mod = guardOutput(full);
  const answer = mod.safe ? clampLength(mod.text, channelLimit[channel]) : SAFE_REFUSAL;
  return {
    answer,
    sources: p.sources,
    usage,
    latencyMs: Date.now() - p.t0,
    degraded: p.degraded,
    blocked: mod.safe ? undefined : { reason: mod.reason ?? "blocked" },
  };
}

function genParams(p: Prepared, model: string): GenerateParams {
  return { system: p.context.systemPrompt, prompt: p.safeInput, model, history: p.history };
}

/**
 * MODO STREAMING (web): emite deltas en vivo y resuelve la reply al cierre.
 * Cost gate + observability envuelven la apertura del stream (timeout de inicio). El retry de la
 * generación completa NO aplica aquí: ya se están emitiendo deltas al usuario.
 */
export async function askStream(req: AgentRequest, overrides: Partial<AskDeps> = {}): Promise<AskStreamHandle> {
  const deps = { ...defaultDeps, ...overrides };
  const p = await prepare(req, deps);

  const gen = await deps.withGeneration("chat", (model) =>
    withTimeout(deps.generate(genParams(p, model)), deps.resilience.llmTimeoutMs, "generate"),
  );

  let resolveReply!: (r: AgentResponse) => void;
  let rejectReply!: (e: unknown) => void;
  const reply = new Promise<AgentResponse>((res, rej) => {
    resolveReply = res;
    rejectReply = rej;
  });

  async function* emit(): AsyncIterable<string> {
    let full = "";
    try {
      for await (const delta of gen.stream) {
        full += delta;
        yield delta;
      }
      const usage = await gen.usage;
      resolveReply(finalize(full, usage, p, req.channel, deps.guardOutput));
    } catch (error) {
      rejectReply(error);
      throw error;
    }
  }

  return { textStream: emit(), reply };
}

/** Drena un GenerateResult acumulando el texto completo. */
async function collect(generate: GenerateFn, params: GenerateParams): Promise<{ full: string; usage?: TokenUsage }> {
  const gen = await generate(params);
  let full = "";
  for await (const delta of gen.stream) full += delta;
  return { full, usage: await gen.usage };
}

/**
 * MODO COMPLETO (WhatsApp / Telegram / Slack / CLI / eval): genera la respuesta entera y la devuelve.
 * Aquí el timeout cubre toda la generación y el retry la reintenta ante fallos transitorios
 * (el cost gate hace fallback de modelo). La moderación corre ANTES de entregar → canal seguro.
 */
export async function ask(req: AgentRequest, overrides: Partial<AskDeps> = {}): Promise<AgentResponse> {
  const deps = { ...defaultDeps, ...overrides };
  const p = await prepare(req, deps);

  const { full, usage } = await deps.withGeneration("chat", (model) =>
    withRetry(
      () => withTimeout(collect(deps.generate, genParams(p, model)), deps.resilience.llmTimeoutMs, "generate"),
      deps.resilience.retry,
    ),
  );

  return finalize(full, usage, p, req.channel, deps.guardOutput);
}

/** El puerto del dominio como objeto, con las dependencias ya inyectadas. */
export interface Agent {
  ask(req: AgentRequest): Promise<AgentResponse>;
  askStream(req: AgentRequest): Promise<AskStreamHandle>;
}

/**
 * Factory del puerto: cierra `ask`/`askStream` sobre un set de dependencias inyectadas. Los
 * adaptadores (web, whatsapp, cli) importan SOLO `createAgent`, nunca los internos del dominio.
 *   const agent = createAgent({ retrieve, generate, guardInput, guardOutput });
 */
export function createAgent(overrides: Partial<AskDeps> = {}): Agent {
  return {
    ask: (req) => ask(req, overrides),
    askStream: (req) => askStream(req, overrides),
  };
}
