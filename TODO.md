# Product TODO

## User Inventory and Access Visibility

- [ ] Replace the standalone **Permissions** module with a user-centered
  **User Inventory** (working UI label: **Users & Access**).
- [ ] Let administrators configure supported services such as Jira, Jenkins,
  and Bitbucket as identity and access sources.
- [ ] Add collectors that retrieve each service's users, service accounts,
  groups, roles, access state, and last activity when the source exposes it.
- [ ] Preserve the original source records while normalizing them into a common
  user-and-access model.
- [ ] Correlate accounts belonging to the same person across services, while
  flagging ambiguous, unmatched, or conflicting identities for manual review.
- [ ] Provide both views of the collected data:
  - A user view showing every service and permission available to that user.
  - A service view showing every user and permission present in that service.
- [ ] Highlight access differences and risks, including users present in only
  1 service, stale or disabled accounts, orphaned service accounts,
  administrator access, and permission drift between services.
- [ ] Add an audited review workflow for acknowledging, assigning, and resolving
  access findings. Do not automatically change external-system permissions.
- [ ] Keep real usernames, emails, hostnames, URLs, and access exports outside
  the public repository; use fake data for development and tests.

### Initial acceptance scenario

Given configured Jira, Jenkins, and Bitbucket services, Spaghetti Desk can
collect their differing user lists and answer:

- Who exists in each service?
- Which accounts likely belong to the same person?
- What access does each person or service account have in every service?
- Which accounts or permissions require review?
