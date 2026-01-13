## Summary

Describe what this PR changes and why.

- What problem does it solve?
- What behavior changed (if any)?
- Any compatibility concerns?

---

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor / cleanup
- [ ] Documentation update
- [ ] Security / privacy improvement
- [ ] CI / tooling

---

## Changes (bullet list)

-
-
-

---

## Screenshots / UI evidence (if applicable)

Before (optional):

After:

---

## How to test

Provide steps to verify the change.

### UI
1. Go to …
2. Click …
3. Expected …

### API
```bash
curl -sS -X POST "https://<host>/v1/parse" \
  -H "content-type: application/json" \
  -H "x-api-key: <redacted-if-needed>" \
  -d '{"input":"+390612345678","default_region":"IT","options":{"format":["e164"],"classify":true}}'
```

**Do not paste real API keys/admin tokens or private phone numbers.**

---

## Docs / OpenAPI

- [ ] Docs updated (if behavior changed)
- [ ] OpenAPI updated (if endpoints/fields changed)
- [ ] UI tooltips/copy updated (if relevant)

Files touched (if applicable):
- `public/docs/...`
- `public/api/...`
- `functions/v1/openapi.json.js`

---

## Security & privacy

