# Stub Dockerfile — full build/runtime configuration defined in the
# Infra + Deploy sub-project. This is enough to build a working image
# for local testing now.
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
