# syntax=docker/dockerfile:1.7
#
# Two-stage build for the in-house EBICS-3.0 mock server.
# Replaces the dead Libeufin sandbox; built per ORA-2302 CEO decision.
# Mirrors the ebics-sidecar-java Dockerfile pattern: Temurin 17 build →
# Alpine JRE runtime, non-root by construction.

FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /src
COPY pom.xml ./
RUN --mount=type=cache,target=/root/.m2 \
    mvn -B -q dependency:go-offline
COPY src ./src
RUN --mount=type=cache,target=/root/.m2 \
    mvn -B -q -DskipTests package \
 && cp target/ebics-mock-server-*.jar /tmp/app.jar

FROM eclipse-temurin:17-jre-alpine
RUN addgroup -S ebicsmock && adduser -S -G ebicsmock ebicsmock \
    && apk add --no-cache wget
USER ebicsmock:ebicsmock
WORKDIR /app
COPY --from=build --chown=ebicsmock:ebicsmock /tmp/app.jar /app/app.jar

ENV JAVA_TOOL_OPTIONS="-XX:+UseContainerSupport -XX:MaxRAMPercentage=75.0 -XX:+ExitOnOutOfMemoryError"

EXPOSE 5016

HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:5016/actuator/health/liveness || exit 1

ENTRYPOINT ["java", "-jar", "/app/app.jar"]
