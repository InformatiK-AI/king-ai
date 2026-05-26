# CASTLE Capas por Skill

> **Fuente autoritativa** de layers activos por contexto de skill.
> Los SKILL.md referencian este archivo con shorthand como recordatorio rápido.
> Ver `skills/castle/SKILL.md` para la definición completa de cada capa.

| Skill | C | A | S | T | L | E | Shorthand | Gate mínimo |
|-------|---|---|---|---|---|---|-----------|-------------|
| `build` | ✓ | ✓ | - | ✓ | ✓ | - | C·A·_·T·L·_ | CONDITIONAL |
| `qa` | ✓ | ✓ | ✓ | ✓ | ✓ | - | C·A·S·T·L·_ | CONDITIONAL |
| `review` | ✓ | ✓ | ✓ | ✓ | - | - | C·A·S·T·_·_ | CONDITIONAL |
| `qa-batch` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | C·A·S·T·L·E | FORTIFIED |
| `qa-env` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | C·A·S·T·L·E | FORTIFIED |
| `release` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | C·A·S·T·L·E | FORTIFIED |
| `refactor` | - | ✓ | - | ✓ | - | - | _·A·_·T·_·_ | CONDITIONAL |
| `optimize` | - | ✓ | - | ✓ | ✓ | - | _·A·_·T·L·_ | CONDITIONAL |
| `merge` | - | ✓ | - | ✓ | - | - | _·A·_·T·_·_ | CONDITIONAL |
| `fix` | - | ✓ | ✓ | ✓ | - | - | _·A·S·T·_·_ | CONDITIONAL |
| `plan` | ✓ | ✓ | ✓ | - | - | - | C·A·S·_·_·_ | CONDITIONAL |
| `create-issues` | ✓ | ✓ | - | - | - | - | C·A·_·_·_·_ | CONDITIONAL |
| `frontend-design` | - | ✓ | - | ✓ | - | - | _·A·_·T·_·_ | CONDITIONAL |
| `test-plan` | ✓ | ✓ | ✓ | ✓ | - | - | C·A·S·T·_·_ | CONDITIONAL |
| `promote` | - | - | ✓ | - | - | ✓ | _·_·S·_·_·E | CONDITIONAL |
| `db-migrate` | ✓ | ✓ | ✓ | ✓ | - | ✓ | C·A·S·T·_·E | CONDITIONAL |

## Leyenda
- **C** — Contracts: consistencia de interfaces y contratos de API
- **A** — Architecture: decisiones de diseño y dependencias
- **S** — Security: gate de seguridad (secrets, vulnerabilidades, patrones peligrosos)
- **T** — Testing: cobertura de tests y calidad
- **L** — Logging: observabilidad, métricas y trazabilidad
- **E** — Evidence: evidencia visual de ejecución (screenshots, outputs)
