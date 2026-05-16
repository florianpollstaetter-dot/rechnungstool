"""JOONIS Python Fintech license check.

The fintech package refuses to run without a valid licensee/key pair set
via `fintech.register(licensee, key)` or the `FINTECH_LICENSEEE` /
`FINTECH_LICENSEKEY` environment variables. Production must also satisfy
JOONIS' DSGVO AVV terms — see docs/03-license-comparison.md.
"""

from __future__ import annotations

import os

from pydantic import BaseModel


class LicenseStatus(BaseModel):
    licensed: bool
    licensee: str | None
    reason: str | None = None


def check_license() -> LicenseStatus:
    licensee = os.getenv("FINTECH_LICENSEEE")
    key = os.getenv("FINTECH_LICENSEKEY")

    if not licensee or not key:
        return LicenseStatus(
            licensed=False,
            licensee=licensee,
            reason="FINTECH_LICENSEEE / FINTECH_LICENSEKEY env vars missing",
        )

    try:
        import fintech

        fintech.register(licensee, key)
        return LicenseStatus(licensed=True, licensee=licensee)
    except ImportError:
        return LicenseStatus(
            licensed=False,
            licensee=licensee,
            reason="fintech package not installed",
        )
    except Exception as exc:
        return LicenseStatus(
            licensed=False,
            licensee=licensee,
            reason=f"fintech.register failed: {exc!s}",
        )
