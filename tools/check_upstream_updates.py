"""Report upstream commits, pull requests, and issues this fork has not reviewed.

Commits are only one of the places upstream work shows up. A pull request can sit
open for months with a fix in it, and an issue can describe a defect this fork also
has -- neither reaches the commit log until somebody merges it. Each axis therefore
carries its own watermark, and the report only lists what is above it.

Tickets are queried with ``--state all`` on purpose: an item opened and closed
between two scheduled runs is still an item this fork never triaged, and a pull
request closed without merging never arrives on the commit axis at all.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
BASELINE_PATH = REPO_ROOT / "tools" / "upstream_baseline.json"
UPSTREAM_REF_PREFIX = "refs/upstream-check"
DEFAULT_DECISION_LOG = "docs/DECISIONS.md"


class UpstreamCheckError(RuntimeError):
    """Raised when the baseline or upstream Git history cannot be inspected."""


def load_baseline(path: Path = BASELINE_PATH) -> dict:
    if not path.is_file():
        raise UpstreamCheckError(f"missing baseline file: {path}")
    try:
        baseline = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise UpstreamCheckError(f"invalid baseline file: {path}: {exc}") from exc
    required = {"repo", "branch", "reviewed_through", "reviewed_date"}
    missing = sorted(required - baseline.keys())
    if missing:
        raise UpstreamCheckError(f"baseline missing fields: {', '.join(missing)}")
    if len(baseline["reviewed_through"]) != 40:
        raise UpstreamCheckError("reviewed_through must be a full 40-character SHA")
    return baseline


def run_git(args: list[str], repo_dir: Path) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=repo_dir,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if result.returncode != 0:
        raise UpstreamCheckError(
            f"git {' '.join(args)} failed: {result.stderr.strip()}"
        )
    return result.stdout


def fetch_upstream(baseline: dict, repo_dir: Path) -> str:
    branch = baseline["branch"]
    ref = f"{UPSTREAM_REF_PREFIX}/{branch}"
    run_git(
        [
            "fetch",
            "--quiet",
            baseline["repo"],
            f"+refs/heads/{branch}:{ref}",
        ],
        repo_dir,
    )
    return ref


def collect_new_commits(baseline: dict, repo_dir: Path, ref: str) -> list[dict]:
    reviewed = baseline["reviewed_through"]
    delimiter = "---upstream-check-entry---"
    log = run_git(
        [
            "log",
            f"--format={delimiter}%n%H%n%h%n%an%n%ad%n%s",
            "--date=short",
            f"{reviewed}..{ref}",
        ],
        repo_dir,
    )
    commits: list[dict] = []
    for chunk in log.split(delimiter):
        chunk = chunk.strip()
        if not chunk:
            continue
        lines = chunk.splitlines()
        if len(lines) < 5:
            continue
        sha, short_sha, author, date, subject = (
            lines[0],
            lines[1],
            lines[2],
            lines[3],
            lines[4],
        )
        commits.append(
            {
                "sha": sha,
                "short_sha": short_sha,
                "author": author,
                "date": date,
                "subject": subject,
            }
        )
    return commits


def parse_repo_slug(repo_url: str) -> str | None:
    match = re.search(r"github\.com[/:]([^/]+/[^/.]+?)(?:\.git)?$", repo_url)
    return match.group(1) if match else None


def query_github(args: list[str]) -> list[dict] | None:
    try:
        proc = subprocess.run(
            ["gh", *args],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
    except FileNotFoundError:
        return None
    if proc.returncode != 0:
        return None
    try:
        data = json.loads(proc.stdout)
        return data if isinstance(data, list) else None
    except json.JSONDecodeError:
        return None


def collect_new_tickets(baseline: dict, kind: str) -> list[dict] | None:
    slug = parse_repo_slug(baseline["repo"])
    if not slug:
        return None
    watermark_key = f"reviewed_{kind}_through"
    watermark = baseline.get(watermark_key)
    raw = query_github(
        [
            kind,
            "list",
            "--repo",
            slug,
            "--state",
            "all",
            "--limit",
            "100",
            "--json",
            "number,title,state,url,createdAt",
        ]
    )
    if raw is None:
        return None
    if watermark is None:
        return raw
    return [item for item in raw if item.get("number", 0) > watermark]


def render_markdown(
    baseline: dict,
    commits: list[dict],
    prs: list[dict] | None = None,
    issues: list[dict] | None = None,
) -> str:
    log_link = baseline.get("decision_log", DEFAULT_DECISION_LOG)
    lines = [
        "# Upstream Review Report",
        "",
        f"- Upstream: `{baseline['repo']}` (branch: `{baseline['branch']}`)",
        f"- Reviewed through: `{baseline['reviewed_through']}` ({baseline['reviewed_date']})",
        f"- Decision log: [`{log_link}`]({log_link})",
        "",
    ]
    if not commits:
        lines.extend(["## Commits", "", "No new upstream commits since baseline.", ""])
    else:
        lines.extend(
            [
                f"## Commits ({len(commits)} new)",
                "",
                "| Commit | Date | Author | Subject |",
                "|---|---|---|---|",
            ]
        )
        for commit in commits:
            lines.append(
                f"| `{commit['short_sha']}` | {commit['date']} | {commit['author']} | {commit['subject']} |"
            )
        lines.append("")

    for title, items, kind in (("Pull requests", prs, "pr"), ("Issues", issues, "issue")):
        watermark = baseline.get(f"reviewed_{kind}_through")
        suffix = f" (watermark: #{watermark})" if watermark is not None else ""
        if items is None:
            lines.extend([f"## {title}", "", "_Unable to query GitHub CLI._", ""])
        elif not items:
            lines.extend([f"## {title}{suffix}", "", "No new items above watermark.", ""])
        else:
            lines.extend(
                [
                    f"## {title} ({len(items)} new){suffix}",
                    "",
                    "| # | Title | State | Created |",
                    "|---|---|---|---|",
                ]
            )
            for item in items:
                lines.append(
                    f"| [#{item['number']}]({item.get('url', '')}) | {item.get('title', '')} | {item.get('state', '')} | {item.get('createdAt', '')[:10]} |"
                )
            lines.append("")

    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", type=Path, default=BASELINE_PATH)
    parser.add_argument("--output", type=Path, default=REPO_ROOT / "upstream-review-report.md")
    parser.add_argument("--strict", action="store_true", help="Exit 1 if any unreviewed commits/items exist")
    args = parser.parse_args()

    baseline = load_baseline(args.baseline)
    ref = fetch_upstream(baseline, REPO_ROOT)
    commits = collect_new_commits(baseline, REPO_ROOT, ref)
    prs = collect_new_tickets(baseline, "pr")
    issues = collect_new_tickets(baseline, "issue")

    report = render_markdown(baseline, commits, prs, issues)
    args.output.write_text(report, encoding="utf-8")
    print(report)

    if args.strict and (commits or (prs and len(prs) > 0) or (issues and len(issues) > 0)):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
