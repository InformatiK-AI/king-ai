# Testing Essentials para Código Generado (para inyección)

> Versión compacta para inyección en agents. Patrones de test para el código generado por
> `/ai-feature-scaffold` y `/llm-integration`.
>
> El template REFLEJA un standalone YA VALIDADO (`lib/agent/*`, `tests/unit/*`). El dominio
> (`ask` / `askStream`) recibe sus dependencias por INYECCIÓN, y esa inyección es lo que hace el
> código **testeable sin red, sin LLM real y sin Postgres**.

## Runner sugerido: `node:test` vía `tsx` (cero deps)

No necesitas Jest ni Vitest para validar la lógica generada. `node:test` + `node:assert/strict`
vienen con Node; `tsx` ejecuta TypeScript directo. Cero dependencias de testing en `package.json`.

```jsonc
// package.json
{
  "scripts": {
    "test": "tsx --test tests/unit/*.test.ts"
  }
}
```

```typescript
import test from "node:test";
import assert from "node:assert/strict";
```

---

## 1. Test del dominio con dependencias mockeadas (inyección)

El dominio (`ask`) acepta un `Partial<AskDeps>` como override. Construye un helper `deps()` que provee
mocks de identidad (`guardInput` devuelve el texto tal cual, `guardOutput` marca todo seguro,
`withGeneration` invoca `fn` con un modelo de prueba) y un `generate` falso que streamea texto fijo.
Cada test sobrescribe solo lo que necesita.

```typescript
import { ask, askStream, type AskDeps } from "../../lib/agent/ask";
import type { GenerateFn, AgentRequest, RetrievedContext } from "../../lib/agent/types";
import { SafetyError } from "../../lib/safety";

function request(text: string, channel: AgentRequest["channel"] = "cli"): AgentRequest {
  return { channel, messageId: "m1", from: "test", text };
}

function ctx(chunks: { content: string; source: string; score: number }[] = []): RetrievedContext {
  return { systemPrompt: "SYS", chunks };
}

/** generate fake: streamea `text` palabra por palabra y resuelve usage. */
function genFrom(text: string): GenerateFn {
  return async () => ({
    stream: (async function* () { for (const w of text.split(" ")) yield w + " "; })(),
    usage: Promise.resolve({ totalTokens: 7 }),
  });
}

/** deps de identidad — todo inyectado, sin red ni LLM real. */
function deps(over: Partial<AskDeps>): Partial<AskDeps> {
  return {
    retrieve: async () => ctx([{ content: "c", source: "doc.md", score: 0.9 }]),
    generate: genFrom("hola mundo"),
    guardInput: async (t) => t,
    guardOutput: (t) => ({ safe: true, text: t }),
    withGeneration: (_name, fn) => fn("test-model"),
    logEvent: () => undefined,
    ...over,
  };
}

test("ask: happy path con fuentes y sin degradación", async () => {
  const r = await ask(request("pregunta"), deps({}));
  assert.equal(r.answer.trim(), "hola mundo");
  assert.equal(r.degraded, false);
});

test("ask: degrada (responde sin contexto) si retrieve falla", async () => {
  const r = await ask(request("q"), deps({ retrieve: async () => { throw new Error("db down"); } }));
  assert.equal(r.degraded, true);
});

test("ask: bloquea por moderación de salida → respuesta segura", async () => {
  const r = await ask(request("q"), deps({ guardOutput: (t) => ({ safe: false, text: t, reason: "blocked_content" }) }));
  assert.equal(r.blocked?.reason, "blocked_content");
  assert.notEqual(r.answer.trim(), "hola mundo");
});

test("ask: propaga SafetyError de guardInput (no lo traga)", async () => {
  await assert.rejects(
    () => ask(request("jailbreak"), deps({ guardInput: async () => { throw new SafetyError("jailbreak_blocked"); } })),
    (e) => e instanceof SafetyError,
  );
});

test("ask: aplica el límite de longitud del canal (whatsapp 4096)", async () => {
  const r = await ask(request("q", "whatsapp"), deps({ generate: genFrom("x".repeat(5000)) }));
  assert.ok(r.answer.length <= 4096);
});

test("askStream: emite deltas y resuelve la reply al cierre", async () => {
  const handle = await askStream(request("q"), deps({ generate: genFrom("uno dos tres") }));
  let acc = "";
  for await (const d of handle.textStream) acc += d;
  const reply = await handle.reply;
  assert.equal(acc.trim(), "uno dos tres");
  assert.equal(reply.answer.trim(), "uno dos tres");
});
```

Qué cubre: happy path, degradación graceful (RAG caído), bloqueo de moderación, propagación de
`SafetyError` (que NO debe tragarse), clamp por canal y el modo streaming (deltas + reply final).

---

## 2. Test de firma HMAC (payload + secret de prueba)

Genera la firma esperada con el mismo algoritmo y un secreto de prueba, luego verifica los casos:
firma válida pasa; firma alterada (misma longitud) falla; payload alterado falla; header/secreto
ausentes fallan. **No hardcodees secretos reales** — un `"test_app_secret"` literal en el test es
inofensivo y autocontenido.

```typescript
import { createHmac } from "node:crypto";
import { verifySignature } from "../../lib/agent/whatsapp/verify";

const SECRET = "test_app_secret";
const BODY = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
const VALID = "sha256=" + createHmac("sha256", SECRET).update(BODY, "utf8").digest("hex");

test("firma válida pasa", () => {
  assert.equal(verifySignature(BODY, VALID, SECRET), true);
});

test("firma alterada (misma longitud) falla", () => {
  const tampered = VALID.replace(/.$/, (c) => (c === "0" ? "1" : "0"));
  assert.equal(verifySignature(BODY, tampered, SECRET), false);
});

test("payload alterado falla con la firma original", () => {
  assert.equal(verifySignature(BODY + " ", VALID, SECRET), false);
});

test("header ausente / secret ausente fallan", () => {
  assert.equal(verifySignature(BODY, null, SECRET), false);
  assert.equal(verifySignature(BODY, VALID, ""), false);
});
```

---

## 3. Test de idempotencia (query fake)

La dedup acepta una `QueryFn` inyectable → emula la PK + `ON CONFLICT DO NOTHING` de Postgres con un
`Set` en memoria. Verificas que el primer `claimMessage` de un id devuelve `true` (nuevo), el segundo
`false` (duplicado), y otro id `true`. Sin base de datos real.

```typescript
import { claimMessage, type QueryFn } from "../../lib/agent/whatsapp/dedup";

/** Query fake en memoria: emula PK + ON CONFLICT DO NOTHING. */
function fakeQuery(): QueryFn {
  const seen = new Set<string>();
  return async (_text, params) => {
    const id = String(params[0]);
    if (seen.has(id)) return { rowCount: 0 }; // ON CONFLICT → no inserta
    seen.add(id);
    return { rowCount: 1 };                   // insertado → nuevo
  };
}

test("claimMessage: nuevo → true, duplicado → false, otro id → true", async () => {
  const query = fakeQuery();
  assert.equal(await claimMessage("wamid.A", query), true);
  assert.equal(await claimMessage("wamid.A", query), false);
  assert.equal(await claimMessage("wamid.B", query), true);
});
```

---

## 4. Test de timeout / retry

`withTimeout` y `withRetry` operan sobre promesas puras → se testean con promesas sintéticas, sin red.
Usa `baseDelayMs` mínimo (1ms) para que el backoff no ralentice la suite. Cuenta las invocaciones para
asegurar que el retry corta ante no-retriables y agota exactamente `retries + 1` intentos.

```typescript
import { withTimeout, withRetry, isNonRetriable, TimeoutError } from "../../lib/agent/resilience";
import { SafetyError } from "../../lib/safety";

test("withTimeout: resuelve si gana la carrera; rechaza con TimeoutError al exceder", async () => {
  assert.equal(await withTimeout(Promise.resolve("ok"), 1000, "x"), "ok");
  const slow = new Promise((res) => setTimeout(() => res("late"), 50));
  await assert.rejects(() => withTimeout(slow, 10, "gen"), (e) => e instanceof TimeoutError);
});

test("withTimeout: ms no finito desactiva el deadline", async () => {
  assert.equal(await withTimeout(Promise.resolve("ok"), Number.POSITIVE_INFINITY, "x"), "ok");
});

test("isNonRetriable: auth/validación/safety/abort sí; 5xx/429/red no", () => {
  assert.equal(isNonRetriable(new SafetyError("x")), true);
  assert.equal(isNonRetriable({ status: 401 }), true);
  assert.equal(isNonRetriable({ status: 422 }), true);
  assert.equal(isNonRetriable({ name: "AbortError" }), true);
  assert.equal(isNonRetriable({ status: 500 }), false);
  assert.equal(isNonRetriable({ status: 429 }), false);
});

test("withRetry: reintenta transitorios hasta el éxito", async () => {
  let calls = 0;
  const r = await withRetry(async () => {
    calls += 1;
    if (calls < 3) throw { status: 503 };
    return "ok";
  }, { retries: 3, baseDelayMs: 1, maxDelayMs: 2 });
  assert.equal(r, "ok");
  assert.equal(calls, 3);
});

test("withRetry: corta de inmediato ante no-retriable", async () => {
  let calls = 0;
  await assert.rejects(() =>
    withRetry(async () => { calls += 1; throw new SafetyError("blocked"); },
      { retries: 3, baseDelayMs: 1, maxDelayMs: 2 }));
  assert.equal(calls, 1); // no reintentó
});

test("withRetry: agota los reintentos y propaga el último error", async () => {
  let calls = 0;
  await assert.rejects(() =>
    withRetry(async () => { calls += 1; throw { status: 500 }; },
      { retries: 2, baseDelayMs: 1, maxDelayMs: 2 }));
  assert.equal(calls, 3); // intento inicial + 2 reintentos
});
```

---

## Principios

- **Inyección = testabilidad.** Todo lo externo (LLM, RAG, DB, moderación) entra por dependencia →
  se reemplaza por un fake en el test. Nunca mocks de módulos ni red real.
- **Sin red, sin LLM, sin Postgres** en unit tests. El envío real y el LLM real los prueba el usuario.
- **Fakes deterministas:** `generate` streamea texto fijo, `QueryFn` usa un `Set`, las firmas se
  computan con el mismo algoritmo y un secreto de prueba literal.
- **Sin `any`**, sin secretos reales hardcodeados, todo server-side.

## Checklist de testing

- [ ] Dominio: happy path, degradación, bloqueo de moderación, propagación de `SafetyError`, clamp por canal, streaming
- [ ] Firma HMAC: válida / alterada misma longitud / payload alterado / header y secreto ausentes
- [ ] Idempotencia: nuevo → true, duplicado → false, otro id → true (query fake)
- [ ] Timeout: gana / excede (`TimeoutError`) / `ms` no finito desactiva
- [ ] Retry: transitorio→éxito, no-retriable→corta (1 call), agota→propaga (retries+1 calls)
- [ ] Runner `node:test` vía `tsx`, cero deps de testing
