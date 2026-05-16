"""JOONIS Python Fintech sidecar — Kandidat B for the EBICS-Library PoC.

Endpoints mirror the Java sidecar exactly so the Next.js consumer
contract is candidate-agnostic.
"""

from __future__ import annotations

import os
from datetime import date

from fastapi import Body, FastAPI, Query

from .license import LicenseStatus, check_license

app = FastAPI(title="ebics-sidecar-py", version="0.1.0")

HOST_ID = os.getenv("EBICS_HOST_ID", "OCTOPOC")
PARTNER_ID = os.getenv("EBICS_PARTNER_ID", "OCTO001")
USER_ID = os.getenv("EBICS_USER_ID", "OCTOUSR1")
BANK_URL = os.getenv("EBICS_BANK_URL", "http://libeufin-sandbox:5016/ebicsweb")


@app.get("/ebics/health")
def health() -> dict:
    lic: LicenseStatus = check_license()
    return {
        "status": "ok",
        "candidate": "B-joonis-fintech",
        "hostId": HOST_ID,
        "partnerId": PARTNER_ID,
        "license": lic.model_dump(),
    }


@app.post("/ebics/init")
def init() -> dict:
    """INI + HIA bootstrap using fintech.ebics.EbicsClient.

    Real implementation (W3): create EbicsKeyRing, EbicsBank, EbicsUser, then
    client.ini() + client.hia(). PoC stub returns shape only.
    """
    return {"status": "stub", "next": "wire fintech.ebics INI/HIA in W3"}


@app.get("/ebics/hkd")
def hkd() -> dict:
    return {"status": "stub", "next": "wire fintech.ebics HKD download in W3"}


@app.get("/ebics/sta")
def sta(
    from_: str = Query(alias="from"),
    to: str | None = Query(default=None),
) -> dict:
    """STA/C53 statement download.

    Real implementation returns raw CAMT.053 bytes; this scaffold validates
    the date inputs only.
    """
    from_date = date.fromisoformat(from_)
    to_date = date.fromisoformat(to) if to else from_date
    return {
        "status": "stub",
        "from": from_date.isoformat(),
        "to": to_date.isoformat(),
        "next": "wire fintech.ebics STA/C53 download in W3",
    }


@app.post("/ebics/cct")
def cct(pain001_xml: str = Body(media_type="application/xml")) -> dict:
    return {
        "status": "stub",
        "payloadBytes": len(pain001_xml or ""),
        "next": "wire fintech.ebics CCT/CCI upload in W3",
    }


@app.get("/ebics/hev")
def hev() -> dict:
    return {
        "status": "stub",
        "bankUrl": BANK_URL,
        "next": "wire fintech.ebics HEV in W3",
    }
