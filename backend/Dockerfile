FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_SYSTEM_PYTHON=1

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:0.11.24 /uv /uvx /bin/

COPY backend/pyproject.toml backend/uv.lock /app/backend/
COPY backend/app /app/backend/app
COPY backend/alembic.ini /app/backend/alembic.ini
COPY backend/migrations /app/backend/migrations
COPY examples /app/examples
COPY plugins/jenkins /app/plugins/jenkins

WORKDIR /app/backend
RUN uv sync --locked --no-dev --all-extras \
    && uv pip install --python .venv/bin/python /app/plugins/jenkins

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
