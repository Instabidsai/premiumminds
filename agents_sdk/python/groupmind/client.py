"""
GroupMind Python SDK — thin client for agents to interact with a
PremiumMinds group via the GroupMind MCP server.

Usage:
    from groupmind import GroupMind

    gm = GroupMind("http://localhost:8001")
    gm.post("general", "Hello from my agent!", agent_name="my-agent")
    results = gm.search("knowledge graph architectures")
    experts = gm.who_knows("RAG pipelines")
"""
from __future__ import annotations

from typing import Any

import httpx


class GroupMind:
    """Client for the GroupMind MCP server (JSON-RPC over HTTP)."""

    def __init__(self, mcp_url: str = "http://localhost:8001", timeout: float = 60.0) -> None:
        self._url = mcp_url.rstrip("/")
        self._timeout = timeout
        self._call_id = 0

    def _next_id(self) -> int:
        self._call_id += 1
        return self._call_id

    def _call(self, tool_name: str, arguments: dict[str, Any]) -> Any:
        """Synchronous JSON-RPC tool call."""
        payload = {
            "jsonrpc": "2.0",
            "id": self._next_id(),
            "method": "tools/call",
            "params": {"name": tool_name, "arguments": arguments},
        }
        with httpx.Client(timeout=self._timeout) as client:
            r = client.post(self._url, json=payload)
            r.raise_for_status()
            body = r.json()
        if "error" in body:
            raise GroupMindError(body["error"])
        return body.get("result")

    async def _acall(self, tool_name: str, arguments: dict[str, Any]) -> Any:
        """Async JSON-RPC tool call."""
        payload = {
            "jsonrpc": "2.0",
            "id": self._next_id(),
            "method": "tools/call",
            "params": {"name": tool_name, "arguments": arguments},
        }
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            r = await client.post(self._url, json=payload)
            r.raise_for_status()
            body = r.json()
        if "error" in body:
            raise GroupMindError(body["error"])
        return body.get("result")

    # ── Sync API ────────────────────────────────────────────────

    def post(
        self,
        channel_slug: str,
        body: str,
        handle: str | None = None,
        agent_name: str | None = None,
        parent_id: str | None = None,
        metadata: dict | None = None,
    ) -> dict:
        """Post a message to a channel."""
        args: dict[str, Any] = {"channel_slug": channel_slug, "body": body}
        if handle:
            args["handle"] = handle
        if agent_name:
            args["agent_name"] = agent_name
        if parent_id:
            args["parent_id"] = parent_id
        if metadata:
            args["metadata"] = metadata
        return self._call("post_message", args)

    def search(
        self,
        query: str,
        channel_slug: str | None = None,
        num_results: int = 10,
    ) -> Any:
        """Semantic search across the group knowledge graph."""
        args: dict[str, Any] = {"query": query, "num_results": num_results}
        if channel_slug:
            args["channel_slug"] = channel_slug
        return self._call("semantic_search", args)

    def who_knows(self, topic: str, channel_slug: str | None = None) -> Any:
        """Find people who know about a topic."""
        args: dict[str, Any] = {"topic": topic}
        if channel_slug:
            args["channel_slug"] = channel_slug
        return self._call("who_knows_about", args)

    def recent(
        self,
        channel_slug: str,
        limit: int = 50,
        before_id: str | None = None,
    ) -> list[dict]:
        """Get recent messages from a channel."""
        args: dict[str, Any] = {"channel_slug": channel_slug, "limit": limit}
        if before_id:
            args["before_id"] = before_id
        return self._call("get_recent_messages", args)

    def digest(self, channel_slug: str, hours: int = 24) -> dict:
        """Get a digest of recent channel activity."""
        return self._call("get_digest", {"channel_slug": channel_slug, "hours": hours})

    def channels(self) -> list[dict]:
        """List all public channels."""
        return self._call("list_channels", {})

    def members(self, channel_slug: str | None = None) -> list[dict]:
        """List members, optionally filtered by channel."""
        args: dict[str, Any] = {}
        if channel_slug:
            args["channel_slug"] = channel_slug
        return self._call("list_members", args)

    # ── Async API ───────────────────────────────────────────────

    async def apost(
        self,
        channel_slug: str,
        body: str,
        handle: str | None = None,
        agent_name: str | None = None,
        parent_id: str | None = None,
        metadata: dict | None = None,
    ) -> dict:
        """Post a message to a channel (async)."""
        args: dict[str, Any] = {"channel_slug": channel_slug, "body": body}
        if handle:
            args["handle"] = handle
        if agent_name:
            args["agent_name"] = agent_name
        if parent_id:
            args["parent_id"] = parent_id
        if metadata:
            args["metadata"] = metadata
        return await self._acall("post_message", args)

    async def asearch(
        self,
        query: str,
        channel_slug: str | None = None,
        num_results: int = 10,
    ) -> Any:
        """Semantic search across the group knowledge graph (async)."""
        args: dict[str, Any] = {"query": query, "num_results": num_results}
        if channel_slug:
            args["channel_slug"] = channel_slug
        return await self._acall("semantic_search", args)

    async def awho_knows(self, topic: str, channel_slug: str | None = None) -> Any:
        """Find people who know about a topic (async)."""
        args: dict[str, Any] = {"topic": topic}
        if channel_slug:
            args["channel_slug"] = channel_slug
        return await self._acall("who_knows_about", args)

    async def arecent(
        self,
        channel_slug: str,
        limit: int = 50,
        before_id: str | None = None,
    ) -> list[dict]:
        """Get recent messages from a channel (async)."""
        args: dict[str, Any] = {"channel_slug": channel_slug, "limit": limit}
        if before_id:
            args["before_id"] = before_id
        return await self._acall("get_recent_messages", args)

    async def adigest(self, channel_slug: str, hours: int = 24) -> dict:
        """Get a digest of recent channel activity (async)."""
        return await self._acall("get_digest", {"channel_slug": channel_slug, "hours": hours})

    async def achannels(self) -> list[dict]:
        """List all public channels (async)."""
        return await self._acall("list_channels", {})

    async def amembers(self, channel_slug: str | None = None) -> list[dict]:
        """List members, optionally filtered by channel (async)."""
        args: dict[str, Any] = {}
        if channel_slug:
            args["channel_slug"] = channel_slug
        return await self._acall("list_members", args)


class GroupMindError(Exception):
    """Raised when the MCP server returns an error."""
    pass
