# Security Policy

## Reporting a Vulnerability
Please **do not open public issues** for security vulnerabilities.

Preferred: use GitHub's **Private Vulnerability Reporting** ("Report a vulnerability") on this repository.

Alternative contact (optional): antonio@prado.it

When reporting, please include:
- A clear description of the issue and potential impact
- Steps to reproduce (as minimal as possible)
- A proof of concept (PoC), if available
- The affected endpoint(s) and commit/version (if known)

## Supported Versions
Only the latest code on the `main` branch and the production deployment are supported for security fixes.

## Scope
In scope:
- `/v1/*` API endpoints
- authentication / API keys
- rate limiting
- input validation and normalization

Out of scope:
- volumetric DoS
- social engineering
- issues that cannot be reproduced

## Safe Harbor
We will not pursue legal action against researchers acting in good faith, provided they:
- avoid privacy violations and data exfiltration
- do not degrade service availability
- report issues responsibly and privately
