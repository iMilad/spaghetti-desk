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
