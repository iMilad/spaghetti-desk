# Module Configuration

Spaghetti Desk is designed as a component-wise control center. A deployment can
enable only the modules that exist in that environment and choose which module
widgets appear on the overview.

The public defaults live in `config/config.example.yaml` under `ui`. The backend
serves that public subset from `GET /api/v1/app-config`; the frontend reads it
once at startup and derives navigation and overview widgets from that response.

Local deployments can set `SPAGHETTI_CONFIG_PATH=config/local.yaml` to merge
private overrides on top of the public defaults. `config/local.yaml` is ignored
by git and must not be committed.

The `ui.preferences.overview_widget_storage_key` value scopes browser-local
overview widget overrides. The backend config still owns the default widget
set; local storage only stores a deployment-specific user override.

## Current App Views

The sidebar is an in-app navigation surface. It switches React views and updates
the URL hash for deep-linking, but it does not perform a full page redirect.

Current dedicated views:

- Overview
- Services
- Pipelines
- VMs
- Licenses
- Permissions
- Agents
- Collectors

The shell also contains a Settings screen for local UI preferences and a
disabled Actions & audit navigation item for the future action-runner surface.

## Feature Modules

Each feature module has:

- `enabled`: whether the module is available in this deployment
- `show_in_overview`: whether its default overview widget should appear
- `description`: operator-facing purpose text

If a module is disabled, related navigation items and overview widgets are
removed from the UI. For example, a deployment without VM inventory can disable
the `vms` module and the VMs page/widget disappears.

## Overview Widgets

Overview widgets are selected from the backend-served registry. Users can
customize the visible widgets in the UI; the selection is stored in browser
local storage for now, under the backend-served storage key.

This lets an operator build an overview from pieces such as:

- Runtime model
- Services snapshot
- VM ownership
- License renewals
- Permission risk
- Agent activity

Later, a backend-backed user preference store can replace local storage without
changing the backend-served module registry concept.
