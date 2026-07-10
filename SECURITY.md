# Security Policy

Spaghetti Desk is designed to handle operational inventory and audit data. Treat
that data as sensitive, even when the application is running locally.

## Reporting Security Issues

Until a public security contact is established, open a private advisory in the
GitHub repository once it exists. Do not disclose vulnerabilities publicly until
they have been triaged.

## Data Handling Rules

- Do not commit real secrets, tokens, certificates, private keys, inventory
  exports, usernames, emails, hostnames, internal URLs, IP addresses, license
  data, or private documentation.
- Use `.env.example`, `config/config.example.yaml`, and `examples/demo-data/`
  for safe public examples.
- Keep local overrides in ignored files such as `.env` and `config/local.yaml`.
- Sanitize action parameters before writing audit records.

## Runtime Security Goals

- External integrations should be opt-in and disabled by default.
- Mutating actions should be audited and require explicit approval where
  appropriate.
- Permission visibility should be a core feature, not an afterthought.
- Secret scanning runs in CI. Run `./scripts/security-check.sh` locally before
  publishing or opening a pull request.
