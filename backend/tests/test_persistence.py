from __future__ import annotations

from datetime import UTC, date, datetime

from sqlalchemy import create_engine, inspect, select
from sqlalchemy.orm import Session

from app.models import Pipeline
from app.persistence.base import Base
from app.persistence.models import LicenseRecord, ServiceRecord, VMRecord
from app.persistence.repositories import PipelineRepository


def test_inventory_metadata_creates_tables_and_indexes() -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)

    inspector = inspect(engine)
    assert set(inspector.get_table_names()) == {
        "agent_sessions",
        "collector_runs",
        "licenses",
        "pipelines",
        "permissions",
        "services",
        "vms",
    }

    service_indexes = {index["name"] for index in inspector.get_indexes("services")}
    vm_indexes = {index["name"] for index in inspector.get_indexes("vms")}
    license_indexes = {index["name"] for index in inspector.get_indexes("licenses")}
    pipeline_indexes = {index["name"] for index in inspector.get_indexes("pipelines")}
    collector_run_indexes = {
        index["name"] for index in inspector.get_indexes("collector_runs")
    }

    assert "ix_services_status_owner_team" in service_indexes
    assert "ix_services_host_id" in service_indexes
    assert "ix_vms_team_review_status" in vm_indexes
    assert "ix_vms_last_seen_at" in vm_indexes
    assert "ix_licenses_owner_team_renewal_status" in license_indexes
    assert "ix_licenses_expires_on" in license_indexes
    assert "ix_pipelines_provider_status" in pipeline_indexes
    assert "ix_pipelines_last_run_at" in pipeline_indexes
    assert "ix_collector_runs_collector_started_at" in collector_run_indexes


def test_service_and_vm_records_round_trip() -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)

    with Session(engine) as session:
        session.add(
            LicenseRecord(
                id="license-demo",
                name="Demo License",
                vendor="Example Vendor",
                category="product-license",
                owner_team="Platform Operations",
                expires_on=date(2027, 1, 15),
                renewal_status="active",
                risk="No demo risk.",
            )
        )
        session.add(
            ServiceRecord(
                id="service-demo",
                name="Demo Service",
                service_type="api",
                status="healthy",
                owner_team="Platform Operations",
                lifecycle="production",
                version="demo-1.0",
                example_url="https://service.example.invalid",
                host_id="vm-demo",
                license_id="license-demo",
                backup_status="verified",
                monitoring_status="green",
                last_maintenance=date(2026, 6, 15),
                documentation_url="https://docs.example.invalid/service",
                known_risks=["demo-only"],
            )
        )
        session.add(
            VMRecord(
                id="vm-demo",
                name="demo-vm",
                ip_address="198.51.100.10",
                owner="demo-owner",
                team="Platform Operations",
                purpose="Demo persistence test.",
                environment="development",
                tags=["demo"],
                cpu=2,
                ram_gb=4,
                disk_gb=80,
                os="Ubuntu 22.04 LTS",
                created_on=date(2026, 1, 1),
                last_seen_at=datetime(2026, 7, 1, 8, 0, tzinfo=UTC),
                patch_status="current",
                ownership_confidence="known",
                review_status="active",
            )
        )
        session.commit()

        service = session.scalar(select(ServiceRecord).where(ServiceRecord.id == "service-demo"))
        vm = session.scalar(select(VMRecord).where(VMRecord.id == "vm-demo"))

    assert service is not None
    assert service.known_risks == ["demo-only"]
    assert vm is not None
    assert vm.tags == ["demo"]


def test_pipeline_repository_upserts_collected_pipeline_records() -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)

    with Session(engine) as session:
        repository = PipelineRepository(session)
        created = repository.upsert_pipeline(
            Pipeline(
                id="jenkins:demo-pipeline",
                provider="jenkins",
                source_id="demo-pipeline",
                name="Demo Pipeline",
                source_url="https://jenkins.example.invalid/job/demo-pipeline",
                owner_team="Platform Operations",
                status="healthy",
                last_run_status="success",
                metadata={"jenkins_color": "blue"},
            )
        )
        unchanged = repository.upsert_pipeline(
            Pipeline(
                id="jenkins:demo-pipeline",
                provider="jenkins",
                source_id="demo-pipeline",
                name="Demo Pipeline",
                source_url="https://jenkins.example.invalid/job/demo-pipeline",
                owner_team="Platform Operations",
                status="healthy",
                last_run_status="success",
                metadata={"jenkins_color": "blue"},
            )
        )
        updated = repository.upsert_pipeline(
            Pipeline(
                id="jenkins:demo-pipeline",
                provider="jenkins",
                source_id="demo-pipeline",
                name="Demo Pipeline",
                source_url="https://jenkins.example.invalid/job/demo-pipeline",
                owner_team="Platform Operations",
                status="failed",
                last_run_status="failure",
                metadata={"jenkins_color": "red"},
            )
        )
        session.commit()

        page = repository.list_pipelines(limit=10, offset=0, provider="jenkins")

    assert created is True
    assert unchanged is False
    assert updated is True
    assert page.total == 1
    assert page.items[0].status == "failed"
