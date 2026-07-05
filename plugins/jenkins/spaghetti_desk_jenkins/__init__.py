from __future__ import annotations

import os
import re
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from fnmatch import fnmatchcase
from typing import Any

import httpx

from app.collectors import CollectorContext, CollectorPluginConfig, CollectorResult
from app.models import Pipeline
from app.persistence.repositories import PipelineRepository

JENKINS_TREE = "jobs[name,url,color,lastBuild[number,result,timestamp,duration,url]]"


@dataclass(frozen=True)
class JenkinsSettings:
    base_url: str
    username_env: str | None
    token_env: str | None
    job_include_patterns: tuple[str, ...]
    default_owner_team: str
    timeout_seconds: float
    verify_tls: bool

    @classmethod
    def from_mapping(cls, settings: Mapping[str, object]) -> JenkinsSettings:
        return cls(
            base_url=_string_setting(settings, "base_url").rstrip("/"),
            username_env=_optional_string_setting(settings, "username_env"),
            token_env=_optional_string_setting(settings, "token_env"),
            job_include_patterns=tuple(_string_list_setting(settings, "job_include_patterns")),
            default_owner_team=_string_setting(settings, "default_owner_team", "Unassigned"),
            timeout_seconds=_positive_float_setting(settings, "timeout_seconds", 10.0),
            verify_tls=_bool_setting(settings, "verify_tls", True),
        )


@dataclass
class JenkinsCollector:
    settings: JenkinsSettings
    interval_seconds: int
    name: str = "jenkins"

    def collect(self, context: CollectorContext) -> CollectorResult:
        skipped_message = self._skip_reason()
        if skipped_message is not None:
            return CollectorResult(
                collector_name=self.name,
                status="skipped",
                message=skipped_message,
                metadata={"provider": "jenkins"},
            )

        jobs = self._fetch_jobs()
        pipelines = [self._pipeline_from_job(job) for job in jobs if self._include_job(job)]
        records_changed = 0

        if context.session is not None and not context.dry_run:
            repository = PipelineRepository(context.session)
            records_changed = sum(
                1 for pipeline in pipelines if repository.upsert_pipeline(pipeline)
            )

        return CollectorResult(
            collector_name=self.name,
            status="success",
            records_seen=len(pipelines),
            records_changed=records_changed,
            metadata={"provider": "jenkins"},
        )

    def _skip_reason(self) -> str | None:
        if not self.settings.base_url or self.settings.base_url.endswith(".example.invalid"):
            return "Jenkins base_url is not configured."

        for env_name in [self.settings.username_env, self.settings.token_env]:
            if env_name and os.getenv(env_name) is None:
                return f"Jenkins credential env var {env_name} is not set."

        return None

    def _fetch_jobs(self) -> list[Mapping[str, Any]]:
        auth = self._auth()
        with httpx.Client(
            auth=auth,
            timeout=self.settings.timeout_seconds,
            verify=self.settings.verify_tls,
        ) as client:
            response = client.get(
                f"{self.settings.base_url}/api/json",
                params={"tree": JENKINS_TREE},
            )
            response.raise_for_status()

        payload = response.json()
        jobs = payload.get("jobs", [])
        return [job for job in jobs if isinstance(job, Mapping)]

    def _auth(self) -> tuple[str, str] | None:
        if not self.settings.username_env or not self.settings.token_env:
            return None

        username = os.getenv(self.settings.username_env)
        token = os.getenv(self.settings.token_env)
        return (username, token) if username is not None and token is not None else None

    def _include_job(self, job: Mapping[str, Any]) -> bool:
        if not self.settings.job_include_patterns:
            return True

        name = str(job.get("name", ""))
        return any(fnmatchcase(name, pattern) for pattern in self.settings.job_include_patterns)

    def _pipeline_from_job(self, job: Mapping[str, Any]) -> Pipeline:
        name = str(job.get("name", "unnamed-job"))
        color = str(job.get("color", "unknown"))
        last_build = job.get("lastBuild")
        last_build_data = last_build if isinstance(last_build, Mapping) else {}

        return Pipeline(
            id=f"jenkins:{_slug(name)}",
            provider="jenkins",
            source_id=name,
            name=name,
            source_url=str(job.get("url", "")),
            owner_team=self.settings.default_owner_team,
            status=_status_from_color(color),
            last_run_status=_last_run_status(last_build_data),
            last_run_at=_timestamp_from_jenkins(last_build_data.get("timestamp")),
            last_duration_ms=_duration_ms(last_build_data.get("duration")),
            metadata={"jenkins_color": color},
        )


@dataclass(frozen=True)
class JenkinsCollectorPlugin:
    name: str = "jenkins"

    def build_collectors(self, config: CollectorPluginConfig) -> Iterable[JenkinsCollector]:
        return [
            JenkinsCollector(
                settings=JenkinsSettings.from_mapping(config.settings),
                interval_seconds=config.interval_seconds,
            )
        ]


plugin = JenkinsCollectorPlugin()


def _status_from_color(color: str) -> str:
    normalized = color.removesuffix("_anime")
    return {
        "blue": "healthy",
        "green": "healthy",
        "yellow": "unstable",
        "red": "failed",
        "disabled": "disabled",
        "aborted": "aborted",
        "notbuilt": "never_built",
        "grey": "unknown",
        "gray": "unknown",
    }.get(normalized, "unknown")


def _last_run_status(last_build: Mapping[str, Any]) -> str | None:
    result = last_build.get("result")
    return str(result).casefold() if result is not None else None


def _timestamp_from_jenkins(value: object) -> datetime | None:
    if not isinstance(value, int | float) or value <= 0:
        return None
    return datetime.fromtimestamp(value / 1000, tz=UTC)


def _duration_ms(value: object) -> int | None:
    if not isinstance(value, int) or value < 0:
        return None
    return value


def _slug(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9_.:-]+", "-", value).strip("-").casefold()
    return slug[:100] or "unnamed-job"


def _string_setting(
    settings: Mapping[str, object],
    key: str,
    default: str = "",
) -> str:
    value = settings.get(key, default)
    return value if isinstance(value, str) else default


def _optional_string_setting(settings: Mapping[str, object], key: str) -> str | None:
    value = settings.get(key)
    return value if isinstance(value, str) and value else None


def _string_list_setting(settings: Mapping[str, object], key: str) -> list[str]:
    value = settings.get(key, [])
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, str)]


def _positive_float_setting(
    settings: Mapping[str, object],
    key: str,
    default: float,
) -> float:
    value = settings.get(key, default)
    return float(value) if isinstance(value, int | float) and value > 0 else default


def _bool_setting(settings: Mapping[str, object], key: str, default: bool) -> bool:
    value = settings.get(key, default)
    return value if isinstance(value, bool) else default
