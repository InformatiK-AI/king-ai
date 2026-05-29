# Spec — whatsapp-channel

> Capability: adaptador de entrada WhatsApp (webhook de Meta) sobre el puerto de dominio. RFC 2119.

## Requisito: verificación de firma

El POST del webhook **MUST** validar `X-Hub-Signature-256` = `sha256=` + HMAC-SHA256(rawBody, `WHATSAPP_APP_SECRET`) con comparación timing-safe. Si la firma falta o no coincide, responde **401** y no procesa.

```gherkin
Scenario: payload no firmado
  Given un POST sin firma válida
  When llega al webhook
  Then responde 401 y no invoca el dominio
```

## Requisito: idempotencia

```gherkin
Scenario: Meta reintrega el mismo mensaje
  Given dos POST con el mismo message_id
  When cada uno llama claimMessage(message_id)
  Then solo el primero obtiene rowCount==1 (INSERT ON CONFLICT DO NOTHING)
  And el segundo se ignora sin reprocesar
```

## Requisito: ack inmediato + proceso async

El handler **MUST** responder **200 OK** sin esperar la generación (para no exceder el timeout de reintento de Meta) y procesar el mensaje de forma asíncrona.

## Requisito: verificación de webhook (GET)

```gherkin
Scenario: alta del webhook en Meta
  Given un GET con hub.mode=subscribe y hub.verify_token == WHATSAPP_VERIFY_TOKEN
  Then responde 200 con hub.challenge
  Else responde 403
```

## Requisito: límite de longitud por canal

La respuesta enviada **MUST** truncarse a `channelLimit.whatsapp` (4096) antes del envío.

## Verificación

`tests/unit/whatsapp-verify.test.ts` (firma válida/alterada/payload alterado/header ausente/secret ausente), `whatsapp-parse.test.ts` (payload Cloud API → canónico; ignora status updates) y `whatsapp-dedup.test.ts` (claim con query fake). El e2e real (recepción/envío) requiere cuenta de WhatsApp Business del usuario.
