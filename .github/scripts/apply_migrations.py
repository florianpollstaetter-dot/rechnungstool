#!/usr/bin/env python3
"""Apply pending Supabase migrations via the Management API.

Runs in CI on pushes to master. Uses only SUPABASE_ACCESS_TOKEN +
SUPABASE_PROJECT_REF, so there is no DB password or pooler dependency.

Logic:
  1. Fetch applied versions from supabase_migrations.schema_migrations.
  2. Scan supabase/migrations/*.sql in sorted order.
  3. For each pending migration, execute the SQL, then record the version.
  4. Fail the job on any HTTP non-2xx response so Actions surfaces the error.

Modes:
  default      Apply pending migrations.
  --dry-run    Report drift only. Exits 2 if pending migrations exist,
               1 on infra errors (missing secret, API failure), 0 if clean.
               Use as a PR/pre-deploy guard so silent pipeline failures
               surface before Vercel ships code that expects unapplied schema.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path


SECRET_HINT = (
    "If running in GitHub Actions, set this in: "
    "Repo > Settings > Secrets and variables > Actions > New repository secret. "
    "See AGENTS.md > 'GitHub-Secret onboarding checklist'."
)


def _env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        sys.exit(f"Missing required env var: {name}\n{SECRET_HINT}")
    return value


# Cloudflare blocks bare urllib user agents with 403; send a browser-ish UA.
USER_AGENT = "Mozilla/5.0 (rechnungstool-ci-migrate)"


def run_sql(api: str, token: str, sql: str) -> str:
    body = json.dumps({"query": sql}).encode("utf-8")
    req = urllib.request.Request(
        api,
        data=body,
        headers={
            "Authorization": f"Bearer {token}",
            "User-Agent": USER_AGENT,
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            return resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        sys.exit(f"Supabase API {e.code}: {detail}")


def applied_versions(api: str, token: str) -> set[str]:
    raw = run_sql(
        api,
        token,
        "select version from supabase_migrations.schema_migrations order by version",
    )
    return {row["version"] for row in json.loads(raw)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report drift only. Exit 2 if any pending migrations exist.",
    )
    args = parser.parse_args()

    mig_dir = Path("supabase/migrations")
    if not mig_dir.is_dir():
        print("No supabase/migrations directory — nothing to do.")
        return 0

    project_ref = _env("SUPABASE_PROJECT_REF")
    token = _env("SUPABASE_ACCESS_TOKEN")
    api = f"https://api.supabase.com/v1/projects/{project_ref}/database/query"

    local = sorted(mig_dir.glob("*.sql"))
    applied = applied_versions(api, token)
    print(f"Already applied: {len(applied)}")

    pending = []
    for f in local:
        version = f.stem.split("_", 1)[0]
        if version not in applied:
            pending.append((version, f))

    if not pending:
        print("No pending migrations.")
        return 0

    print(f"Pending: {len(pending)}")
    for _, f in pending:
        print(f"  - {f.name}")

    if args.dry_run:
        print(
            "\nDRIFT DETECTED — repo is ahead of supabase_migrations.schema_migrations."
        )
        print("Re-run the supabase-migrations workflow on master to drain the backlog.")
        return 2

    for version, f in pending:
        name = f.stem.split("_", 1)[1] if "_" in f.stem else f.stem
        sql = f.read_text()
        print(f"\n=== Applying {f.name} ===")
        run_sql(api, token, sql)
        print("  SQL executed")

        name_escaped = name.replace("'", "''")
        run_sql(
            api,
            token,
            "insert into supabase_migrations.schema_migrations "
            "(version, name, statements) values "
            f"('{version}', '{name_escaped}', ARRAY[]::text[]) "
            "on conflict (version) do nothing",
        )
        print("  Recorded in schema_migrations")

    print("\nAll pending migrations applied.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
