# Contributing

Spaghetti Desk is intended to be public and safe to run locally. Contributions
must keep company-specific data out of the repository.

## Development Principles

- Use fake, demo, or example data only.
- Keep page reads fast. Prefer local database reads over live calls to external
  systems.
- Put external-system collection behind collectors or background jobs.
- Put mutating operations behind explicit validation, approval where needed, and
  audit logging.
- Add tests with every meaningful behavior change.
- Keep the first implementation generic enough for different DevOps stacks.

## Local Workflow

1. Create a branch for focused work.
2. Make the smallest useful change.
3. Run backend and frontend checks that match the changed area.
4. Open a pull request once CI is available.

## Data Safety

Do not commit real hostnames, IP addresses, URLs, usernames, emails, tokens,
license data, private documentation, or inventory exports. Use the files under
`examples/demo-data/` as the pattern for safe public data.

