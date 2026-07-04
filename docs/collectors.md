# Collector Framework

Collectors sync external systems into local inventory storage. They should run
in the background and write to the local database; normal UI/API page rendering
must read local state instead of proxying external systems live.

The first framework layer provides:

- `Collector` protocol with `name`, `interval_seconds`, and `collect()`
- `CollectorContext` with run metadata
- `CollectorResult` with status, record counts, timing, and metadata
- `CollectorRegistry` for duplicate-safe registration and run-once execution
- APScheduler wiring for interval jobs

No real external collector is enabled by default. Future collectors should keep
credentials in environment variables or private deployment config and must not
commit real hostnames, URLs, usernames, or tokens.
