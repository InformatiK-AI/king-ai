# Tasks — Arquitectura hexagonal multicanal + WhatsApp

> Fase: sdd-tasks · Change: hexagonal-multicanal-whatsapp · Agrupadas por repo/módulo

## Fase 0 — Worktrees

- [x] Worktree `feature/hexagonal-multicanal` desde develop en `ai-agent-starter-pro`
- [x] Worktree `feature/hexagonal-multicanal` desde develop en `king-ai`
- [x] `.gitattributes`: `*.ts/*.tsx/*.sql eol=lf` en ambos repos (gotcha CRLF/HMAC)

## Fase 1 — Dominio standalone (lib/agent)

- [x] `lib/agent/types.ts` — `Channel`, `channelLimit`, `InboundMessage`, `AgentReply`, `GenerateFn`/`GenerateResult`
- [x] `lib/safety/index.ts` — `guardOutput(text)` → `GuardOutputResult` con `moderateText` (BREAKING: era no-op acoplado)
- [x] `lib/agent/resilience.ts` — `withTimeout`, `withRetry` (backoff+jitter), `isNonRetriable`, `DEFAULT_RESILIENCE`
- [x] `lib/agent/providers/ai-sdk.ts` — `GenerateFn` sobre Vercel AI SDK (único import del SDK)
- [x] `lib/agent/ask.ts` — `ask` + `askStream` + `prepare`/`finalize` + degradación graceful
- [x] `lib/agent/index.ts` — fachada del dominio

## Fase 2 — Adaptadores + WhatsApp standalone

- [x] `app/api/chat/route.ts` — adaptador delgado (ReadableStream texto plano desde `askStream`)
- [x] `lib/agent/whatsapp/{verify,parse,dedup,send}.ts`
- [x] `app/api/whatsapp/route.ts` — GET verify + POST firma→ack→async(dedup→ask→send)
- [x] `db/migrations/0002_whatsapp_dedup.sql` — tabla `wa_dedup` + índice
- [x] `scripts/{demo,eval}.ts` — migrados al puerto `ask()`

## Fase 3 — Tests + validación standalone

- [x] `tests/unit/{ask,resilience,guard-output,whatsapp-verify,whatsapp-parse,whatsapp-dedup}.test.ts` + fixture
- [x] `package.json` — scripts `test:unit`, `test`; version 1.0.1 → 1.1.0
- [x] README (arquitectura hexagonal + WhatsApp + Caminos de evolución), CHANGELOG v1.1.0, `.king/quality-gates.yaml` (ai.channel/ai.resilience)
- [x] Verde: `typecheck` + `build` + `test:safety` + `test:unit` (23/23)
- [ ] `.env.example` con vars WhatsApp — BLOQUEADO por gate de seguridad; documentado en README (usuario lo agrega)

## Fase 4 — Cosecha a generadores king-ai

- [x] templates `agent/{types,ask,resilience,index}.ts` + `providers/llmprovider-adapter.ts`
- [x] templates `channels/whatsapp/{whatsapp-route,signature,parse,idempotency,send}.ts` + migración + test
- [x] refactor `chatbot/chat-api-route.ts` → adaptador delgado + `chatbot.test.ts`
- [x] knowledge `_inject/{resilience-patterns,testing-essentials}.md`
- [x] SKILL.md ai-feature-scaffold (CASTLE C·A·S·T, ADR-005, fix ADR-004), DISCOVERY, GENERATION
- [x] SKILL.md llm-integration (fix ADR-004, knowledge status), IMPLEMENTATION
- [x] `knowledge/domain/ai-agent-starter-pro-spec.md` (ADR hexagonal + gates)

## Fase 5 — Cierre

- [x] Planning SDD persistido en `king-ai/openspec` (este change)
- [ ] Review + QA + CASTLE pre-merge
- [ ] Merge a develop (standalone→king-ai) + cleanup worktrees
- [ ] Push manual + release v1.1.0 (usuario)
