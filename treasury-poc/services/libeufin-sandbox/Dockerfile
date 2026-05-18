# Multi-stage build for libeufin-bank v1.5.0 from source.
# Replaces registry.taler.net/libeufin-sandbox:0.10.4 (NXDOMAIN since 2026).
# Source: https://git.taler.net/taler/libeufin/ tag v1.5.0
#
# libeufin 1.x renamed "libeufin-sandbox" → "libeufin-bank".
# EBICS endpoint is still at /ebicsweb; admin API moved from /admin/ → /management/.
# Port is configurable via LIBEUFIN_BANK_PORT (we bind to 5016 for compose compatibility).

# ── Stage 1: build ─────────────────────────────────────────────────────────────
FROM gradle:8.7-jdk21-alpine AS builder

USER root
RUN apk add --no-cache git

WORKDIR /src

# Shallow clone at the stable v1.5.0 tag.
RUN git clone --depth 1 --branch v1.5.0 \
      https://git.taler.net/taler/libeufin.git .

# Build the bank distribution (skips nexus and integration tests).
# --no-daemon keeps memory footprint small in CI builders.
RUN gradle :bank:installDist --no-daemon -x test \
      --info 2>&1 | tail -20

# ── Stage 2: runtime ───────────────────────────────────────────────────────────
FROM eclipse-temurin:21-jre-alpine

RUN addgroup -S libeufin && adduser -S libeufin -G libeufin

WORKDIR /opt/libeufin-bank

COPY --from=builder /src/bank/build/install/bank/ .

# wget is used by the compose healthcheck.
RUN apk add --no-cache wget

USER libeufin

EXPOSE 5016

ENTRYPOINT ["bin/bank"]
CMD ["serve"]
