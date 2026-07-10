#!/usr/bin/env python3
"""Apply pending Supabase migrations.

Runs in CI on pushes to master. Two interchangeable backends:

  * Direct-DB (preferred when available): if SUPABASE_DB_URL is set, apply
    migrations over a plain Postgres connection with `psql`. Needs NO
    Management-API PAT — only a DB connection string, which is a static,
    long-lived credential (it does not expire/rotate like the PAT). See
    ORA-2757. Use the *session-mode pooler* URI so GitHub's IPv4-only
    runners can reach it (direct db.<ref>.supabase.co is IPv6-only):
        postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres

  * Management API (fallback): if SUPABASE_DB_URL is absent, use
    SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF against the
    /database/query endpoint, exactly as before. This keeps the PAT path
    working until the DB-URL secret is wired in.

Logic (both backends):
  1. Fetch applied versions from supabase_migrations.schema_migrations.
  2. Scan supabase/migrations/*.sql in sorted order.
  3. For each pending migration, execute the SQL, then record the version.
  4. Fail the job on any error so Actions surfaces it.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path


def _env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        sys.exit(f"Missing required env var: {name}")
    return value


# ---------------------------------------------------------------------------
# Backend: Direct-DB via psql (no Management-API PAT).
# ---------------------------------------------------------------------------
class DirectDbBackend:
    name = "direct-db (psql)"

    def __init__(self, db_url: str) -> None:
        self.db_url = db_url

    def _psql(self, args: list[str], *, capture: bool = False) -> str:
        cmd = ["psql", self.db_url, "-v", "ON_ERROR_STOP=1", "--no-psqlrc"]
        cmd += args
        try:
            if capture:
                out = subprocess.run(
                    cmd, check=True, capture_output=True, text=True, timeout=600
                )
                return out.stdout
            subprocess.run(cmd, check=True, timeout=600)
            return ""
        except subprocess.CalledProcessError as e:
            detail = (e.stderr or "").strip() or (e.stdout or "").strip()
            sys.exit(f"psql failed (exit {e.returncode}): {detail}")

    def applied_versions(self) -> set[str]:
        raw = self._psql(
            [
                "-tAc",
                "select version from supabase_migrations.schema_migrations "
                "order by version",
            ],
            capture=True,
        )
        return {line.strip() for line in raw.splitlines() if line.strip()}

    def apply(self, version: str, name: str, path: Path) -> None:
        # Run the whole migration file; multi-statement files work natively.
        self._psql(["-f", str(path)])
        name_escaped = name.replace("'", "''")
        self._psql(
            [
                "-c",
                "insert into supabase_migrations.schema_migrations "
                "(version, name, statements) values "
                f"('{version}', '{name_escaped}', ARRAY[]::text[]) "
                "on conflict (version) do nothing",
            ]
        )


# ---------------------------------------------------------------------------
# Backend: Supabase Management API (requires PAT).
# ---------------------------------------------------------------------------
class ManagementApiBackend:
    name = "management-api (PAT)"
    # Cloudflare blocks bare urllib user agents with 403; send a browser-ish UA.
    USER_AGENT = "Mozilla/5.0 (rechnungstool-ci-migrate)"

    def __init__(self, project_ref: str, token: str) -> None:
        self.api = (
            f"https://api.supabase.com/v1/projects/{project_ref}/database/query"
        )
        self.token = token

    def run_sql(self, sql: str) -> str:
        body = json.dumps({"query": sql}).encode("utf-8")
        req = urllib.request.Request(
            self.api,
            data=body,
            headers={
                "Authorization": f"Bearer {self.token}",
                "User-Agent": self.USER_AGENT,
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

    def applied_versions(self) -> set[str]:
        raw = self.run_sql(
            "select version from supabase_migrations.schema_migrations "
            "order by version"
        )
        return {row["version"] for row in json.loads(raw)}

    def apply(self, version: str, name: str, path: Path) -> None:
        self.run_sql(path.read_text())
        name_escaped = name.replace("'", "''")
        self.run_sql(
            "insert into supabase_migrations.schema_migrations "
            "(version, name, statements) values "
            f"('{version}', '{name_escaped}', ARRAY[]::text[]) "
            "on conflict (version) do nothing"
        )


def _select_backend():
    db_url = os.environ.get("SUPABASE_DB_URL")
    if db_url:
        return DirectDbBackend(db_url)
    return ManagementApiBackend(
        _env("SUPABASE_PROJECT_REF"), _env("SUPABASE_ACCESS_TOKEN")
    )


def main() -> int:
    mig_dir = Path("supabase/migrations")
    if not mig_dir.is_dir():
        print("No supabase/migrations directory — nothing to do.")
        return 0

    local = sorted(mig_dir.glob("*.sql"))
    if not local:
        print("No migration files found — skipping.")
        return 0

    backend = _select_backend()
    print(f"Backend: {backend.name}")

    applied = backend.applied_versions()
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
        print(f"\n=== Applying {f.name} ===")
        backend.apply(version, name, f)
        print("  SQL executed + recorded in schema_migrations")

    print("\nAll pending migrations applied.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
