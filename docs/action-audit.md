# Action and Audit Foundation

Spaghetti Desk records action requests before it runs any mutating operation.
The first implementation is a local read model and demo UI; it does not execute
real scripts or call external systems.

Each action log records:

- who requested the action
- what action type was requested
- target system, target type, and target ID
- approval status and approver, when applicable
- execution status, timing, and duration
- risk level
- sanitized parameters
- before and after state snapshots
- result summary and evidence links

Private data does not belong in action logs committed to this repository. Public
examples must use fake operators, `.example.invalid` links, and sanitized
parameters only.

## Runtime Contract

Future mutating operations should follow this order:

1. Validate the request.
2. Write an action log record with sanitized input.
3. Require approval for risky operations.
4. Run the controlled action only after approval.
5. Store result status, timing, sanitized before and after state, and evidence.

The UI reads `/api/v1/action-logs` from local state. It must not trigger
external changes during page rendering.

## Create an Action Request

`POST /api/v1/action-requests` records a sanitized action request and returns
the created action log. It does not run any external command or call any
external system.

Example payload:

```json
{
  "action_type": "vm.review.request",
  "target_system": "spaghetti-desk",
  "target_type": "vm",
  "target_id": "vm-demo-build-01",
  "requested_by": "demo-operator",
  "summary": "Request owner review for stale demo build worker.",
  "risk_level": "medium",
  "parameters": {
    "review_reason": "stale_owner",
    "token": "demo-secret"
  }
}
```

Medium and high risk requests are recorded with `approval_status: pending` and
`execution_status: blocked`. Low-risk requests are recorded as
`approval_status: not_required` and `execution_status: not_started`. Sensitive
parameter values are redacted before persistence.

## Approve or Reject an Action Request

Pending requests can be decided through local API state transitions:

- `POST /api/v1/action-requests/{action_id}/approve`
- `POST /api/v1/action-requests/{action_id}/reject`

Example payload:

```json
{
  "reason": "Demo approval only."
}
```

Approving a pending request records `approval_status: approved`, stores the
current operator identity and decision time, and moves `execution_status` back
to `not_started`.
Rejecting a pending request records `approval_status: rejected` and
`execution_status: skipped`.

Neither endpoint runs a script, queues a runner job, or calls an external
system. Requests that are already approved, rejected, or marked
`not_required` return a conflict instead of rewriting the decision history.

## Current Operator Identity

`GET /api/v1/operator` returns the operator identity the backend will use for
approval decisions. The browser does not submit `reviewed_by`; the API resolves
it from local runtime configuration so approval history cannot be spoofed from a
form payload.

Public defaults are intentionally generic:

```yaml
operator:
  id: local-operator
  display_name: Local Operator
  role: admin
```

Private deployments can override these values with ignored config or
environment variables:

- `SPAGHETTI_OPERATOR_ID`
- `SPAGHETTI_OPERATOR_DISPLAY_NAME`
- `SPAGHETTI_OPERATOR_ROLE`

Do not commit real names, usernames, emails, company roles, hostnames, or
internal identity provider values to the public repository.
