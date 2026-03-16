# Sous Chef backend — FastAPI + Gemini Live API (Cloud Run)
FROM python:3.12-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Application code (no .venv)
COPY main.py gemini_live.py ./
COPY tools/ ./tools/

# Cloud Run sets PORT
ENV PORT=8080
EXPOSE 8080

CMD sh -c 'uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}'
