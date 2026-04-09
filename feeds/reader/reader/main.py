"""
Feed Reader — processes unprocessed feed_items using Anthropic's Claude Haiku.

For each unprocessed item, runs all enabled verticals' extraction prompts,
stores results in the extractions table, and posts a formatted summary message
to the feed's target channel. The Cartographer picks it up from there.

Required tables (create via migration):
  verticals(id uuid PK, name text, slug text UNIQUE, extraction_prompt text,
            enabled bool, created_at timestamptz)
  extractions(id uuid PK, feed_item_id uuid FK, vertical_id uuid FK,
              result jsonb, created_at timestamptz)
  feeds.channel_id — FK to channels (where summaries get posted)
"""
from __future__ import annotations

import asyncio
import json
import os
from typing import Any

import httpx
from supabase import acreate_client, AsyncClient

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
ANTHROPIC_API_KEY = os.environ["ANTHROPIC_API_KEY"]

MODEL = "claude-haiku-4-5-20251001"
ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
BATCH_SIZE = int(os.environ.get("READER_BATCH_SIZE", "10"))
POLL_INTERVAL = int(os.environ.get("READER_POLL_INTERVAL", "30"))


# ── LLM Call ────────────────────────────────────────────────────

async def call_haiku(
    http: httpx.AsyncClient,
    system_prompt: str,
    user_content: str,
    max_tokens: int = 1024,
) -> str:
    """Call Claude Haiku via the Anthropic Messages API."""
    headers = {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    payload = {
        "model": MODEL,
        "max_tokens": max_tokens,
        "system": system_prompt,
        "messages": [{"role": "user", "content": user_content}],
    }
    r = await http.post(ANTHROPIC_API_URL, headers=headers, json=payload, timeout=60)
    r.raise_for_status()
    body = r.json()
    # Extract text from content blocks
    content_blocks = body.get("content", [])
    texts = [b["text"] for b in content_blocks if b.get("type") == "text"]
    return "\n".join(texts)


# ── Extraction ──────────────────────────────────────────────────

async def extract_for_vertical(
    http: httpx.AsyncClient,
    item: dict,
    vertical: dict,
) -> dict[str, Any]:
    """Run a vertical's extraction prompt against a feed item."""
    system_prompt = vertical["extraction_prompt"]
    user_content = f"""Title: {item.get('title', '')}
Author: {item.get('author', '')}
URL: {item.get('url', '')}
Published: {item.get('published_at', '')}

Content:
{item.get('body', '')}"""

    raw_result = await call_haiku(http, system_prompt, user_content)

    # Try to parse as JSON; fall back to raw text
    try:
        parsed = json.loads(raw_result)
    except (json.JSONDecodeError, TypeError):
        parsed = {"summary": raw_result}

    return parsed


# ── Summary Formatter ───────────────────────────────────────────

def format_summary(item: dict, extractions: list[dict[str, Any]]) -> str:
    """Format a feed item and its extractions into a channel message."""
    parts: list[str] = []
    parts.append(f"**{item.get('title', 'Untitled')}**")
    if item.get("author"):
        parts.append(f"by {item['author']}")
    if item.get("url"):
        parts.append(f"Link: {item['url']}")
    parts.append("")

    for ext in extractions:
        vertical_name = ext.get("vertical_name", "Analysis")
        result = ext.get("result", {})
        if isinstance(result, dict):
            summary = result.get("summary", json.dumps(result, indent=2))
        else:
            summary = str(result)
        parts.append(f"**{vertical_name}:**")
        parts.append(summary)
        parts.append("")

    return "\n".join(parts).strip()


# ── Post to Channel ─────────────────────────────────────────────

async def post_to_channel(
    sb: AsyncClient, channel_id: str, body: str
) -> None:
    """Post a formatted summary to a channel as the 'feed-reader' agent."""
    # Resolve or create the feed-reader agent author
    existing = (
        await sb.table("authors")
        .select("id")
        .eq("kind", "agent")
        .eq("agent_name", "feed-reader")
        .maybe_single()
        .execute()
    )
    if existing.data:
        author_id = existing.data["id"]
    else:
        created = (
            await sb.table("authors")
            .insert({"kind": "agent", "agent_name": "feed-reader"})
            .execute()
        )
        author_id = created.data[0]["id"]

    await sb.table("messages").insert(
        {
            "channel_id": channel_id,
            "author_id": author_id,
            "body": body,
            "metadata": {"source": "feed-reader"},
        }
    ).execute()


# ── Processing Loop ─────────────────────────────────────────────

async def process_batch(sb: AsyncClient, http: httpx.AsyncClient) -> int:
    """Process a batch of unprocessed feed items. Returns count processed."""
    # Get unprocessed items (processed_at is null)
    items_result = (
        await sb.table("feed_items")
        .select("*")
        .is_("processed_at", "null")
        .order("created_at")
        .limit(BATCH_SIZE)
        .execute()
    )
    items = items_result.data
    if not items:
        return 0

    # Get all enabled verticals
    verticals_result = (
        await sb.table("verticals")
        .select("*")
        .eq("enabled", True)
        .execute()
    )
    verticals = verticals_result.data
    if not verticals:
        print("[reader] no enabled verticals found — marking items as processed", flush=True)
        for item in items:
            await sb.table("feed_items").update({"processed_at": "now()"}).eq("id", item["id"]).execute()
        return len(items)

    processed = 0
    for item in items:
        item_extractions: list[dict[str, Any]] = []

        for vertical in verticals:
            try:
                result = await extract_for_vertical(http, item, vertical)
            except Exception as e:
                print(f"[reader] extraction error for item {item['id']}, vertical {vertical['slug']}: {e}", flush=True)
                result = {"error": str(e)}

            # Store extraction
            try:
                await sb.table("extractions").insert(
                    {
                        "feed_item_id": item["id"],
                        "vertical_id": vertical["id"],
                        "result": result,
                    }
                ).execute()
            except Exception as e:
                print(f"[reader] failed to store extraction: {e}", flush=True)

            item_extractions.append({
                "vertical_name": vertical.get("name", vertical["slug"]),
                "result": result,
            })

        # Post formatted summary to the feed's channel
        feed_result = (
            await sb.table("feeds")
            .select("channel_id")
            .eq("id", item["feed_id"])
            .single()
            .execute()
        )
        channel_id = feed_result.data.get("channel_id")
        if channel_id:
            summary = format_summary(item, item_extractions)
            try:
                await post_to_channel(sb, channel_id, summary)
            except Exception as e:
                print(f"[reader] failed to post summary for item {item['id']}: {e}", flush=True)

        # Mark item as processed
        await sb.table("feed_items").update({"processed_at": "now()"}).eq("id", item["id"]).execute()
        processed += 1

    return processed


async def main() -> None:
    sb = await acreate_client(SUPABASE_URL, SUPABASE_KEY)
    async with httpx.AsyncClient() as http:
        print(f"[reader] starting processing loop (poll every {POLL_INTERVAL}s, batch {BATCH_SIZE})", flush=True)
        while True:
            try:
                count = await process_batch(sb, http)
                if count:
                    print(f"[reader] processed {count} items", flush=True)
            except Exception as e:
                print(f"[reader] cycle error: {e}", flush=True)
            await asyncio.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    asyncio.run(main())
