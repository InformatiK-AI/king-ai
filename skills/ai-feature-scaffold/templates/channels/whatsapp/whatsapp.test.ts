// Server-side only
// Template generado por /ai-feature-scaffold — adaptar imports según tu stack
//
// Tests de la lógica de transporte del adaptador WhatsApp (firma / parse / idempotencia). NO llaman a
// la red ni a Postgres reales: la firma se verifica con HMAC local, el parse es puro, y la
// idempotencia usa una QueryFn fake en memoria que emula PK + ON CONFLICT DO NOTHING.
//
// Runner: node:test (built-in). Para Jest/Vitest, traduce test()/assert a su API equivalente.
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifySignature } from "./signature";
import { parseWebhook } from "./parse";
import { claimMessage, type QueryFn } from "./idempotency";

const SECRET = "test_app_secret";
const BODY = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
const VALID = "sha256=" + createHmac("sha256", SECRET).update(BODY, "utf8").digest("hex");

// --- Firma (HMAC timing-safe) ---

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

test("header ausente falla", () => {
  assert.equal(verifySignature(BODY, null, SECRET), false);
});

test("app secret ausente falla", () => {
  assert.equal(verifySignature(BODY, VALID, ""), false);
});

// --- Parse de webhook → AgentRequest canónico ---

const TEXT_PAYLOAD = {
  object: "whatsapp_business_account",
  entry: [
    {
      changes: [
        {
          value: {
            messages: [
              {
                id: "wamid.TEST123",
                from: "5491100000000",
                type: "text",
                timestamp: "1700000000",
                text: { body: "Hola, ¿qué es Acme Assistant?" },
              },
            ],
          },
        },
      ],
    },
  ],
};

test("parsea un mensaje de texto al contrato AgentRequest", () => {
  const msgs = parseWebhook(TEXT_PAYLOAD);
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].channel, "whatsapp");
  assert.equal(msgs[0].messageId, "wamid.TEST123");
  assert.equal(msgs[0].from, "5491100000000");
  assert.equal(msgs[0].text, "Hola, ¿qué es Acme Assistant?");
});

test("ignora status updates y payloads vacíos/inválidos", () => {
  assert.deepEqual(parseWebhook({ entry: [{ changes: [{ value: { statuses: [{ id: "x" }] } }] }] }), []);
  assert.deepEqual(parseWebhook({}), []);
  assert.deepEqual(parseWebhook(null), []);
  assert.deepEqual(parseWebhook("not-json"), []);
});

// --- Idempotencia (claim atómico con QueryFn fake) ---

/** Query fake en memoria: emula la PK + ON CONFLICT DO NOTHING de Postgres. */
function fakeQuery(): QueryFn {
  const seen = new Set<string>();
  return async (_text, params) => {
    const id = String(params[0]);
    if (seen.has(id)) return { rowCount: 0 };
    seen.add(id);
    return { rowCount: 1 };
  };
}

test("claimMessage: nuevo → true, duplicado → false, otro id → true", async () => {
  const query = fakeQuery();
  assert.equal(await claimMessage("wamid.A", query), true);
  assert.equal(await claimMessage("wamid.A", query), false);
  assert.equal(await claimMessage("wamid.B", query), true);
});
