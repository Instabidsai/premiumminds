FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml ./
RUN pip install --no-cache-dir fastmcp supabase httpx
COPY mcp_groupmind ./mcp_groupmind
CMD ["python", "-m", "mcp_groupmind.server"]
