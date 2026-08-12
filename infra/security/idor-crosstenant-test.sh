#!/usr/bin/env bash
# Prova de isolamento multi-tenant no RUNTIME (o que o DAST sem-credencial não cobre).
# Loga como Tenant A e Tenant B, cria um recurso INÓCUO em B, e tenta lê-lo/apagá-lo
# com a sessão de A. Espera 403/404 e ausência do recurso na listagem de A.
#
# Usa /api/ad-campaigns de propósito: é o recurso do achado C2 e NÃO dispara WhatsApp
# nem Stripe. NÃO toca /api/broadcasts|dispatch|groups|session (side-effects reais).
#
# Uso:  BASE=http://localhost:3000 bash infra/security/idor-crosstenant-test.sh
set -uo pipefail
BASE="${BASE:-http://localhost:3000}"
A_EMAIL="tenant-a@sectest.invalid"; A_PASS="SecTest-A-8f3k2z"
B_EMAIL="tenant-b@sectest.invalid"; B_PASS="SecTest-B-7d9m1q"
JAR_A="$(mktemp)"; JAR_B="$(mktemp)"
fail=0

login() { # email pass jar -> http_code
  curl -s -c "$3" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" -o /dev/null -w "%{http_code}"
}

echo "== login =="
echo "  A -> $(login "$A_EMAIL" "$A_PASS" "$JAR_A")"
echo "  B -> $(login "$B_EMAIL" "$B_PASS" "$JAR_B")"

echo "== B cria recurso inócuo (ad-campaign) =="
CAMP_B="$(curl -s -b "$JAR_B" -X POST "$BASE/api/ad-campaigns" -H "Content-Type: application/json" \
  -d '{"name":"IDOR-probe-B","targetGroupName":"probe","inviteUrl":"https://chat.whatsapp.com/PROBE"}')"
ID_B="$(printf '%s' "$CAMP_B" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')"
echo "  id de B = ${ID_B:-<falhou>}"
[ -z "$ID_B" ] && { echo "ABORT: não consegui criar recurso em B"; exit 1; }

echo "== IDOR checks (A contra recurso de B) =="
A_LIST="$(curl -s -b "$JAR_A" "$BASE/api/ad-campaigns")"
if printf '%s' "$A_LIST" | grep -q "$ID_B"; then echo "  FAIL: A enxerga a campanha de B (VAZAMENTO cross-tenant)"; fail=1
else echo "  PASS: A não enxerga a campanha de B"; fi

DEL="$(curl -s -b "$JAR_A" -X DELETE "$BASE/api/ad-campaigns?id=$ID_B" -o /dev/null -w '%{http_code}')"
if [ "$DEL" = "404" ] || [ "$DEL" = "403" ]; then echo "  PASS: A DELETE campanha de B -> $DEL"
else echo "  FAIL: A DELETE campanha de B -> $DEL (esperado 403/404)"; fail=1; fi

# Confere que a campanha de B ainda existe (o DELETE de A não pegou)
STILL="$(curl -s -b "$JAR_B" "$BASE/api/ad-campaigns" | grep -c "$ID_B")"
[ "$STILL" -ge 1 ] && echo "  PASS: campanha de B intacta após tentativa de A" || { echo "  FAIL: campanha de B sumiu (A conseguiu apagar!)"; fail=1; }

echo "== cleanup (B apaga a própria) =="
curl -s -b "$JAR_B" -X DELETE "$BASE/api/ad-campaigns?id=$ID_B" -o /dev/null -w '  cleanup -> %{http_code}\n'
rm -f "$JAR_A" "$JAR_B"

echo ""
[ "$fail" -eq 0 ] && echo "RESULTADO: isolamento multi-tenant OK ✅" || { echo "RESULTADO: FALHA DE ISOLAMENTO ❌"; exit 2; }
