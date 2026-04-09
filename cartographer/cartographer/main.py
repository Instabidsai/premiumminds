"""
Cartographer — listens to Supabase realtime for new messages/docs and
forwards them as Graphiti episodes.
"""
import asyncio
import os
import httpx
from supabase import acreate_client, AsyncClient

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
GRAPHITI_MCP_URL = os.environ["GRAPHITI_MCP_URL"]

async def add_episode(client: httpx.AsyncClient, group_id: str, name: str, episode_body: str, source: str = "message") -> None:
    payload = {
        "jsonrpc": "2.0", "id": 1, "method": "tools/call",
        "params": {"name": "add_episode", "arguments": {
            "name": name, "episode_body": episode_body,
            "source": source, "group_id": group_id,
            "source_description": f"groupmind {source}",
        }},
    }
    r = await client.post(GRAPHITI_MCP_URL, json=payload, timeout=60)
    r.raise_for_status()

async def handle_message(sb: AsyncClient, http: httpx.AsyncClient, row: dict) -> None:
    ch = await sb.table("channels").select("slug").eq("id", row["channel_id"]).single().execute()
    group_id = ch.data["slug"]
    author = await sb.table("authors").select("kind,agent_name,member_id").eq("id", row["author_id"]).single().execute()
    if author.data["kind"] == "human":
        who = await sb.table("members").select("handle").eq("id", author.data["member_id"]).single().execute()
        name = who.data["handle"]
    else:
        name = author.data["agent_name"] or "agent"
    body = f"{name}: {row['body']}"
    await add_episode(http, group_id, f"msg:{row['id']}", body, source="message")
    await sb.table("messages").update({"ingested_at": "now()"}).eq("id", row["id"]).execute()

async def handle_doc(sb: AsyncClient, http: httpx.AsyncClient, row: dict) -> None:
    ch = await sb.table("channels").select("slug").eq("id", row["channel_id"]).single().execute()
    group_id = ch.data["slug"]
    text = row.get("extracted_text") or row.get("title")
    await add_episode(http, group_id, f"doc:{row['id']}", text, source="text")
    await sb.table("documents").update({"ingested_at": "now()"}).eq("id", row["id"]).execute()

async def main() -> None:
    sb = await acreate_client(SUPABASE_URL, SUPABASE_KEY)
    async with httpx.AsyncClient() as http:
        channel = sb.realtime.channel("groupmind-cartographer")
        def on_message(payload):
            asyncio.create_task(handle_message(sb, http, payload["new"]))
        def on_doc(payload):
            asyncio.create_task(handle_doc(sb, http, payload["new"]))
        await channel.on_postgres_changes(
            event="INSERT", schema="public", table="messages", callback=on_message
        ).on_postgres_changes(
            event="INSERT", schema="public", table="documents", callback=on_doc
        ).subscribe()
        print("[cartographer] listening...", flush=True)
        while True:
            await asyncio.sleep(3600)

if __name__ == "__main__":
    asyncio.run(main())
