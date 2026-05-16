# JOONIS Python Fintech sidecar.
# License key is supplied at runtime via FINTECH_LICENSEEE / FINTECH_LICENSEKEY.
FROM python:3.12-slim

RUN groupadd -r ebics && useradd -r -g ebics ebics \
    && mkdir -p /var/lib/ebics-sidecar/keystore \
    && chown -R ebics:ebics /var/lib/ebics-sidecar

WORKDIR /app
COPY pyproject.toml ./
RUN pip install --no-cache-dir .

COPY app ./app

USER ebics
EXPOSE 8082
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8082/ebics/health').read()" || exit 1
ENTRYPOINT ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8082"]
