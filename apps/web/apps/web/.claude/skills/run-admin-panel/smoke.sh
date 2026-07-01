#!/usr/bin/env bash
# Smoke test for HubFlow Admin Panel
# Tests: build, dev server, API routes, page responses
#
# Usage: bash .claude/skills/run-admin-panel/smoke.sh
# Requires: Node.js 18+, npm deps installed, .env.local configured
# Platform: Windows (Git Bash / MSYS2) or Linux

set -euo pipefail
cd "$(dirname "$0")/../../.."  # → apps/web/

PORT=${PORT:-3099}
BASE="http://localhost:$PORT"
PASSED=0
FAILED=0

green() { printf '\033[32m✓ %s\033[0m\n' "$1"; PASSED=$((PASSED+1)); }
red()   { printf '\033[31m✗ %s\033[0m\n' "$1"; FAILED=$((FAILED+1)); }
check() {
  local desc="$1" url="$2" expect="$3"
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' "$url" 2>/dev/null || echo "000")
  if [ "$code" = "$expect" ]; then
    green "$desc (HTTP $code)"
  else
    red "$desc — expected $expect, got $code"
  fi
}

kill_port() {
  # Cross-platform port kill
  if command -v taskkill &>/dev/null; then
    taskkill //F //IM node.exe 2>/dev/null || true
  elif command -v lsof &>/dev/null; then
    lsof -ti:$PORT 2>/dev/null | xargs kill -9 2>/dev/null || true
  fi
}

echo "═══════════════════════════════════════"
echo " HubFlow Admin Panel — Smoke Test"
echo "═══════════════════════════════════════"
echo ""

# --- Step 1: Build check ---
echo "▶ Step 1: Build"
kill_port
rm -rf .next
if npx next build > /tmp/admin-build.log 2>&1; then
  green "next build passed"
else
  red "next build failed (see /tmp/admin-build.log)"
  tail -10 /tmp/admin-build.log
fi
echo ""

# --- Step 2: Start dev server ---
echo "▶ Step 2: Dev server (port $PORT)"
npx next dev --port $PORT > /tmp/admin-dev.log 2>&1 &
SERVER_PID=$!
sleep 12

if curl -s -o /dev/null -w '%{http_code}' "$BASE/api/health" 2>/dev/null | grep -q 200; then
  green "dev server started (PID $SERVER_PID)"
else
  red "dev server failed to start"
  tail -10 /tmp/admin-dev.log
  kill $SERVER_PID 2>/dev/null || true
  exit 1
fi
echo ""

# --- Step 3: API health ---
echo "▶ Step 3: API Endpoints"
check "GET /api/health" "$BASE/api/health" 200

# Health content validation
HEALTH=$(curl -s "$BASE/api/health")
if echo "$HEALTH" | grep -q '"status":"ok"'; then
  green "Health status: ok"
else
  red "Health status: not ok"
fi
if echo "$HEALTH" | grep -q '"database":"ok"'; then
  green "Database: connected"
else
  red "Database: not connected"
fi
echo ""

# --- Step 4: Admin auth guard ---
echo "▶ Step 4: Admin Auth Guard"
check "GET /admin (→ 307 redirect)" "$BASE/admin" 307
check "GET /admin/tenants (→ 307)" "$BASE/admin/tenants" 307
check "GET /admin/billing (→ 307)" "$BASE/admin/billing" 307
check "GET /admin/logs (→ 307)" "$BASE/admin/logs" 307
check "GET /admin/configuracoes (→ 307)" "$BASE/admin/configuracoes" 307
echo ""

# --- Step 5: Admin API auth ---
echo "▶ Step 5: Admin API (401 without auth)"
SETTINGS_RESP=$(curl -s "$BASE/api/admin/settings")
if echo "$SETTINGS_RESP" | grep -q 'error'; then
  green "GET /api/admin/settings → 401"
else
  red "GET /api/admin/settings — no auth error"
fi

ACTIONS_RESP=$(curl -s -X POST "$BASE/api/admin/tenants/fake-id/actions" -H 'Content-Type: application/json' -d '{"action":"suspend"}')
if echo "$ACTIONS_RESP" | grep -q 'error'; then
  green "POST /api/admin/tenants/[id]/actions → 401"
else
  red "POST /api/admin/tenants/[id]/actions — no auth error"
fi
echo ""

# --- Step 6: Public pages ---
echo "▶ Step 6: Public Pages"
check "GET /login" "$BASE/login" 200
check "GET /signup" "$BASE/signup" 200
echo ""

# --- Cleanup ---
kill $SERVER_PID 2>/dev/null || kill_port

# --- Summary ---
echo "═══════════════════════════════════════"
printf " Results: \033[32m%d passed\033[0m, \033[31m%d failed\033[0m\n" $PASSED $FAILED
echo "═══════════════════════════════════════"

[ $FAILED -eq 0 ] && exit 0 || exit 1
