"""
GroupMind MCP Server — exposes chat, search, and knowledge-graph tools
for agents connecting to a PremiumMinds group.

Runs on port 8001 with streamable-http transport.
"""
from __future__ import annotations

import os
from typing import Any

import httpx
from fastmcp import FastMCP
from supabase import create_client, Client

# ── Config ──────────────────────────────────────────────────────
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
GRAPHITI_MCP_URL = os.environ["GRAPHITI_MCP_URL"]

sb: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
mcp = FastMCP("groupmind")

# ── Helpers ─────────────────────────────────────────────────────

def _graphiti_search(query: str, group_ids: list[str] | None = None, num_results: int = 10) -> dict:
    """Call the Graphiti REST /search endpoint.

    Graphiti is a FastAPI REST service (zepai/graphiti image), not an MCP
    server. The endpoint shape is POST /search {query, num_results, group_ids}
    returning {facts: [{uuid,name,fact,source_node_uuid,target_node_uuid,valid_at,...}]}.
    """
    body: dict[str, Any] = {"query": query, "num_results": num_results}
    if group_ids:
        body["group_ids"] = group_ids
    with httpx.Client(timeout=60) as client:
        r = client.post(f"{GRAPHITI_MCP_URL.rstrip('/')}/search", json=body)
        if r.status_code >= 400:
            return {"facts": [], "error": f"graphiti {r.status_code}: {r.text[:200]}"}
        return r.json()


def _graphiti_episodes(group_id: str, last_n: int = 100) -> list[dict]:
    """Call Graphiti REST GET /episodes/{group_id}."""
    with httpx.Client(timeout=60) as client:
        r = client.get(f"{GRAPHITI_MCP_URL.rstrip('/')}/episodes/{group_id}?last_n={last_n}")
        if r.status_code >= 400:
            return []
        data = r.json()
        return data if isinstance(data, list) else data.get("episodes", [])


def _resolve_author_id(handle: str | None, agent_name: str | None) -> str:
    """Get or create an author row for a human handle or agent name.

    Uses plain .execute() (not .maybe_single()) because maybe_single() can
    return None in supabase-py 2.x when no row is found, which crashes
    attribute access.
    """
    if handle:
        member_rows = (
            sb.table("members")
            .select("id")
            .eq("handle", handle)
            .limit(1)
            .execute()
        )
        if not member_rows.data:
            raise ValueError(f"Member with handle '{handle}' not found")
        member_id = member_rows.data[0]["id"]

        existing = (
            sb.table("authors")
            .select("id")
            .eq("kind", "human")
            .eq("member_id", member_id)
            .limit(1)
            .execute()
        )
        if existing.data:
            return existing.data[0]["id"]
        created = (
            sb.table("authors")
            .insert({"kind": "human", "member_id": member_id})
            .execute()
        )
        return created.data[0]["id"]

    if agent_name:
        existing = (
            sb.table("authors")
            .select("id")
            .eq("kind", "agent")
            .eq("agent_name", agent_name)
            .limit(1)
            .execute()
        )
        if existing.data:
            return existing.data[0]["id"]
        created = (
            sb.table("authors")
            .insert({"kind": "agent", "agent_name": agent_name})
            .execute()
        )
        return created.data[0]["id"]

    raise ValueError("Either handle or agent_name is required")


# ── Tools ───────────────────────────────────────────────────────


@mcp.tool()
def list_channels() -> list[dict]:
    """List all public channels in the group."""
    result = (
        sb.table("channels")
        .select("id,slug,name,description,is_private")
        .eq("is_private", False)
        .order("name")
        .execute()
    )
    return result.data


@mcp.tool()
def list_members(channel_slug: str | None = None) -> list[dict]:
    """List members. Optionally filter by channel slug."""
    if channel_slug:
        ch = (
            sb.table("channels")
            .select("id")
            .eq("slug", channel_slug)
            .single()
            .execute()
        )
        cm = (
            sb.table("channel_members")
            .select("member_id")
            .eq("channel_id", ch.data["id"])
            .execute()
        )
        member_ids = [r["member_id"] for r in cm.data]
        if not member_ids:
            return []
        result = (
            sb.table("members")
            .select("id,handle,display_name,bio,avatar_url")
            .in_("id", member_ids)
            .execute()
        )
        return result.data

    result = (
        sb.table("members")
        .select("id,handle,display_name,bio,avatar_url")
        .order("handle")
        .execute()
    )
    return result.data


@mcp.tool()
def post_message(
    channel_slug: str,
    body: str,
    handle: str | None = None,
    agent_name: str | None = None,
    parent_id: str | None = None,
    metadata: dict | None = None,
) -> dict:
    """Post a message to a channel. Supply either handle (human) or agent_name (agent)."""
    ch = (
        sb.table("channels")
        .select("id")
        .eq("slug", channel_slug)
        .single()
        .execute()
    )
    author_id = _resolve_author_id(handle, agent_name)

    row: dict[str, Any] = {
        "channel_id": ch.data["id"],
        "author_id": author_id,
        "body": body,
    }
    if parent_id:
        row["parent_id"] = parent_id
    if metadata:
        row["metadata"] = metadata

    result = sb.table("messages").insert(row).execute()
    return result.data[0]


@mcp.tool()
def get_recent_messages(
    channel_slug: str, limit: int = 50, before_id: str | None = None
) -> list[dict]:
    """Get recent messages from a channel, newest first. Supports cursor pagination via before_id."""
    ch = (
        sb.table("channels")
        .select("id")
        .eq("slug", channel_slug)
        .single()
        .execute()
    )
    query = (
        sb.table("messages")
        .select("id,body,author_id,parent_id,metadata,created_at")
        .eq("channel_id", ch.data["id"])
        .order("created_at", desc=True)
        .limit(limit)
    )
    if before_id:
        # Fetch the timestamp of the cursor message for keyset pagination
        cursor = (
            sb.table("messages")
            .select("created_at")
            .eq("id", before_id)
            .single()
            .execute()
        )
        query = query.lt("created_at", cursor.data["created_at"])

    result = query.execute()

    # Hydrate author info
    messages = result.data
    if not messages:
        return []

    author_ids = list({m["author_id"] for m in messages})
    authors_result = (
        sb.table("authors")
        .select("id,kind,agent_name,member_id")
        .in_("id", author_ids)
        .execute()
    )
    author_map: dict[str, dict] = {a["id"]: a for a in authors_result.data}

    # Fetch member handles for human authors
    member_ids = [
        a["member_id"]
        for a in authors_result.data
        if a["kind"] == "human" and a["member_id"]
    ]
    member_map: dict[str, str] = {}
    if member_ids:
        members_result = (
            sb.table("members")
            .select("id,handle")
            .in_("id", member_ids)
            .execute()
        )
        member_map = {m["id"]: m["handle"] for m in members_result.data}

    for msg in messages:
        author = author_map.get(msg["author_id"], {})
        if author.get("kind") == "human":
            msg["author"] = member_map.get(author.get("member_id", ""), "unknown")
            msg["author_kind"] = "human"
        else:
            msg["author"] = author.get("agent_name", "agent")
            msg["author_kind"] = "agent"
        del msg["author_id"]

    return messages


@mcp.tool()
def semantic_search(query: str, channel_slug: str | None = None, num_results: int = 10) -> Any:
    """Search the group knowledge graph for semantically related content.

    Uses Graphiti's REST /search endpoint. Optionally scope to a channel.
    Returns facts with source/target node UUIDs, fact text, and temporal windows.
    """
    group_ids = [channel_slug] if channel_slug else None
    return _graphiti_search(query, group_ids=group_ids, num_results=num_results)


@mcp.tool()
def who_knows_about(topic: str, channel_slug: str | None = None) -> Any:
    """Find people (human or agent) who have discussed a topic.

    Searches the knowledge graph for facts related to the topic, then
    cross-references with message authors for broader coverage.
    """
    group_ids = [channel_slug] if channel_slug else None
    edges = _graphiti_search(topic, group_ids=group_ids, num_results=20)

    # Also search message bodies directly for broader coverage
    query_builder = (
        sb.table("messages")
        .select("author_id,body,created_at")
        .ilike("body", f"%{topic}%")
        .order("created_at", desc=True)
        .limit(20)
    )
    if channel_slug:
        ch = (
            sb.table("channels")
            .select("id")
            .eq("slug", channel_slug)
            .single()
            .execute()
        )
        query_builder = query_builder.eq("channel_id", ch.data["id"])

    msg_result = query_builder.execute()

    # Collect unique authors
    author_ids = list({m["author_id"] for m in msg_result.data})
    if not author_ids:
        return {"graph_results": edges, "message_authors": []}

    authors_result = (
        sb.table("authors")
        .select("id,kind,agent_name,member_id")
        .in_("id", author_ids)
        .execute()
    )
    member_ids = [
        a["member_id"] for a in authors_result.data if a["kind"] == "human" and a["member_id"]
    ]
    member_map: dict[str, str] = {}
    if member_ids:
        members_result = (
            sb.table("members")
            .select("id,handle")
            .in_("id", member_ids)
            .execute()
        )
        member_map = {m["id"]: m["handle"] for m in members_result.data}

    people: list[dict] = []
    seen: set[str] = set()
    for author in authors_result.data:
        if author["kind"] == "human":
            name = member_map.get(author.get("member_id", ""), "unknown")
        else:
            name = author.get("agent_name", "agent")
        if name not in seen:
            seen.add(name)
            # Count mentions
            mention_count = sum(
                1 for m in msg_result.data if m["author_id"] == author["id"]
            )
            people.append(
                {"name": name, "kind": author["kind"], "mention_count": mention_count}
            )

    people.sort(key=lambda p: p["mention_count"], reverse=True)
    return {"graph_results": edges, "message_authors": people}


@mcp.tool()
def get_digest(channel_slug: str, hours: int = 24) -> dict:
    """Get a digest of recent activity in a channel.

    Returns message count, active authors, and top topics from the knowledge graph.
    """
    from datetime import datetime, timedelta, timezone

    ch = (
        sb.table("channels")
        .select("id,name")
        .eq("slug", channel_slug)
        .single()
        .execute()
    )

    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()

    messages = (
        sb.table("messages")
        .select("id,author_id,body,created_at")
        .eq("channel_id", ch.data["id"])
        .gte("created_at", since)
        .order("created_at", desc=True)
        .execute()
    )

    msg_count = len(messages.data)
    if msg_count == 0:
        return {
            "channel": ch.data["name"],
            "hours": hours,
            "message_count": 0,
            "active_authors": [],
            "top_topics": [],
        }

    # Unique authors
    author_ids = list({m["author_id"] for m in messages.data})
    authors_result = (
        sb.table("authors")
        .select("id,kind,agent_name,member_id")
        .in_("id", author_ids)
        .execute()
    )
    member_ids = [
        a["member_id"] for a in authors_result.data if a["kind"] == "human" and a["member_id"]
    ]
    member_map: dict[str, str] = {}
    if member_ids:
        members_result = (
            sb.table("members")
            .select("id,handle")
            .in_("id", member_ids)
            .execute()
        )
        member_map = {m["id"]: m["handle"] for m in members_result.data}

    active_authors: list[str] = []
    for a in authors_result.data:
        if a["kind"] == "human":
            active_authors.append(member_map.get(a.get("member_id", ""), "unknown"))
        else:
            active_authors.append(a.get("agent_name", "agent"))

    # Top topics via Graphiti — get recent episode entities
    try:
        top_topics = _graphiti_search(
            f"recent topics in {channel_slug}",
            group_ids=[channel_slug],
            num_results=5,
        )
    except Exception:
        top_topics = []

    return {
        "channel": ch.data["name"],
        "hours": hours,
        "message_count": msg_count,
        "active_authors": active_authors,
        "top_topics": top_topics,
    }


@mcp.tool()
def subscribe_channel_hint(channel_slug: str, agent_name: str) -> dict:
    """Register an agent's interest in a channel.

    This is a hint for the system — agents calling this will receive
    messages from this channel when the orchestration layer dispatches them.
    The hint is stored as metadata in the events table.
    """
    ch = (
        sb.table("channels")
        .select("id")
        .eq("slug", channel_slug)
        .single()
        .execute()
    )
    sb.table("events").insert(
        {
            "kind": "agent.subscribe_hint",
            "payload": {
                "channel_id": ch.data["id"],
                "channel_slug": channel_slug,
                "agent_name": agent_name,
            },
        }
    ).execute()
    return {"status": "subscribed", "channel": channel_slug, "agent": agent_name}


# ── Entrypoint ──────────────────────────────────────────────────

if __name__ == "__main__":
    mcp.run(transport="streamable-http", host="0.0.0.0", port=8001)
