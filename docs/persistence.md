# Inventory Persistence

Spaghetti Desk now has a SQLAlchemy persistence foundation for inventory state.
The first DB-backed domain repository covers Services and VMs:

- Services can be paged and filtered by `status` and `owner_team`.
- VMs can be paged and filtered by `team`, `review_status`, and
  `ownership_confidence`.
- Repository methods return API domain models, keeping storage details behind
  the persistence boundary.

The default API still serves public demo JSON until collectors and seed/import
paths are connected. The repository layer is the path that collectors and future
DB-backed endpoints should use.
