# The engine HTTP service (api.py) for the web app.   podman build -t ght-engine model/
# Runs in lite mode: needs models/ (committed) and, for /portfolio, reports/cache/portfolio.parquet (built locally, not committed).
FROM docker.io/library/python:3.13-slim

RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/*
COPY --from=ghcr.io/astral-sh/uv:0.9.5 /uv /usr/local/bin/uv

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never PYTHONUNBUFFERED=1
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY api.py ./
COPY greenhome ./greenhome
COPY models ./models
COPY reports ./reports

RUN useradd --system --uid 1001 engine && chown -R engine /app/reports
USER engine
ENV PATH="/app/.venv/bin:$PATH"
EXPOSE 8000
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]
