#!/usr/bin/env bash
# Gateway smoke test — runs against a locally running API Gateway on port 3000.
# Prerequisites: make infra-up && make auth-dev && make gateway-dev

set -euo pipefail

GATEWAY="http://localhost:3000"
AUTH="http://localhost:3004"
PASS=0
FAIL=0

green() { printf "\033[32m✓\033[0m %s\n" "$1"; }
red()   { printf "\033[31m✗\033[0m %s\n" "$1"; }

check() {
  local desc="$1"
  local expected="$2"
  local actual="$3"
  if echo "$actual" | grep -q "$expected"; then
    green "$desc"
    PASS=$((PASS + 1))
  else
    red "$desc (expected: $expected, got: $actual)"
    FAIL=$((FAIL + 1))
  fi
}

echo ""
echo "=== FlowMesh Gateway Smoke Test ==="
echo "Gateway: $GATEWAY"
echo ""

# ── Health ────────────────────────────────────────────────────────────────────

echo "--- Health ---"
HEALTH=$(curl -s "$GATEWAY/health")
check "GET /health returns ok" '"status":"ok"' "$HEALTH"

# ── Public auth routes (no credentials required) ─────────────────────────────

echo ""
echo "--- Public auth routes ---"

REGISTER=$(curl -s -X POST "$GATEWAY/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke@flowmesh.dev","password":"Password123!","workspaceName":"smoke-workspace"}' \
  -w "\n%{http_code}")
HTTP_CODE=$(echo "$REGISTER" | tail -1)
BODY=$(echo "$REGISTER" | head -1)
check "POST /auth/register returns 201 or 409 (already exists)" "201\|409" "$HTTP_CODE"

LOGIN=$(curl -s -X POST "$GATEWAY/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke@flowmesh.dev","password":"Password123!"}')
check "POST /auth/login returns accessToken" "accessToken" "$LOGIN"

ACCESS_TOKEN=$(echo "$LOGIN" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

# ── Protected routes — no credentials → 401 ──────────────────────────────────

echo ""
echo "--- Auth enforcement ---"

NO_AUTH=$(curl -s -o /dev/null -w "%{http_code}" "$GATEWAY/pipelines")
check "GET /pipelines without auth returns 401" "401" "$NO_AUTH"

BAD_TOKEN=$(curl -s -o /dev/null -w "%{http_code}" "$GATEWAY/pipelines" \
  -H "Authorization: Bearer this.is.invalid")
check "GET /pipelines with invalid JWT returns 401" "401" "$BAD_TOKEN"

# ── Protected routes — valid JWT ─────────────────────────────────────────────

echo ""
echo "--- JWT auth ---"

if [ -n "$ACCESS_TOKEN" ]; then
  PIPELINES=$(curl -s -o /dev/null -w "%{http_code}" "$GATEWAY/pipelines" \
    -H "Authorization: Bearer $ACCESS_TOKEN")
  check "GET /pipelines with valid JWT passes auth (200 or 502 if config-service down)" \
    "200\|502\|503" "$PIPELINES"
else
  red "Skipping JWT auth test — could not obtain access token"
  FAIL=$((FAIL + 1))
fi

# ── API key auth ──────────────────────────────────────────────────────────────

echo ""
echo "--- API key auth ---"

INVALID_KEY=$(curl -s -o /dev/null -w "%{http_code}" "$GATEWAY/pipelines" \
  -H "x-api-key: fm_invalidkey123")
check "GET /pipelines with invalid API key returns 401" "401" "$INVALID_KEY"

# ── Rate limiting ─────────────────────────────────────────────────────────────

echo ""
echo "--- Rate limiting headers ---"

if [ -n "$ACCESS_TOKEN" ]; then
  RATE_HEADERS=$(curl -s -I "$GATEWAY/pipelines" \
    -H "Authorization: Bearer $ACCESS_TOKEN" | tr -d '\r')
  check "GET /pipelines with JWT includes X-RateLimit-Limit header" \
    "x-ratelimit-limit\|X-RateLimit-Limit" "$RATE_HEADERS"
else
  red "Skipping rate limit header test — no access token"
  FAIL=$((FAIL + 1))
fi

# ── Summary ───────────────────────────────────────────────────────────────────

echo ""
echo "=================================="
echo "Passed: $PASS  Failed: $FAIL"
echo "=================================="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
