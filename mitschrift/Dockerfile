# Mitschrift – ein Container: FastAPI liefert API und Oberfläche aus.
# Build-Kontext ist die Repo-Wurzel, weil das Frontend design/moch.css einbindet:
#   docker build -f mitschrift/Dockerfile -t mitschrift .
# (docker-compose.yml in diesem Ordner setzt das bereits so.)

# ── 1 · Oberfläche bauen ─────────────────────────────────────
FROM node:22-bookworm-slim AS frontend
WORKDIR /src
COPY design/ design/
COPY mitschrift/frontend/package.json mitschrift/frontend/package-lock.json mitschrift/frontend/
RUN cd mitschrift/frontend && npm ci --no-audit --no-fund
COPY mitschrift/frontend/ mitschrift/frontend/
RUN cd mitschrift/frontend && npm run build

# ── 2 · Server ───────────────────────────────────────────────
FROM python:3.12-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    STORAGE_DIR=/data
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY mitschrift/backend/requirements.txt backend/requirements.txt
RUN pip install -r backend/requirements.txt
COPY mitschrift/backend/ backend/
COPY --from=frontend /src/mitschrift/frontend/dist/ frontend/dist/
RUN useradd --system --uid 1000 --home /app mitschrift && mkdir -p /data && chown mitschrift /data
USER mitschrift
VOLUME ["/data"]
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4)"
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
