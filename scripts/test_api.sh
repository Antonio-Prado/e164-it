#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://e164.it}"
API_KEY="${API_KEY:-}"
ADMIN_TOKEN="${ADMIN_TOKEN:-}"
SAMPLE_CSV="${SAMPLE_CSV:-public/samples/sample.csv}"

if [[ -z "$API_KEY" ]]; then
  echo "Missing API_KEY env var"
  exit 1
fi

if [[ -z "$ADMIN_TOKEN" ]]; then
  echo "Missing ADMIN_TOKEN env var"
  exit 1
fi

check() {
  local name="$1"
  shift
  local code
  code=$(curl -s -o /tmp/resp.json -w "%{http_code}" "$@")
  if [[ "$code" == "200" || "$code" == "201" || "$code" == "204" ]]; then
    echo "✅ $name (HTTP $code)"
  else
    echo "❌ $name (HTTP $code)"
    cat /tmp/resp.json
    return 1
  fi
}

check "Health" "$BASE_URL/v1/health"
check "Parse help" "$BASE_URL/v1/parse"

check "Parse POST" \
  -H "content-type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{"input":"0039 333 123 4567","default_region":"IT","options":{"format":["e164","international","national","rfc3966"],"classify":true,"mask":{"mode":"last4"},"hash":{"enabled":true}}}' \
  "$BASE_URL/v1/parse"

check "Batch help" "$BASE_URL/v1/batch/parse"

check "Batch POST" \
  -H "x-api-key: $API_KEY" \
  -F "file=@${SAMPLE_CSV}" \
  -F "phone_column=phone" \
  -F "default_region=IT" \
  -F "delimiter=auto" \
  -F "has_header=true" \
  -F "mask_mode=last4" \
  -F "hash_enabled=true" \
  "$BASE_URL/v1/batch/parse"

check "OpenAPI" "$BASE_URL/v1/openapi.json"

check "Admin list" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$BASE_URL/v1/admin/keys"

check "Admin create" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "content-type: application/json" \
  -d '{"label":"test-key","rpm_parse":60,"rpm_batch":10,"max_batch_rows":5000,"max_batch_bytes":1048576}' \
  "$BASE_URL/v1/admin/keys"

echo "✅ All checks completed"
