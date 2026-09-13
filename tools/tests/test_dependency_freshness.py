"""契約測試：依賴新鮮度檢查的地板精度與兩條紅燈出口。"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import check_dependency_freshness as checker


def test_comparison_uses_the_precision_the_declaration_states() -> None:
    assert not checker.is_newer_version("7.4.0", "7")
    assert checker.is_newer_version("8.0.0", "7")
    assert checker.is_newer_version("7.4.0", "7.3")
    assert not checker.is_newer_version("7.3.2", "7.3")


def test_prerelease_suffix_does_not_count_as_newer() -> None:
    assert not checker.is_newer_version("7.0.0rc1", "7.0.0")


def test_hold_marker_is_read_off_the_declaring_line() -> None:
    packages = checker.parse_requirements(
        "pytest>=8.3  # freshness-hold: pytest 9 requires Python 3.10, CI still tests 3.9\n"
        "ruff>=0.16\n",
        "requirements-dev.txt",
    )
    holds = {package["name"]: package["hold"] for package in packages}
    assert holds["ruff"] == ""
    assert holds["pytest"].startswith("pytest 9 requires Python 3.10")


def test_a_held_floor_is_reported_but_does_not_ask_for_work(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(checker, "fetch_pypi_version", lambda name: "9.1.0")
    packages = checker.parse_requirements(
        "pytest>=8.3  # freshness-hold: CI still tests 3.9\n", "requirements-dev.txt"
    )
    rows = checker.collect_status(packages, deferrals={})
    assert rows[0]["outdated"] is True
    assert checker.needs_review(rows[0]) is False
    assert "HELD: CI still tests 3.9" in checker.render_markdown(rows)


def test_a_live_deferral_covers_the_row_and_says_what_it_was_reviewed_against(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(checker, "fetch_pypi_version", lambda name: "9.1.0")
    packages = checker.parse_requirements("pytest>=8.3\n", "requirements-dev.txt")
    rows = checker.collect_status(
        packages,
        deferrals={"pytest": ("9.1", "reviewed 2026-09; wait for the 9.x line to settle")},
    )
    assert checker.needs_review(rows[0]) is False
