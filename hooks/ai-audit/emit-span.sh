#!/usr/bin/env bash
# hooks/ai-audit/emit-span.sh — King AI M-13 /ai-audit-ledger
#
# PostToolUse hook (otel-trace-emit): emite UN span de acción AI por cada
# ejecución de tool y lo ANEXA como una línea NDJSON al ledger diario.
#
#   .king/audit/YYYY-MM-DD.jsonl   (un evento JSON por línea — append-only)
#
# Lee las variables de entorno provistas por el harness:
#   AGENT_ID, TOOL_NAME, DURATION_MS, TOKEN_COST_ESTIMATED, RESULT_STATUS, SDD_PHASE
#
# REGLA DE ORO: este hook NUNCA debe bloquear el tool. Pase lo que pase, SALE 0.
# Auditar las acciones del AI no puede romper el trabajo del AI.
#
# NOTA DE QUOTING (lección conocida del framework): TODA expansión de variable
# y de ${CLAUDE_PLUGIN_ROOT} va entre COMILLAS DOBLES. Las comillas simples
# impiden la expansión y rompen el hook.

# No usamos `set -e`: un fallo intermedio jamás debe propagar exit != 0.
set -u 2>/dev/null || true

# ── 0. Salida segura garantizada ────────────────────────────────────────────
# Cualquier error inesperado cae aquí y sale 0 (el ledger es best-effort).
trap 'exit 0' ERR

# ── 1. Resolver la raíz del proyecto (donde vive .king/) ─────────────────────
PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "${PROJECT_ROOT:-}" ]; then
  PROJECT_ROOT="$(pwd)"
fi

AUDIT_DIR="${PROJECT_ROOT}/.king/audit"

# ── 2. Crear el directorio del ledger si no existe ───────────────────────────
mkdir -p "${AUDIT_DIR}" 2>/dev/null || exit 0

DAY="$(date -u +%Y-%m-%d 2>/dev/null || echo unknown)"
LEDGER="${AUDIT_DIR}/${DAY}.jsonl"

# ── 3. Leer env vars con defaults seguros ────────────────────────────────────
AGENT_ID="${AGENT_ID:-unknown}"
TOOL_NAME="${TOOL_NAME:-unknown}"
DURATION_MS="${DURATION_MS:-0}"
TOKEN_COST_ESTIMATED="${TOKEN_COST_ESTIMATED:-0}"
RESULT_STATUS="${RESULT_STATUS:-unknown}"
SDD_PHASE="${SDD_PHASE:-unknown}"
FEATURE_ID="${FEATURE_ID:-unknown}"
SESSION_ID="${SESSION_ID:-unknown}"

TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo unknown)"

# ── 4. Helpers de escape JSON ────────────────────────────────────────────────
# Escapa un valor de string para JSON: barra invertida, comillas dobles y saltos.
json_escape() {
  local s="${1:-}"
  s="${s//\\/\\\\}"   # \  -> \\
  s="${s//\"/\\\"}"   # "  -> \"
  s="${s//$'\n'/\\n}" # \n -> literal \n
  s="${s//$'\r'/\\r}" # \r -> literal \r
  s="${s//$'\t'/\\t}" # \t -> literal \t
  printf '%s' "${s}"
}

# Devuelve el valor si es numérico; si no, 0 (los campos numéricos van sin comillas).
json_number() {
  local v="${1:-0}"
  case "${v}" in
    ''|*[!0-9.]*) printf '0' ;;
    *)            printf '%s' "${v}" ;;
  esac
}

# ── 5. Construir el input hash (para loop detection en el skill) ─────────────
# Hash estable de tool+agente+fase; el skill lo usa para detectar el mismo
# tool repetido con el mismo input en una ventana corta.
HASH_INPUT="${TOOL_NAME}|${AGENT_ID}|${SDD_PHASE}|${FEATURE_ID}"
if command -v sha256sum >/dev/null 2>&1; then
  INPUT_HASH="$(printf '%s' "${HASH_INPUT}" | sha256sum 2>/dev/null | cut -c1-16)"
elif command -v shasum >/dev/null 2>&1; then
  INPUT_HASH="$(printf '%s' "${HASH_INPUT}" | shasum -a 256 2>/dev/null | cut -c1-16)"
else
  INPUT_HASH="nohash"
fi
[ -z "${INPUT_HASH}" ] && INPUT_HASH="nohash"

# ── 6. Emitir la línea NDJSON (append-only) ──────────────────────────────────
# Todos los campos string escapados; los numéricos sin comillas.
LINE="$(printf '{"ts":"%s","schema":"king.ai_audit.v1","event":"tool_span","agent_id":"%s","tool_name":"%s","duration_ms":%s,"tokens_estimated":%s,"result_status":"%s","phase":"%s","feature":"%s","session_id":"%s","input_hash":"%s"}' \
  "$(json_escape "${TIMESTAMP}")" \
  "$(json_escape "${AGENT_ID}")" \
  "$(json_escape "${TOOL_NAME}")" \
  "$(json_number "${DURATION_MS}")" \
  "$(json_number "${TOKEN_COST_ESTIMATED}")" \
  "$(json_escape "${RESULT_STATUS}")" \
  "$(json_escape "${SDD_PHASE}")" \
  "$(json_escape "${FEATURE_ID}")" \
  "$(json_escape "${SESSION_ID}")" \
  "$(json_escape "${INPUT_HASH}")")"

# Append atómico best-effort. Si falla la escritura, no rompemos nada.
printf '%s\n' "${LINE}" >> "${LEDGER}" 2>/dev/null || true

# ── 7. Salir SIEMPRE 0 — el ledger jamás bloquea el tool ─────────────────────
exit 0
