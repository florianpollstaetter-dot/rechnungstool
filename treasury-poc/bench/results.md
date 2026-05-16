# PoC Bench Results

> Bench-Resultate werden in eigenen Heartbeats (Child-Issue W4) eingespielt,
> sobald Libeufin live ist und beide Sidecars CAMT.053-Antworten liefern.
> Diese Datei ist ein Platzhalter mit Spaltenformat — `run_bench.sh` appended.

## Format

Jeder Run schreibt einen Block:

```
## YYYY-MM-DDTHH:MM:SSZ — statements/camt053_<size>.xml

### Latency (hyperfine 10 warmup, 50 runs)
| Command | Mean [ms] | Min [ms] | Max [ms] |
| --- | --- | --- | --- |
| ebics-sidecar-java /sta | … | … | … |
| ebics-sidecar-py   /sta | … | … | … |

### Container RSS
- ebics-sidecar-java: <MEM_USAGE>
- ebics-sidecar-py:  <MEM_USAGE>
```

Final comparison summary moves into [`docs/05-decision-memo.md`](../docs/05-decision-memo.md).
