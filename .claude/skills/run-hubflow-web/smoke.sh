#!/usr/bin/env bash
# HubFlow Web — Smoke Test
# Starts dev server, verifies endpoints, reports pass/fail.
#
# Usage (from repo root):
#   bash .claude/skills/run-hubflow-web/smoke.sh
#
# Or from apps/web:
#   bash ../../.claude/skills/run-hubflow-web/smoke.sh
#
# Requires: Node.js 20+, npm deps installed, apps/web/.env.local configured
# Platform: Windows (Git Bash / MSYS2) or Linux

set -euo pipefail

# Navigate to apps/web regardless of where script is called from
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
cd "$REPO_ROOT/apps/web"

PORT=${PORT:-3099}
BASE="http://localhost:$PORT"
PASSED=0
FAILED=0
SERVER_PID=""

green() { printf '\033[32m✓ %s\033[0m\n' "$1"; PASSED=$((PASSED+1)); }
red()   { printf '\033[31m✗ %s\033[0m\n' "$1"; FAILED=$((FAILED+1)); }

check_status() {
  local desc="$1" url="$2" expect="$3"
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' "$url" 2>/dev/null || echo "000")
  if [ "$code" = "$expect" ]; then
    green "$desc (HTTP $code)"
  else
    red "$desc — expected $expect, got $code"
  fi
}

check_body() {
  local desc="$1" url="$2" pattern="$3"
  local body
  body=$(curl -s "$url" 2>/dev/null || echo "")
  if echo "$body" | grep -q "$pattern"; then
    green "$desc"
  else
    red "$desc — pattern '$pattern' not found"
  fi
}

cleanup() {
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  # Windows fallback
  if command -v taskkill &>/dev/null; then
    taskkill //F //IM node.exe 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "══════════════════════════════════════════"
echo " HubFlow Web — Smoke Test (port $PORT)"
echo "══════════════════════════════════════════"
echo ""

# --- Kill anything on the port ---
if command -v lsof &>/dev/null; then
  lsof -ti:$PORT 2>/dev/null | xargs kill -9 2>/dev/null || true
elif command -v taskkill &>/dev/null; then
  # Best-effort on Windows
  taskkill //F //IM node.exe 2>/dev/null || true
fi
sleep 1

# --- Start dev server ---
echo "▶ Starting dev server..."
npx next dev --port $PORT > /tmp/hubflow-dev.log 2>&1 &
SERVER_PID=$!

# Wait for server to be ready (max 30s)
for i in $(seq 1 30); do
  if curl -s -o /dev/null "$BASE/api/health" 2>/dev/null; then
    break
  fi
  sleep 1
done

# Verify server is up
if ! curl -s -o /dev/null "$BASE/api/health" 2>/dev/null; then
  red "Dev server failed to start (PID $SERVER_PID)"
  echo "Last 10 lines of log:"
  tail -10 /tmp/hubflow-dev.log 2>/dev/null || true
  exit 1
fi
green "Dev server ready (PID $SERVER_PID)"
echo ""

# --- Health endpoint ---
echo "▶ Health"
check_status "GET /api/health" "$BASE/api/health" 200
check_body "Health status: ok" "$BASE/api/health" '"status":"ok"'
check_body "Database: connected" "$BASE/api/health" '"database":"ok"'
echo ""

# --- Admin auth guard (pages → 307) ---
echo "▶ Admin Auth Guard (expect 307)"
check_status "GET /admin" "$BASE/admin" 307
check_status "GET /admin/tenants" "$BASE/admin/tenants" 307
check_status "GET /admin/billing" "$BASE/admin/billing" 307
check_status "GET /admin/logs" "$BASE/admin/logs" 307
check_status "GET /admin/configuracoes" "$BASE/admin/configuracoes" 307
echo ""

# --- Admin API auth (expect 401 / error in body) ---
echo "▶ Admin API (expect 401)"
check_body "GET /api/admin/settings → auth error" "$BASE/api/admin/settings" 'error'
check_body "POST /api/admin/tenants/[id]/actions → auth error" "$BASE/api/admin/tenants/fake-id/actions" 'error'
echo ""

# --- Public pages ---
echo "▶ Public Pages"
check_status "GET /login" "$BASE/login" 200
check_status "GET /signup" "$BASE/signup" 200
check_status "GET /painel" "$BASE/painel" 307
echo ""

# --- Summary ---
echo "══════════════════════════════════════════"
printf " Results: \033[32m%d passed\033[0m, \033[31m%d failed\033[0m\n" $PASSED $FAILED
echo "══════════════════════════════════════════"

[ $FAILED -eq 0 ] && exit 0 || exit 1
