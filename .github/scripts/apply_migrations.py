#!/usr/bin/env python3
"""Apply pending Supabase migrations via the Management API.

Runs in CI on pushes to master. Uses only SUPABASE_ACCESS_TOKEN +
SUPABASE_PROJECT_REF, so there is no DB password or pooler dependency.

Logic:
  1. Fetch applied versions from supabase_migrations.schema_migrations.
  2. Scan supabase/migrations/*.sql in sorted order.
  3. For each pending migration, execute the SQL, then record the version.
  4. Fail the job on any HTTP non-2xx response so Actions surfaces the error.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path


def _env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        sys.exit(f"Missing required env var: {name}")
    return value


PROJECT_REF = _env("SUPABASE_PROJECT_REF")
TOKEN = _env("SUPABASE_ACCESS_TOKEN")
API = f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"
# Cloudflare blocks bare urllib user agents with 403; send a browser-ish UA.
USER_AGENT = "Mozilla/5.0 (rechnungstool-ci-migrate)"


def run_sql(sql: str) -> str:
    body = json.dumps({"query": sql}).encode("utf-8")
    req = urllib.request.Request(
        API,
        data=body,
        headers={
            "Authorization": f"Bearer {TOKEN}",
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


def applied_versions() -> set[str]:
    raw = run_sql(
        "select version from supabase_migrations.schema_migrations order by version"
    )
    return {row["version"] for row in json.loads(raw)}


def main() -> int:
    mig_dir = Path("supabase/migrations")
    if not mig_dir.is_dir():
        print("No supabase/migrations directory — nothing to do.")
        return 0

    local = sorted(mig_dir.glob("*.sql"))
    applied = applied_versions()
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

    for version, f in pending:
        name = f.stem.split("_", 1)[1] if "_" in f.stem else f.stem
        sql = f.read_text()
        print(f"\n=== Applying {f.name} ===")
        run_sql(sql)
        print("  SQL executed")

        name_escaped = name.replace("'", "''")
        run_sql(
            "insert into supabase_migrations.schema_migrations "
            "(version, name, statements) values "
            f"('{version}', '{name_escaped}', ARRAY[]::text[]) "
            "on conflict (version) do nothing"
        )
        print("  Recorded in schema_migrations")

    print("\nAll pending migrations applied.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
