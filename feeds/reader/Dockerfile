FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml ./
RUN pip install --no-cache-dir supabase httpx
COPY reader ./reader
CMD ["python", "-m", "reader.main"]
