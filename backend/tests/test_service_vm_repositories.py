from __future__ import annotations

from datetime import UTC, date, datetime

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.persistence.base import Base
from app.persistence.models import ServiceRecord, VMRecord
from app.persistence.repositories import ServiceRepository, VMRepository


def test_service_repository_filters_by_status_and_owner_team() -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)

    with Session(engine) as session:
        session.add_all(
            [
                _service_record(
                    id="service-a",
                    name="A Service",
                    status="healthy",
                    owner_team="Platform",
                ),
                _service_record(
                    id="service-b",
                    name="B Service",
                    status="degraded",
                    owner_team="Platform",
                ),
                _service_record(
                    id="service-c",
                    name="C Service",
                    status="healthy",
                    owner_team="Data",
                ),
            ]
        )
        session.commit()

        page = ServiceRepository(session).list_services(
            limit=10,
            offset=0,
            status="healthy",
            owner_team="Platform",
        )

    assert page.total == 1
    assert [service.id for service in page.items] == ["service-a"]
    assert page.items[0].known_risks == ["demo-risk"]


def test_vm_repository_filters_by_team_review_and_ownership_confidence() -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)

    with Session(engine) as session:
        session.add_all(
            [
                _vm_record(
                    id="vm-a",
                    name="a-vm",
                    team="Platform",
                    review_status="active",
                    ownership_confidence="known",
                ),
                _vm_record(
                    id="vm-b",
                    name="b-vm",
                    team="Platform",
                    review_status="stale",
                    ownership_confidence="unknown",
                ),
                _vm_record(
                    id="vm-c",
                    name="c-vm",
                    team="Data",
                    review_status="stale",
                    ownership_confidence="unknown",
                ),
            ]
        )
        session.commit()

        page = VMRepository(session).list_vms(
            limit=10,
            offset=0,
            team="Platform",
            review_status="stale",
            ownership_confidence="unknown",
        )

    assert page.total == 1
    assert [vm.id for vm in page.items] == ["vm-b"]
    assert page.items[0].tags == ["demo"]


def _service_record(
    *,
    id: str,
    name: str,
    status: str,
    owner_team: str,
) -> ServiceRecord:
    return ServiceRecord(
        id=id,
        name=name,
        service_type="api",
        status=status,
        owner_team=owner_team,
        lifecycle="production",
        version="demo-1.0",
        example_url="https://service.example.invalid",
        host_id="vm-demo",
        license_id=None,
        backup_status="verified",
        monitoring_status="green",
        last_maintenance=date(2026, 6, 15),
        documentation_url="https://docs.example.invalid/service",
        known_risks=["demo-risk"],
    )


def _vm_record(
    *,
    id: str,
    name: str,
    team: str,
    review_status: str,
    ownership_confidence: str,
) -> VMRecord:
    return VMRecord(
        id=id,
        name=name,
        ip_address="198.51.100.10",
        owner="demo-owner",
        team=team,
        purpose="Demo repository test.",
        environment="development",
        tags=["demo"],
        cpu=2,
        ram_gb=4,
        disk_gb=80,
        os="Ubuntu 22.04 LTS",
        created_on=date(2026, 1, 1),
        last_seen_at=datetime(2026, 7, 1, 8, 0, tzinfo=UTC),
        patch_status="current",
        ownership_confidence=ownership_confidence,
        review_status=review_status,
    )
