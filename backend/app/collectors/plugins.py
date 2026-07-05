from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from importlib import metadata
from typing import Protocol

from app.collectors.base import Collector
from app.collectors.registry import CollectorRegistry

ENTRY_POINT_GROUP = "spaghetti_desk.collectors"


@dataclass(frozen=True)
class CollectorPluginConfig:
    name: str
    enabled: bool
    interval_seconds: int
    settings: Mapping[str, object]


@dataclass(frozen=True)
class CollectorPluginStatus:
    name: str
    installed: bool
    enabled: bool
    interval_seconds: int | None = None


class CollectorPlugin(Protocol):
    name: str

    def build_collectors(self, config: CollectorPluginConfig) -> Iterable[Collector]:
        """Return collectors exposed by this plugin."""


def discover_collector_plugins() -> list[CollectorPlugin]:
    plugins: list[CollectorPlugin] = []
    for entry_point in metadata.entry_points(group=ENTRY_POINT_GROUP):
        loaded = entry_point.load()
        plugin = loaded() if isinstance(loaded, type) else loaded
        plugins.append(plugin)
    return sorted(plugins, key=lambda plugin: plugin.name)


def build_collector_registry(
    raw_config: Mapping[str, object],
    plugins: Iterable[CollectorPlugin] | None = None,
) -> CollectorRegistry:
    registry = CollectorRegistry()
    settings = _collector_settings(raw_config)
    if not _as_bool(settings.get("enabled"), default=False):
        return registry

    plugin_settings = _plugin_settings(settings)
    default_interval = _as_positive_int(settings.get("default_interval_seconds"), default=300)
    for plugin in plugins if plugins is not None else discover_collector_plugins():
        config = _plugin_config(plugin.name, plugin_settings, default_interval)
        if not config.enabled:
            continue
        for collector in plugin.build_collectors(config):
            registry.register(collector)

    return registry


def list_collector_plugin_status(
    raw_config: Mapping[str, object],
    plugins: Iterable[CollectorPlugin] | None = None,
) -> list[CollectorPluginStatus]:
    settings = _collector_settings(raw_config)
    global_enabled = _as_bool(settings.get("enabled"), default=False)
    plugin_settings = _plugin_settings(settings)
    default_interval = _as_positive_int(settings.get("default_interval_seconds"), default=300)
    if plugins is not None:
        discovered = {plugin.name for plugin in plugins}
    else:
        discovered = {plugin.name for plugin in discover_collector_plugins()}
    names = sorted(discovered | set(plugin_settings.keys()))

    return [
        _plugin_status(
            name=name,
            installed=name in discovered,
            global_enabled=global_enabled,
            plugin_settings=plugin_settings,
            default_interval=default_interval,
        )
        for name in names
    ]


def _collector_settings(raw_config: Mapping[str, object]) -> Mapping[str, object]:
    collectors = raw_config.get("collectors")
    return collectors if isinstance(collectors, Mapping) else {}


def _plugin_settings(settings: Mapping[str, object]) -> dict[str, Mapping[str, object]]:
    plugins = settings.get("plugins")
    if not isinstance(plugins, Mapping):
        return {}

    return {
        str(name): value
        for name, value in plugins.items()
        if isinstance(value, Mapping)
    }


def _plugin_config(
    name: str,
    plugin_settings: Mapping[str, Mapping[str, object]],
    default_interval: int,
) -> CollectorPluginConfig:
    settings = dict(plugin_settings.get(name, {}))
    enabled = _as_bool(settings.pop("enabled", False), default=False)
    interval_seconds = _as_positive_int(
        settings.pop("interval_seconds", default_interval),
        default=default_interval,
    )
    return CollectorPluginConfig(
        name=name,
        enabled=enabled,
        interval_seconds=interval_seconds,
        settings=settings,
    )


def _plugin_status(
    *,
    name: str,
    installed: bool,
    global_enabled: bool,
    plugin_settings: Mapping[str, Mapping[str, object]],
    default_interval: int,
) -> CollectorPluginStatus:
    config = _plugin_config(name, plugin_settings, default_interval)
    enabled = global_enabled and installed and config.enabled
    return CollectorPluginStatus(
        name=name,
        installed=installed,
        enabled=enabled,
        interval_seconds=config.interval_seconds if enabled else None,
    )


def _as_bool(value: object, *, default: bool) -> bool:
    return value if isinstance(value, bool) else default


def _as_positive_int(value: object, *, default: int) -> int:
    return value if isinstance(value, int) and value > 0 else default
