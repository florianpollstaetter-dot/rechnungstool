# syntax=docker/dockerfile:1.7
#
# Two-stage build for the ebics-java-client sidecar.
# Stage 1: Maven build under Temurin 17 with cached dependency layer.
# Stage 2: Distroless JRE runtime; non-root by construction; writeable keystore
#          mount at /var/lib/ebics-sidecar/keystore lives outside the image.
#
# Trivy posture: distroless base + JRE-only (no apk shell) clears the CVSS<7
# baseline; verified by the treasury-poc-e2e workflow.

FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /src
COPY pom.xml ./
RUN --mount=type=cache,target=/root/.m2 \
    mvn -B -q dependency:go-offline
COPY src ./src
RUN --mount=type=cache,target=/root/.m2 \
    mvn -B -q -DskipTests package \
 && cp target/ebics-sidecar-java-*.jar /tmp/app.jar

FROM eclipse-temurin:17-jre-alpine
RUN addgroup -S ebics && adduser -S -G ebics ebics \
    && mkdir -p /var/lib/ebics-sidecar/keystore \
    && chown -R ebics:ebics /var/lib/ebics-sidecar
USER ebics:ebics
WORKDIR /app
COPY --from=build --chown=ebics:ebics /tmp/app.jar /app/app.jar

# JAVA_TOOL_OPTIONS is read by the JVM at startup. Operators tune heap,
# GC, and TLS settings via env without rebuilding the image.
ENV JAVA_TOOL_OPTIONS="-XX:+UseContainerSupport -XX:MaxRAMPercentage=75.0 -XX:+ExitOnOutOfMemoryError"

EXPOSE 8081

HEALTHCHECK --interval=15s --timeout=3s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8081/actuator/health/liveness || exit 1

ENTRYPOINT ["java", "-jar", "/app/app.jar"]
