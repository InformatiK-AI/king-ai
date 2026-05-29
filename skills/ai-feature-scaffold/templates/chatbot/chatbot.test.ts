// Template de test — generado por /ai-feature-scaffold
// Requiere: jest, ts-jest (npm install -D jest ts-jest @types/jest)
//
// Testea el ADAPTADOR DE ENTRADA web (chat-api-route) contra un puerto MOCK del dominio:
// createAgent con un `generate` FAKE (sin red, sin SDK). Verifica que:
//   1. el adaptador traduce el body HTTP al AgentRequest canónico (channel="web", history, raw),
//   2. serializa los deltas del puerto como SSE delta/done, consumible por el SSEHandler compartido.
//
// `next/server` se mockea (NextRequest = identidad) para poder importar la route sin runtime Next.
// `./agent` se mockea con un puerto fake que captura el AgentRequest recibido.

import { SSEHandler } from "../../../llm-integration/templates/shared/streaming/sse-handler";
import type { AgentRequest } from "../agent";

// --- Mock de next/server: NextRequest no se usa más que como tipo + req.json() ---
jest.mock("next/server", () => ({ NextRequest: class {} }));

// --- Mock del puerto del dominio: createAgent devuelve { ask, askStream } con un generate fake ---
const captured: { request?: AgentRequest } = {};
let scriptedDeltas: string[] = ["Hola", " mundo", "!"];
let askStreamThrows: Error | null = null;
let streamErrorsMidway = false;

async function* fakeTextStream(): AsyncIterable<string> {
  for (const d of scriptedDeltas) {
    yield d;
    if (streamErrorsMidway && d === scriptedDeltas[0]) {
      throw new Error("provider_down"); // detalle interno — NO debe filtrarse al cliente
    }
  }
}

jest.mock("../agent", () => ({
  // El factory captura la request para aserciones de traducción y devuelve un handle fake.
  createAgent: () => ({
    askStream: jest.fn(async (request: AgentRequest) => {
      captured.request = request;
      if (askStreamThrows) throw askStreamThrows;
      return {
        textStream: fakeTextStream(),
        reply: Promise.resolve({ answer: scriptedDeltas.join(""), latencyMs: 1, degraded: false }),
      };
    }),
    ask: jest.fn(),
  }),
}));

// La route se importa DESPUÉS de los mocks (createAgent se invoca al cargar el módulo).
import { POST, OPTIONS, toSSEStream } from "./chat-api-route";

/** Construye un objeto compatible con NextRequest.json() para el test (sin red). */
function fakeRequest(body: unknown): import("next/server").NextRequest {
  return { json: async () => body } as unknown as import("next/server").NextRequest;
}

/** Consume un ReadableStream SSE con el SSEHandler compartido y devuelve deltas + texto acumulado. */
async function drainSSE(stream: ReadableStream): Promise<{ deltas: string[]; full: string; error?: string }> {
  const deltas: string[] = [];
  let error: string | undefined;
  const full = await new SSEHandler(stream, {
    onChunk: (t) => deltas.push(t),
    onError: (e) => {
      error = e.message;
    },
  }).consume();
  return { deltas, full, error };
}

describe("chat-api-route (adaptador de entrada web)", () => {
  beforeEach(() => {
    captured.request = undefined;
    scriptedDeltas = ["Hola", " mundo", "!"];
    askStreamThrows = null;
    streamErrorsMidway = false;
    jest.clearAllMocks();
  });

  describe("traducción del request al contrato canónico", () => {
    it("construye un AgentRequest con channel='web', text e history del body", async () => {
      const history = [
        { role: "user" as const, content: "hola" },
        { role: "assistant" as const, content: "qué tal" },
      ];

      const res = await POST(
        fakeRequest({ message: "segunda pregunta", conversationId: "11111111-1111-1111-1111-111111111111", history }),
      );
      // Drenar el stream fuerza la resolución del handle.
      await drainSSE(res.body as ReadableStream);

      expect(captured.request).toBeDefined();
      expect(captured.request!.channel).toBe("web");
      expect(captured.request!.from).toBe("web");
      expect(captured.request!.text).toBe("segunda pregunta");
      expect(captured.request!.history).toEqual(history);
      // conversationId viaja en `raw` (metadato de canal), nunca en el contrato del dominio.
      expect(captured.request!.raw).toMatchObject({ conversationId: "11111111-1111-1111-1111-111111111111" });
      // messageId es un identificador generado, no vacío.
      expect(typeof captured.request!.messageId).toBe("string");
      expect(captured.request!.messageId.length).toBeGreaterThan(0);
    });

    it("rechaza body inválido (zod) con 400 sin invocar el puerto", async () => {
      const res = await POST(fakeRequest({ message: "" })); // viola min(1)
      expect(res.status).toBe(400);
      expect(captured.request).toBeUndefined();
    });

    it("rechaza JSON inválido con 400", async () => {
      const bad = { json: async () => { throw new Error("bad json"); } } as unknown as import("next/server").NextRequest;
      const res = await POST(bad);
      expect(res.status).toBe(400);
    });
  });

  describe("serialización SSE (delta / done)", () => {
    it("emite los deltas del puerto como eventos SSE delta y cierra", async () => {
      const res = await POST(fakeRequest({ message: "hola" }));

      expect(res.headers.get("Content-Type")).toContain("text/event-stream");
      const { deltas, full, error } = await drainSSE(res.body as ReadableStream);

      expect(error).toBeUndefined();
      expect(deltas).toEqual(["Hola", " mundo", "!"]);
      expect(full).toBe("Hola mundo!");
    });

    it("traduce un fallo a mitad del stream en un evento SSE error genérico (sin filtrar el detalle)", async () => {
      streamErrorsMidway = true;
      const res = await POST(fakeRequest({ message: "hola" }));
      const { deltas, error } = await drainSSE(res.body as ReadableStream);

      expect(deltas).toEqual(["Hola"]); // el primer delta llegó antes del fallo
      expect(error).toBeDefined();
      expect(error).not.toContain("provider_down"); // nunca exponer el error interno
    });

    it("si el puerto lanza al iniciar (safety PRE), responde 403 sin stream", async () => {
      askStreamThrows = new Error("safety_blocked");
      const res = await POST(fakeRequest({ message: "payload malicioso" }));
      expect(res.status).toBe(403);
    });
  });

  describe("toSSEStream (serializador del adaptador)", () => {
    it("envuelve deltas como {type:'delta'} y emite {type:'done'} al cerrar", async () => {
      async function* src() {
        yield "a";
        yield "b";
      }
      const { deltas, full } = await drainSSE(toSSEStream(src()));
      expect(deltas).toEqual(["a", "b"]);
      expect(full).toBe("ab");
    });
  });

  describe("CORS", () => {
    it("OPTIONS responde con headers CORS y métodos permitidos", async () => {
      const res = await OPTIONS();
      expect(res.headers.get("Access-Control-Allow-Origin")).toBeTruthy();
      expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    });
  });
});
