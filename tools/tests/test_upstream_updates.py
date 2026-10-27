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
