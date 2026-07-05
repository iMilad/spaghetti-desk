from __future__ import annotations

from spaghetti_desk_jenkins import JenkinsCollector, JenkinsSettings
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.collectors import CollectorContext
from app.persistence.base import Base
from app.persistence.repositories import PipelineRepository


def test_jenkins_collector_skips_public_example_config() -> None:
    collector = JenkinsCollector(
        settings=JenkinsSettings.from_mapping(
            {
                "base_url": "https://jenkins.example.invalid",
            }
        ),
        interval_seconds=300,
    )

    result = collector.collect(CollectorContext())

    assert result.status == "skipped"
    assert "base_url" in result.message


def test_jenkins_collector_writes_pipeline_records(monkeypatch) -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    collector = JenkinsCollector(
        settings=JenkinsSettings.from_mapping(
            {
                "base_url": "https://jenkins.test.invalid",
                "job_include_patterns": ["platform-*"],
                "default_owner_team": "Platform Operations",
            }
        ),
        interval_seconds=300,
    )
    monkeypatch.setattr(
        collector,
        "_fetch_jobs",
        lambda: [
            {
                "name": "platform-api",
                "url": "https://jenkins.test.invalid/job/platform-api",
                "color": "blue",
                "lastBuild": {
                    "result": "SUCCESS",
                    "timestamp": 1783209600000,
                    "duration": 12000,
                },
            },
            {
                "name": "sandbox-job",
                "url": "https://jenkins.test.invalid/job/sandbox-job",
                "color": "red",
            },
        ],
    )

    with Session(engine) as session:
        result = collector.collect(
            CollectorContext(dry_run=False, session=session),
        )
        session.commit()
        page = PipelineRepository(session).list_pipelines(limit=10, offset=0)

    assert result.status == "success"
    assert result.records_seen == 1
    assert result.records_changed == 1
    assert page.total == 1
    assert page.items[0].id == "jenkins:platform-api"
    assert page.items[0].status == "healthy"
    assert page.items[0].owner_team == "Platform Operations"
