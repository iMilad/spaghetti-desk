from __future__ import annotations

import importlib.util
import py_compile
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
SCAFFOLD_SCRIPT = PROJECT_ROOT / "scripts" / "scaffold_collector.py"


def _load_scaffold_module():
    spec = importlib.util.spec_from_file_location("scaffold_collector", SCAFFOLD_SCRIPT)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_scaffold_collector_creates_public_safe_package(tmp_path) -> None:
    scaffold_collector = _load_scaffold_module()
    output_dir = tmp_path / "plugins"

    result = scaffold_collector.main(
        [
            "example-ci",
            "--output-dir",
            str(output_dir),
        ]
    )

    generated = output_dir / "example-ci"
    package_init = generated / "spaghetti_desk_example_ci" / "__init__.py"
    readme = (generated / "README.md").read_text(encoding="utf-8")
    pyproject = (generated / "pyproject.toml").read_text(encoding="utf-8")

    assert result == 0
    assert package_init.exists()
    assert (generated / "tests" / "test_example_ci_collector.py").exists()
    assert 'example-ci = "spaghetti_desk_example_ci:plugin"' in pyproject
    assert "https://example-ci.example.invalid" in readme
    assert "config/local.yaml" not in readme
    assert not (generated / ".env").exists()

    py_compile.compile(str(package_init), doraise=True)


def test_scaffold_collector_rejects_unsafe_names(tmp_path) -> None:
    scaffold_collector = _load_scaffold_module()

    result = scaffold_collector.main(
        [
            "Example CI",
            "--output-dir",
            str(tmp_path),
        ]
    )

    assert result == 2
