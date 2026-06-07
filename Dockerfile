# Multi-stage build: compile the React app, then serve it (plus the API) from
# one Python/FastAPI process. Result is a single image = single URL, no CORS.

# ---- Stage 1: build the React frontend ----
FROM node:20 AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/yarn.lock ./
RUN yarn install --frozen-lockfile
COPY frontend/ ./
ENV CI=false
RUN yarn build

# ---- Stage 2: Python backend that also serves the built frontend ----
FROM python:3.11-slim AS backend
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    FRONTEND_BUILD_DIR=/app/frontend/build
WORKDIR /app

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install -r backend/requirements.txt

COPY backend/ ./backend/
COPY --from=frontend /app/frontend/build ./frontend/build

WORKDIR /app/backend
EXPOSE 8000
# Shell form so ${PORT} (set by the host, e.g. Render) is expanded at runtime.
CMD uvicorn server:app --host 0.0.0.0 --port ${PORT:-8000}
