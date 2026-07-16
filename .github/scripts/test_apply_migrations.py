#!/usr/bin/env python3
"""Unit tests for apply_migrations.py.

No DB and no real psql: the DirectPostgres backend's subprocess.run is stubbed
so the whole apply path is exercised deterministically. Run with:

    python3 .github/scripts/test_apply_migrations.py
"""
from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path
from unittest import mock

_MODULE_PATH = Path(__file__).with_name("apply_migrations.py")
_spec = importlib.util.spec_from_file_location("apply_migrations", _MODULE_PATH)
apply_migrations = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(apply_migrations)


def _write(dir_path: Path, name: str, body: str = "select 1;") -> None:
    (dir_path / name).write_text(body)


class ScanMigrationsTest(unittest.TestCase):
    def _dir(self) -> Path:
        import tempfile

        d = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: __import__("shutil").rmtree(d, ignore_errors=True))
        return d

    def test_down_files_are_excluded(self) -> None:
        d = self._dir()
        _write(d, "20260518_treasury_bank_connections.sql")
        _write(d, "20260518_treasury_bank_connections_down.sql")
        scanned = apply_migrations.scan_migrations(d)
        names = [p.name for _, p in scanned]
        self.assertEqual(names, ["20260518_treasury_bank_connections.sql"])

    def test_duplicate_version_token_fails_fast(self) -> None:
        d = self._dir()
        _write(d, "20260420100000_sch557_company_audit_log.sql")
        _write(d, "20260420100000_sch564_design_photos_path_isolation.sql")
        with self.assertRaises(SystemExit) as ctx:
            apply_migrations.scan_migrations(d)
        self.assertIn("Duplicate migration version token", str(ctx.exception))
        self.assertIn("20260420100000", str(ctx.exception))

    def test_dropping_a_down_pair_removes_the_collision(self) -> None:
        # The real fix: excluding *_down.sql means the shared 20260518 token is
        # no longer a collision, so the scan succeeds and returns just the up.
        d = self._dir()
        _write(d, "20260518_treasury_bank_connections.sql")
        _write(d, "20260518_treasury_bank_connections_down.sql")
        scanned = apply_migrations.scan_migrations(d)
        self.assertEqual([v for v, _ in scanned], ["20260518"])

    def test_distinct_versions_scan_in_sorted_order(self) -> None:
        d = self._dir()
        _write(d, "20260420100001_sch564_design_photos_path_isolation.sql")
        _write(d, "20260420100000_sch557_company_audit_log.sql")
        scanned = apply_migrations.scan_migrations(d)
        self.assertEqual(
            [v for v, _ in scanned], ["20260420100000", "20260420100001"]
        )


class DirectPostgresApplyTest(unittest.TestCase):
    """Full main() path with subprocess.run stubbed — no DB, no psql."""

    def test_pending_are_applied_and_recorded(self) -> None:
        import tempfile

        root = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: __import__("shutil").rmtree(root, ignore_errors=True))
        mig = root / "supabase" / "migrations"
        mig.mkdir(parents=True)
        _write(mig, "20260518_treasury_bank_connections.sql", "create table t();")
        _write(mig, "20260518_treasury_bank_connections_down.sql", "drop table t;")

        calls: list[str] = []

        def fake_run(cmd, input=None, text=None, capture_output=None):
            calls.append(input or "")
            # applied_versions() query returns no rows (empty applied set).
            stdout = "" if "select version" in (input or "") else ""
            return mock.Mock(returncode=0, stdout=stdout, stderr="")

        env = {"SUPABASE_DB_URL": "postgres://user:pw@host:5432/db"}
        import os

        cwd = Path.cwd()
        with mock.patch.object(apply_migrations.subprocess, "run", fake_run), \
                mock.patch.dict(apply_migrations.os.environ, env, clear=False):
            os.chdir(root)
            try:
                rc = apply_migrations.main()
            finally:
                os.chdir(cwd)

        self.assertEqual(rc, 0)
        # The down-file's DROP must never have been executed.
        self.assertFalse(
            any("drop table t" in c for c in calls),
            "reversal script was applied — data-loss regression",
        )
        # The up migration's DDL was applied and its version recorded.
        self.assertTrue(any("create table t" in c for c in calls))
        self.assertTrue(any("schema_migrations" in c and "20260518" in c for c in calls))


if __name__ == "__main__":
    unittest.main(verbosity=2)
