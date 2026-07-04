from __future__ import annotations

from datetime import UTC, date, datetime

from sqlalchemy import create_engine, inspect, select
from sqlalchemy.orm import Session

from app.persistence.base import Base
from app.persistence.models import LicenseRecord, ServiceRecord, VMRecord


def test_inventory_metadata_creates_tables_and_indexes() -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)

    inspector = inspect(engine)
    assert set(inspector.get_table_names()) == {
        "agent_sessions",
        "licenses",
        "permissions",
        "services",
        "vms",
    }

    service_indexes = {index["name"] for index in inspector.get_indexes("services")}
    vm_indexes = {index["name"] for index in inspector.get_indexes("vms")}
    license_indexes = {index["name"] for index in inspector.get_indexes("licenses")}

    assert "ix_services_status_owner_team" in service_indexes
    assert "ix_services_host_id" in service_indexes
    assert "ix_vms_team_review_status" in vm_indexes
    assert "ix_vms_last_seen_at" in vm_indexes
    assert "ix_licenses_owner_team_renewal_status" in license_indexes
    assert "ix_licenses_expires_on" in license_indexes


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
