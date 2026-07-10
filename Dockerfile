# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS frontend-build

WORKDIR /build/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build


FROM python:3.12-slim AS python-build

ENV UV_SYSTEM_PYTHON=1

WORKDIR /app/backend

COPY --from=ghcr.io/astral-sh/uv:0.11.24 /uv /uvx /bin/
COPY backend/pyproject.toml backend/uv.lock backend/README.md ./
COPY backend/app ./app
COPY plugins/jenkins /app/plugins/jenkins

RUN uv sync --locked --no-dev --no-editable \
    && uv pip install --python .venv/bin/python /app/plugins/jenkins


FROM python:3.12-slim AS runtime

ARG APP_VERSION=0.0.0
ARG VCS_REF=unknown

LABEL org.opencontainers.image.title="Spaghetti Desk" \
      org.opencontainers.image.description="Open-source DevOps control center" \
      org.opencontainers.image.source="https://github.com/iMilad/spaghetti-desk" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.licenses="MIT"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    SPAGHETTI_STATIC_DIR=/app/frontend \
    SPAGHETTI_VERSION="${APP_VERSION}" \
    PATH="/app/backend/.venv/bin:${PATH}"

WORKDIR /app

COPY --from=python-build /app/backend/.venv /app/backend/.venv
COPY backend/app /app/backend/app
COPY backend/alembic.ini /app/backend/alembic.ini
COPY backend/migrations /app/backend/migrations
COPY config/config.example.yaml /app/config/config.example.yaml
COPY examples /app/examples
COPY --from=frontend-build /build/frontend/dist /app/frontend

WORKDIR /app/backend

RUN groupadd --gid 10001 spaghetti \
    && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin spaghetti

USER spaghetti

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=5)"]

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
