"""What the upstream checker must not be allowed to do.

Every test here names a way the check could go quiet without anybody deciding
to stop watching upstream.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "tools"))

import check_upstream_updates as checker

BASELINE = {
    "repo": "https://github.com/example/product.git",
    "branch": "main",
    "reviewed_through": "a" * 40,
    "reviewed_date": "2026-09-12",
}


def fake_gh(payload: object, returncode: int = 0):
    """Stand in for `gh`, so no test reaches the network."""

    def runner(args, **kwargs):
        assert args[0] == "gh"
        assert "--state" in args and args[args.index("--state") + 1] == "all"
        return subprocess.CompletedProcess(
            args, returncode, stdout=json.dumps(payload), stderr=""
        )

    return runner


def test_tickets_are_queried_with_state_all(monkeypatch):
    """An item opened and closed between two runs was still never triaged."""
    monkeypatch.setattr(
        checker.subprocess,
        "run",
        fake_gh([{"number": 9, "title": "closed without merging"}]),
    )
    tickets = checker.collect_new_tickets(BASELINE, "pr")
    assert tickets == [{"number": 9, "title": "closed without merging"}]


def test_items_at_or_below_the_watermark_are_not_re_reported(monkeypatch):
    monkeypatch.setattr(
        checker.subprocess,
        "run",
        fake_gh([{"number": 4, "title": "old"}, {"number": 5, "title": "new"}]),
    )
    baseline = {**BASELINE, "reviewed_pr_through": 4}
    assert [t["number"] for t in checker.collect_new_tickets(baseline, "pr")] == [5]


def test_failure_to_reach_gh_is_not_reported_as_quiet(monkeypatch):
    monkeypatch.setattr(
        checker.subprocess,
        "run",
        fake_gh([], returncode=1),
    )
    assert checker.collect_new_tickets(BASELINE, "pr") is None


def test_non_github_repo_leaves_tickets_unqueried():
    baseline = {**BASELINE, "repo": "https://gitlab.example.com/team/product.git"}
    assert checker.collect_new_tickets(baseline, "pr") is None
