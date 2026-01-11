# e164.it — E.164 number parsing and batch CSV toolkit

**e164.it** is a practical toolkit to normalize “messy” phone number inputs into consistent, machine-friendly outputs (E.164 and related formats), with both an interactive UI and a minimal HTTP API.

The focus is operational: predictable output fields, batch-friendly processing, and privacy-oriented options (masking and optional HMAC-based hashing).

Under the hood, parsing/formatting is powered by **libphonenumber-js**.

---

## What it includes

### Web UI
The site exposes a few focused pages:

- **Single** (`/`) — parse one number and get quick-copy outputs (E.164 / `tel:` / JSON).
- **Batch CSV** (`/batch/`) — upload a CSV, process a column, and download a result CSV with appended derived fields.
- **Docs** (`/docs/`) — API + Batch reference, operational notes, and examples.
- **API** (`/api/`) — endpoints, parameters, and examples.
- **API Docs** (`/api-docs/`) — interactive documentation (Swagger UI) backed by OpenAPI.
- **Admin** (`/admin/`) — API key management (admin token required).
- **Privacy** (`/privacy/`) — privacy & security notes.
- **Samples** (`/samples/`) — sample CSV inputs (e.g. `sample.csv`, `sample_no_header.csv`).

### HTTP API (v1)
Core endpoints:

- `POST /v1/parse` — parse and normalize a single number (JSON).
- `POST /v1/batch/parse` — parse a CSV upload (multipart/form-data → CSV download).
- `GET /v1/openapi.json` — OpenAPI specification used by `/api-docs/`.
- `GET /v1/health` — health probe.

Convenience “help” endpoints (public):

- `GET /v1/parse` — returns endpoint help (JSON).
- `GET /v1/batch/parse` — returns endpoint help (JSON).

---

## Authentication and rate limiting

### API key (client requests)
For protected endpoints, send an API key:

- Header: `x-api-key: e164_…`

For quick debugging, the middleware also accepts:

- Query string: `?api_key=e164_…`

### Admin token (key management)
Admin endpoints require an admin token. Supported headers:

- `Authorization: Bearer <ADMIN_TOKEN>` (preferred)
- `x-admin-token: <ADMIN_TOKEN>`

### Rate limiting
Rate limiting is enforced per API key (per minute) via KV. When enabled, responses include:

- `x-ratelimit-limit`
- `x-ratelimit-remaining`
- `x-ratelimit-reset` (unix timestamp, seconds)

Limits are stored per key (`rpm_parse` vs `rpm_batch`).

---

## `POST /v1/parse`

Parses and normalizes a single phone number. Inputs like `00…` are normalized to `+…`.

### Request (JSON)
```json
{
  "input": "0039 333 123 4567",
  "default_region": "IT",
  "options": {
    "format": ["e164", "international", "national", "rfc3966"],
    "classify": true,
    "mask": { "mode": "last4" },
    "hash": { "enabled": true }
  }
}
```

- `default_region` is used only when the input does **not** include a country code.
- `options.format` selects which formatted fields are included.
- `options.mask.mode`: `none`, `last2`, `last4`.
- `options.hash.enabled`: when enabled and `HASH_SECRET` is configured, returns a stable `h_<hex>`.

### Response (success)
```json
{
  "ok": true,
  "echo": { "input": "0039 333 123 4567", "default_region": "IT" },
  "result": {
    "e164": "+393331234567",
    "country": "IT",
    "calling_code": "39",
    "possible": true,
    "valid": true,
    "type": "MOBILE",
    "international": "+39 333 123 4567",
    "national": "333 123 4567",
    "rfc3966": "tel:+39-333-123-4567",
    "masked": "+*********4567",
    "hash": "h_…"
  }
}
```

### Response (error envelope)
```json
{
  "ok": false,
  "error": { "code": "parse_failed", "message": "Could not parse phone number." },
  "echo": { "input": "…", "default_region": "IT" }
}
```

---

## `POST /v1/batch/parse`

Uploads a CSV, parses the phone column, and returns a CSV with appended output columns.

### Request (multipart/form-data)
Fields:

- `file` — CSV file (**required**)
- `phone_column` — header name **or** 1-based column index (**required**)
- `default_region` — optional (e.g. `IT`, `US`, `GB`)
- `has_header` — `true` / `false` (optional; default: auto-detect)
- `delimiter` — `auto` (default), or one of: `comma`, `semicolon`, `tab`, `pipe`
- `mask_mode` — `none`, `last2`, `last4` (default: `none`)
- `hash_enabled` — `true` / `false` (default: `false`)

### Output columns
The response CSV contains the original row plus these appended columns:

- `e164`
- `valid`
- `possible`
- `country`
- `type`
- `masked`
- `hash` (only if `hash_enabled=true`)
- `error` (empty on success)

Per-row error codes currently used:

- `empty_phone`
- `parse_failed`
- `hash_secret_missing`

### Batch stats headers
The response includes:

- `x-batch-rows-total`
- `x-batch-rows-ok`
- `x-batch-rows-failed`

### Example (curl)
```bash
curl -s \
  -H "x-api-key: e164_..." \
  -F "file=@public/samples/sample.csv" \
  -F "phone_column=phone" \
  -F "default_region=IT" \
  -F "delimiter=auto" \
  -F "has_header=true" \
  -F "mask_mode=last4" \
  -F "hash_enabled=true" \
  https://e164.it/v1/batch/parse \
  -o result.csv
```

---

## Admin API (API key management)

### `GET /v1/admin/keys`
List keys (supports pagination): `?limit=<n>&offset=<n>`.

### `POST /v1/admin/keys`
Create a key. The raw `api_key` is returned **only once**.

### `GET /v1/admin/keys/:id`
Read a single key.

### `PATCH /v1/admin/keys/:id`
Update: `label`, `enabled`, `rpm_parse`, `rpm_batch`, `max_batch_rows`, `max_batch_bytes`.

### `DELETE /v1/admin/keys/:id`
Soft-disable a key (`enabled = 0`).

> Note: the OpenAPI document currently focuses on the core endpoints; admin detail endpoints may not be fully described there.

---

## Privacy features

Phone numbers are personal data. e164.it supports two exposure-reduction mechanisms:

- **Masking** (`last2` / `last4`): returns `masked` while keeping only the last digits.
- **Hashing** (HMAC-SHA256): returns a stable `hash` (`h_<hex>`) useful for correlation without storing the raw number.

Hashing requires server-side configuration of `HASH_SECRET`.

---

## Repository map

- `public/` — UI pages, docs, samples
- `functions/v1/` — API endpoints and middleware
- `functions/_lib/` — API key hashing, crypto helpers, rate limiting
- `migrations/` — D1 migrations
- `scripts/` — maintenance scripts (layout/nav updates)

---

## License
 
ISC — see [`LICENSE`](LICENSE).
