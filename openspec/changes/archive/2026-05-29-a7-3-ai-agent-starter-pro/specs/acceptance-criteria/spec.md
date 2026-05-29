# acceptance-criteria — Delta Spec

> Los 4 criterios de la spec del template son el contrato verificable. Capability del change a7-3.

## ADDED Requirements

### Requirement: Build TypeScript sin errores (criterio 4 — verificable en este ciclo)

El repo generado MUST compilar con `npm run build` (Next.js build + `tsc --noEmit`) con **0 errores** de TypeScript,
desde un clone limpio tras `npm install`. Tipado estricto (`strict: true`).

#### Scenario: Build limpio desde clone
- **GIVEN** un clone limpio del repo con `npm install` ejecutado
- **WHEN** se corre `npm run build`
- **THEN** termina con 0 errores TypeScript
- **AND** `tsconfig.json` tiene `strict: true`

### Requirement: Scripts de aceptación presentes y ejecutables

`package.json` MUST definir los scripts `demo`, `eval`, `test:safety`, `build`, `ingest`, `db:migrate`. Cada uno MUST
estar cableado a su implementación real (no placeholders vacíos).

#### Scenario: Scripts declarados
- **GIVEN** el repo generado
- **WHEN** se inspecciona `package.json`
- **THEN** existen los 6 scripts con comandos reales

### Requirement: Criterios de runtime (1-3) — requieren entorno del usuario

Los criterios `demo` (<10s), `eval` (golden_set_score≥0.85) y `test:safety` (jailbreak_block_rate≥95%) MUST ser
ejecutables, pero su verificación SHALL requerir `ANTHROPIC_API_KEY` + Postgres/pgvector. El README MUST documentar
que estos 3 se validan en el entorno del usuario. NO MUST afirmarse que pasan sin haberse corrido.

#### Scenario: Documentación honesta de runtime
- **GIVEN** el repo generado en este ciclo (sin credenciales)
- **WHEN** se lee el README y el verify-report
- **THEN** los criterios 1-3 se marcan "pendiente de runtime del usuario", no "PASS"

### Requirement: Gates heredados preconfigurados

`.king/quality-gates.yaml` MUST incluir la sección `ai:` con: cost.usd_per_request_p95 0.05, latency.p95_ms 3000,
eval.golden_set_score 0.85, safety.jailbreak_block_rate 95, safety.pii_leak_rate 0, observability.tracing_coverage_pct 100,
enforcement block.

#### Scenario: Gates presentes
- **GIVEN** el repo generado
- **WHEN** se parsea `.king/quality-gates.yaml`
- **THEN** la sección `ai:` contiene los 6 thresholds y enforcement block
