# PoC Bench Results

> Performance gate for the **ebics-java-client Spring-Boot sidecar** at
> 1k / 10k / 100k CAMT.053 entries. Driven from
> `.github/workflows/treasury-poc-bench.yml` (push to
> `feature/treasury-ebics-bench**` and `workflow_dispatch`).
>
> The original ORA-2284 dual-sidecar comparison (Java vs Python) is **not**
> reproduced here — ADR-001 in [`../docs/05-decision-memo.md`](../docs/05-decision-memo.md)
> accepted the Java path and decommissioned the JOONIS Python prototype.
> This bench measures the single production-target sidecar only.

## Acceptance gate (ORA-2298)

- Peak container RSS at **100k** must stay **≤ 1024 MiB**
- Mean STA latency at **100k** must stay **≤ 5 s** (the hyperfine table also
  publishes min/max; the workflow gate currently reads the Mean column)

If either threshold is breached, the workflow exits non-zero and the
Treasury Engineer opens a tuning PR on `feature/treasury-ebics-poc`
(JVM heap, GC, parser-streaming) or a follow-on child issue.

## Format

Each CI run rewrites this file from scratch and appends one block per
fixture size:

```
## YYYY-MM-DDTHH:MM:SSZ — bench/statements/camt053_<size>.xml (<bytes> bytes)

### Latency — GET /ebics/sta (hyperfine warmup=10, runs=50)
| Command | Mean [s] | Min [s] | Max [s] | …
| --- | --- | --- | --- |
| curl … /ebics/sta?from=YYYY-MM-DD | … | … | … |

### Container RSS peak (sampled across N extra STA calls)
| container | peak RSS (MiB) |
| --- | --- |
| ebics-sidecar | … |
| ebics-mock    | … |

### Container image size
| image | uncompressed (bytes) | gzipped (bytes) |
| --- | --- | --- |
| ebics-sidecar:bench         | … | … |
| ebics-mock-server:0.1.0     | … | … |
```

Final comparison summary lives in
[`../docs/05-decision-memo.md`](../docs/05-decision-memo.md) §Performance.

## Pending first CI run

This file will be repopulated by the next `treasury-poc-bench` workflow
run. Until then, the bench numbers cited in the Decision-Memo come from
the CI artifact `treasury-poc-bench-artifacts`.
