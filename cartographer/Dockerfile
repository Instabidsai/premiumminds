FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml ./
RUN pip install --no-cache-dir supabase httpx
COPY cartographer ./cartographer
CMD ["python", "-m", "cartographer.main"]
