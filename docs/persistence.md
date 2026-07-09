# Inventory Persistence

Spaghetti Desk now has a SQLAlchemy persistence foundation for inventory state.
The first DB-backed domain repositories cover Services, VMs, Pipelines, and
collector run history:

- Services can be paged and filtered by `status` and `owner_team`.
- VMs can be paged and filtered by `team`, `review_status`, and
  `ownership_confidence`.
- Pipelines can be paged and filtered by `provider`, `status`, and
  `owner_team`.
- Collector runs can be paged by collector name and status for UI observability.
- Repository methods return API domain models, keeping storage details behind
  the persistence boundary.

The default service, VM, license, permission, and agent-session endpoints still
serve public demo JSON until broader seed/import paths are connected. DB-backed
pipeline and collector-run endpoints are the path used by collector plugins and
future local inventory modules.
