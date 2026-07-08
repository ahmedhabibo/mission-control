#!/usr/bin/env bash
# hermes-verify-mission-control.sh
# Ad-hoc verification of the v0.3.0 + gateway-migration changes
# in /Users/bashir/Documents/Zcode Projects/mission-control.
# Run from any cwd; locates the repo by absolute path.

set -uo pipefail

PASS=0; FAIL=0; NOTE=0
ok()   { echo "  PASS  $1"; PASS=$((PASS+1)); }
nope() { echo "  FAIL  $1"; FAIL=$((FAIL+1)); }
info() { echo "  NOTE  $1"; NOTE=$((NOTE+1)); }

REPO='/Users/bashir/Documents/Zcode Projects/mission-control'
cd "$REPO" || { echo "could not cd to $REPO"; exit 2; }

echo
echo "=== 1. Targets exist & are non-empty ==="
for f in \
  ".env.example" \
  "package.json" \
  "src/app/api/settings/route.ts" \
  "src/app/settings/page.tsx" \
  "src/lib/chat/adapters/hermes.ts" \
  "src/lib/chat/adapters/mistral.ts" \
  "src/lib/probes/composite.ts" \
  "src/lib/types.ts" \
  "src/server/gateway.ts"
do
  if [[ -s "$REPO/$f" ]]; then ok "present  $f ($(wc -l < "$REPO/$f") lines)"
  else nope "MISSING or empty: $f"
  fi
done

echo
echo "=== 2. Open Notebook removed ==="
if [[ -f "$REPO/src/lib/probes/docker.ts" ]]; then
  nope "src/lib/probes/docker.ts still exists"
else
  ok "src/lib/probes/docker.ts deleted"
fi
if grep -q 'DockerProbe' "$REPO/src/lib/types.ts"; then
  nope "DockerProbe still referenced in src/lib/types.ts"
else
  ok "DockerProbe removed from src/lib/types.ts"
fi
if grep -q 'OPEN_NOTEBOOK' "$REPO/.env.example" 2>/dev/null; then
  nope ".env.example still mentions OPEN_NOTEBOOK"
else
  ok ".env.example has no OPEN_NOTEBOOK_*"
fi
if grep -Rq 'open-notebook' "$REPO/src" 2>/dev/null; then
  nope "src/ still references 'open-notebook' somewhere"
else
  ok "src/ has no 'open-notebook' references"
fi

echo
echo "=== 3. Gateway-first chat adapters ==="
HERMES="$REPO/src/lib/chat/adapters/hermes.ts"
MISTRAL="$REPO/src/lib/chat/adapters/mistral.ts"

if grep -E 'NIM_(BASE_URL|API_KEY)' "$HERMES" >/dev/null; then
  nope "Hermes adapter still touches NIM_* env vars"
else
  ok "Hermes adapter has no NIM_* env references"
fi
if grep -q 'streamViaGateway' "$HERMES"; then
  ok "Hermes adapter calls streamViaGateway"
else
  nope "Hermes adapter does NOT call streamViaGateway"
fi
if grep -E 'MISTRAL_(API_KEY|BASE_URL)' "$MISTRAL" >/dev/null; then
  nope "Mistral adapter still touches MISTRAL_* env vars"
else
  ok "Mistral adapter has no MISTRAL_* env references"
fi
if grep -q 'streamViaGateway' "$MISTRAL"; then
  ok "Mistral adapter calls streamViaGateway"
else
  nope "Mistral adapter does NOT call streamViaGateway"
fi

echo
echo "=== 4. Dev gateway carries canonical-id aliases ==="
GW="$REPO/src/server/gateway.ts"
if grep -E '"hermes"\s*:' "$GW" >/dev/null && grep -E '"mistral-vibe"\s*:' "$GW" >/dev/null; then
  ok "src/server/gateway.ts has aliases for 'hermes' and 'mistral-vibe'"
else
  nope "src/server/gateway.ts is missing canonical-id aliases"
fi
if grep -q 'ALIAS_BACKEND' "$GW"; then
  ok "ALIAS_BACKEND map declared"
else
  nope "ALIAS_BACKEND map missing"
fi

echo
echo "=== 5. .env.example only carries gateway + DB ==="
ENV_FILE="$REPO/.env.example"
for forbidden in NIM_BASE_URL NIM_API_KEY MISTRAL_API_KEY TELEGRAM_BOT_TOKEN DISCORD_BOT_TOKEN OPEN_NOTEBOOK_CONTAINER OPEN_NOTEBOOK_PORT HERMES_WEBUI_URL; do
  if grep -E "^${forbidden}=" "$ENV_FILE" >/dev/null; then
    nope ".env.example still has ${forbidden}="
  else
    ok ".env.example unset  ${forbidden}"
  fi
done
if grep -E '^MC_GATEWAY_URL=' "$ENV_FILE" >/dev/null; then
  ok ".env.example has MC_GATEWAY_URL slot"
else
  nope ".env.example missing MC_GATEWAY_URL slot"
fi
if grep -E '^MC_GATEWAY_TOKEN=' "$ENV_FILE" >/dev/null; then
  ok ".env.example has MC_GATEWAY_TOKEN slot"
else
  nope ".env.example missing MC_GATEWAY_TOKEN slot"
fi

echo
echo "=== 6. Settings page dead link fixed (no /dashboard) ==="
SETTINGS="$REPO/src/app/settings/page.tsx"
if grep -E 'href="/dashboard"' "$SETTINGS" >/dev/null; then
  nope "settings page still links to /dashboard"
else
  ok "settings page has no link to /dashboard"
fi

echo
echo "=== 7. Version bumped to 0.3.0 ==="
if grep -E '"version":\s*"0\.3\.0"' "$REPO/package.json" >/dev/null; then
  ok "package.json version is 0.3.0"
else
  nope "package.json version is NOT 0.3.0"
  grep '"version"' "$REPO/package.json" || true
fi

echo
echo "=== 8. typecheck (tsc --noEmit, no PII emitted) ==="
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
TSC_OUT=$(node "$REPO/node_modules/.bin/tsc" --noEmit 2>&1)
TSC_RC=$?
TSC_LINES=$(printf '%s\n' "$TSC_OUT" | wc -l | tr -d ' ')
if [[ $TSC_RC -eq 0 && -z "$TSC_OUT" ]]; then
  ok "tsc --noEmit: clean (0 errors, 0 output)"
else
  nope "tsc --noEmit returned $TSC_RC ($TSC_LINES line(s) of output)"
  echo "----- tsc output (head) -----"
  printf '%s\n' "$TSC_OUT" | head -30
  echo "-----------------------------"
fi

echo
echo "=== 9. DB state ==="
DB="$REPO/data/mission-control.db"
if [[ -f "$DB" ]]; then
  ok "data/mission-control.db present ($(stat -f '%z' "$DB") bytes)"
else
  nope "data/mission-control.db missing"
fi
shopt -s nullglob
BAKS=("$REPO"/data/mission-control.db.bak.*)
shopt -u nullglob
if (( ${#BAKS[@]} >= 1 )) && [[ -f "${BAKS[0]}" ]]; then
  ok "DB backup present: $(basename "${BAKS[0]}")"
else
  nope "DB backup not found (data/mission-control.db.bak.*)"
fi

echo
echo "=== 10. (intentionally skipped) Live dev server + gateway smoke test ==="
info "would require binding two localhost ports (3007, 8787) and SSE handshake"
info "review-only scope per skill rule: do not boot long-running processes without consent"

echo
echo "=== Summary ==="
echo "  PASS=$PASS  FAIL=$FAIL  NOTE=$NOTE"
if [[ $FAIL -eq 0 ]]; then
  echo "  AD-HOC VERIFICATION: green"
  exit 0
else
  echo "  AD-HOC VERIFICATION: RED ($FAIL failing check(s))"
  exit 1
fi
