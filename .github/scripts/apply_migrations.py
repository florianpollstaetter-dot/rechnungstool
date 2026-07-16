#!/usr/bin/env python3
"""Apply pending Supabase migrations in CI on pushes to master.

Two backends are supported; the first available one is used:

  1. Direct Postgres (preferred, durable): set ``SUPABASE_DB_URL`` to a
     Supabase connection string (pooler or direct). Applies each pending
     migration with ``psql``. A DB password does not expire, so this backend
     removes the recurring Management-API token-rotation failure mode.

  2. Management API (fallback): set ``SUPABASE_ACCESS_TOKEN`` +
     ``SUPABASE_PROJECT_REF``. This uses an account-scoped PAT that expires
     and has repeatedly broken CI (see ORA-2798/ORA-2799); kept only so the
     pipeline still works until ``SUPABASE_DB_URL`` is provisioned.

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


class ManagementApiBackend:
    """Applies migrations via the Supabase Management API (expiring PAT)."""

    name = "Management API"

    def __init__(self) -> None:
        project_ref = _env("SUPABASE_PROJECT_REF")
        self._token = _env("SUPABASE_ACCESS_TOKEN")
        self._api = (
            f"https://api.supabase.com/v1/projects/{project_ref}/database/query"
        )
        # Cloudflare blocks bare urllib user agents with 403; send a browser-ish UA.
        self._user_agent = "Mozilla/5.0 (rechnungstool-ci-migrate)"

    def _run(self, sql: str) -> str:
        body = json.dumps({"query": sql}).encode("utf-8")
        req = urllib.request.Request(
            self._api,
            data=body,
            headers={
                "Authorization": f"Bearer {self._token}",
                "User-Agent": self._user_agent,
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

    def execute(self, sql: str) -> None:
        self._run(sql)

    def applied_versions(self) -> set[str]:
        raw = self._run(
            "select version from supabase_migrations.schema_migrations "
            "order by version"
        )
        return {row["version"] for row in json.loads(raw)}


class DirectPostgresBackend:
    """Applies migrations over a direct Postgres connection using psql."""

    name = "direct Postgres (psql)"

    def __init__(self, db_url: str | None = None) -> None:
        self._db_url = db_url or _env("SUPABASE_DB_URL")

    def _psql(self, sql: str, *, extra_args: list[str] | None = None) -> str:
        cmd = [
            "psql",
            self._db_url,
            "-v",
            "ON_ERROR_STOP=1",
            "--no-psqlrc",
            "-q",
            *(extra_args or []),
        ]
        result = subprocess.run(
            cmd,
            input=sql,
            text=True,
            capture_output=True,
        )
        if result.returncode != 0:
            sys.exit(
                f"psql failed (exit {result.returncode}):\n{result.stderr.strip()}"
            )
        return result.stdout

    def execute(self, sql: str) -> None:
        # Wrap each migration in a transaction so a mid-migration failure
        # rolls back cleanly instead of leaving a half-applied schema.
        self._psql(sql, extra_args=["--single-transaction"])

    def applied_versions(self) -> set[str]:
        out = self._psql(
            "select version from supabase_migrations.schema_migrations "
            "order by version;",
            # -t: tuples only, -A: unaligned — one bare version per line.
            extra_args=["-t", "-A"],
        )
        return {line.strip() for line in out.splitlines() if line.strip()}


def _looks_like_pg_url(value: str) -> bool:
    return value.startswith(("postgres://", "postgresql://"))


def select_backend():
    # Preferred: an explicit durable Postgres URL in its own secret.
    db_url = os.environ.get("SUPABASE_DB_URL")
    if db_url:
        return DirectPostgresBackend(db_url)
    # The workflow already maps SUPABASE_ACCESS_TOKEN into the job env. To
    # reach the durable Postgres path without a workflow-yaml change (which
    # needs a workflow-scoped token) or a brand-new secret, allow that same
    # secret to carry a Postgres connection string: if the value looks like a
    # pg URL use the direct backend, otherwise treat it as a Management API PAT.
    access = os.environ.get("SUPABASE_ACCESS_TOKEN")
    if access:
        if _looks_like_pg_url(access):
            return DirectPostgresBackend(access)
        return ManagementApiBackend()
    sys.exit(
        "No migration backend configured: set SUPABASE_DB_URL (preferred), "
        "put a Postgres connection string in SUPABASE_ACCESS_TOKEN for the "
        "durable path, or a Management API PAT + SUPABASE_PROJECT_REF."
    )


def scan_migrations(mig_dir: Path) -> list[tuple[str, Path]]:
    """Return (version, path) for every forward migration, sorted by filename.

    Reversal scripts (``*_down.sql``) must never be in the forward-apply set:
    they DROP what the paired up-migration creates, so applying one during a
    backlog run destroys data. They are excluded from the scan entirely.

    Fail-fast on duplicate version tokens. The version is the leading token of
    the filename and the sole key in schema_migrations. If two files share a
    token, only one can ever be recorded — the other is either applied then
    masked (data loss) or silently skipped, depending on ordering and DB state.
    This is unrecoverable at runtime, so abort before touching the DB.
    """
    local = [f for f in sorted(mig_dir.glob("*.sql")) if not f.stem.endswith("_down")]

    by_version: dict[str, list[Path]] = {}
    for f in local:
        by_version.setdefault(f.stem.split("_", 1)[0], []).append(f)
    collisions = {v: fs for v, fs in by_version.items() if len(fs) > 1}
    if collisions:
        lines = "\n".join(
            f"  version {v}: {', '.join(p.name for p in fs)}"
            for v, fs in sorted(collisions.items())
        )
        sys.exit(
            "Duplicate migration version token(s) detected — refusing to apply "
            "to avoid silent skips / double application:\n" + lines
        )

    return [(f.stem.split("_", 1)[0], f) for f in local]


def main() -> int:
    mig_dir = Path("supabase/migrations")
    if not mig_dir.is_dir():
        print("No supabase/migrations directory — nothing to do.")
        return 0

    scanned = scan_migrations(mig_dir)
    if not scanned:
        print("No migration files found — skipping.")
        return 0

    backend = select_backend()
    print(f"Backend: {backend.name}")

    applied = backend.applied_versions()
    print(f"Already applied: {len(applied)}")

    pending = [(version, f) for version, f in scanned if version not in applied]

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
        backend.execute(sql)
        print("  SQL executed")

        name_escaped = name.replace("'", "''")
        backend.execute(
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
