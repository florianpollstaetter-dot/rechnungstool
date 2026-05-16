#!/usr/bin/env python3
"""Generate CAMT.053.001.08 fixtures for the EBICS-Library PoC bench.

Usage: python gen_fixtures.py --count 10000 --out statements/camt053_10k.xml

The fixture is a single valid Bk-To-Cstmr-Stmt document with N <Ntry> entries,
suitable for parsing-throughput comparison between the Java and Python sidecars.
"""

from __future__ import annotations

import argparse
from datetime import date, timedelta
from pathlib import Path


def gen_xml(count: int) -> str:
    """Render a minimal namespace-pure CAMT.053.001.08 document with `count` entries."""
    today = date.today()
    head = today - timedelta(days=1)
    lines: list[str] = []
    lines.append('<?xml version="1.0" encoding="UTF-8"?>')
    lines.append('<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08">')
    lines.append("  <BkToCstmrStmt>")
    lines.append("    <GrpHdr>")
    lines.append("      <MsgId>POC-BENCH-001</MsgId>")
    lines.append(f"      <CreDtTm>{today.isoformat()}T08:00:00</CreDtTm>")
    lines.append("    </GrpHdr>")
    lines.append("    <Stmt>")
    lines.append("      <Id>STMT-BENCH</Id>")
    lines.append("      <CreDtTm>" + today.isoformat() + "T08:00:00</CreDtTm>")
    lines.append("      <Acct><Id><IBAN>AT483200000012345864</IBAN></Id></Acct>")
    for i in range(count):
        amt = 100.00 + (i % 9999) / 100.0
        bdy = (
            "      <Ntry>"
            f"<NtryRef>BENCH-{i:08d}</NtryRef>"
            f"<Amt Ccy=\"EUR\">{amt:.2f}</Amt>"
            "<CdtDbtInd>CRDT</CdtDbtInd>"
            "<Sts>BOOK</Sts>"
            f"<BookgDt><Dt>{head.isoformat()}</Dt></BookgDt>"
            f"<ValDt><Dt>{head.isoformat()}</Dt></ValDt>"
            "<BkTxCd><Domn><Cd>PMNT</Cd></Domn></BkTxCd>"
            "</Ntry>"
        )
        lines.append(bdy)
    lines.append("    </Stmt>")
    lines.append("  </BkToCstmrStmt>")
    lines.append("</Document>")
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--count", type=int, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(gen_xml(args.count))
    print(f"wrote {args.out} ({args.out.stat().st_size:,} bytes, {args.count:,} entries)")


if __name__ == "__main__":
    main()
