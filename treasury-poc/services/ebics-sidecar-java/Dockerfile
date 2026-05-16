# Two-stage build for the ebics-java-client sidecar.
# Final image runs as a non-root user; keystore mount lives outside the image.

FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /src
COPY pom.xml ./
RUN mvn -B -q dependency:go-offline
COPY src ./src
RUN mvn -B -q -DskipTests package

FROM eclipse-temurin:17-jre-alpine
RUN addgroup -S ebics && adduser -S -G ebics ebics \
    && mkdir -p /var/lib/ebics-sidecar/keystore \
    && chown -R ebics:ebics /var/lib/ebics-sidecar
USER ebics
WORKDIR /app
COPY --from=build /src/target/ebics-sidecar-java-0.1.0.jar /app/app.jar
EXPOSE 8081
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8081/actuator/health/liveness || exit 1
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
