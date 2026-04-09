"""
Cartographer — polls the events table for new messages/docs and forwards
them to Graphiti. Polling (not realtime) for reliability across Docker/
network configurations.

The events table is written by Postgres triggers on messages + documents,
so every insert shows up as an event row. We track a high-water mark and
advance it each cycle.
"""
import asyncio
import os
import sys
import traceback
import httpx

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
GRAPHITI_URL = os.environ["GRAPHITI_MCP_URL"].rstrip("/")
POLL_INTERVAL = int(os.environ.get("CARTOGRAPHER_POLL_SECONDS", "5"))

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}


async def sb_get(http: httpx.AsyncClient, path: str, params: dict) -> list:
    r = await http.get(f"{SUPABASE_URL}/rest/v1/{path}", params=params, headers=HEADERS, timeout=30)
    r.raise_for_status()
    return r.json()


async def sb_patch(http: httpx.AsyncClient, path: str, params: dict, body: dict) -> None:
    r = await http.patch(
        f"{SUPABASE_URL}/rest/v1/{path}", params=params, headers=HEADERS, json=body, timeout=30
    )
    r.raise_for_status()


async def graphiti_add_message(http: httpx.AsyncClient, group_id: str, content: str) -> None:
    """Send a message to the Graphiti /messages endpoint for episode processing."""
    payload = {
        "group_id": group_id,
        "messages": [{"role": "user", "role_type": "user", "content": content}],
    }
    r = await http.post(f"{GRAPHITI_URL}/messages", json=payload, timeout=60)
    r.raise_for_status()


async def handle_message_event(http: httpx.AsyncClient, payload: dict) -> None:
    message_id = payload["message_id"]
    channel_id = payload["channel_id"]
    author_id = payload["author_id"]
    body = payload["body"]

    # Resolve channel slug + author name
    channels = await sb_get(http, "channels", {"id": f"eq.{channel_id}", "select": "slug"})
    if not channels:
        return
    group_id = channels[0]["slug"]

    authors = await sb_get(http, "authors", {"id": f"eq.{author_id}", "select": "kind,agent_name,member_id"})
    if not authors:
        name = "unknown"
    else:
        a = authors[0]
        if a["kind"] == "human" and a.get("member_id"):
            members = await sb_get(http, "members", {"id": f"eq.{a['member_id']}", "select": "handle"})
            name = members[0]["handle"] if members else "unknown"
        else:
            name = a.get("agent_name") or "agent"

    await graphiti_add_message(http, group_id, f"{name}: {body}")
    await sb_patch(http, "messages", {"id": f"eq.{message_id}"}, {"ingested_at": "now()"})
    print(f"[cartographer] ingested msg:{message_id[:8]} into #{group_id}", flush=True)


async def handle_doc_event(http: httpx.AsyncClient, payload: dict) -> None:
    doc_id = payload["doc_id"]
    channel_id = payload["channel_id"]
    title = payload.get("title") or "untitled"

    channels = await sb_get(http, "channels", {"id": f"eq.{channel_id}", "select": "slug"})
    if not channels:
        return
    group_id = channels[0]["slug"]

    docs = await sb_get(http, "documents", {"id": f"eq.{doc_id}", "select": "extracted_text,title"})
    text = (docs[0].get("extracted_text") if docs else None) or title

    await graphiti_add_message(http, group_id, f"[doc: {title}] {text[:4000]}")
    await sb_patch(http, "documents", {"id": f"eq.{doc_id}"}, {"ingested_at": "now()"})
    print(f"[cartographer] ingested doc:{doc_id[:8]} into #{group_id}", flush=True)


async def main() -> None:
    print(f"[cartographer] polling mode, interval={POLL_INTERVAL}s", flush=True)
    print(f"[cartographer] supabase={SUPABASE_URL}", flush=True)
    print(f"[cartographer] graphiti={GRAPHITI_URL}", flush=True)

    # Initialize high-water mark to the current max event id so we don't
    # re-process historical events on startup.
    async with httpx.AsyncClient() as http:
        try:
            existing = await sb_get(
                http,
                "events",
                {"select": "id", "order": "id.desc", "limit": "1"},
            )
            last_id = existing[0]["id"] if existing else 0
        except Exception as e:
            print(f"[cartographer] init error: {e}", flush=True)
            last_id = 0

        print(f"[cartographer] starting from event id > {last_id}", flush=True)

        while True:
            try:
                events = await sb_get(
                    http,
                    "events",
                    {
                        "select": "id,kind,payload",
                        "id": f"gt.{last_id}",
                        "order": "id.asc",
                        "limit": "50",
                    },
                )
                for evt in events:
                    try:
                        if evt["kind"] == "message.created":
                            await handle_message_event(http, evt["payload"])
                        elif evt["kind"] == "doc.created":
                            await handle_doc_event(http, evt["payload"])
                        last_id = evt["id"]
                    except Exception as e:
                        print(f"[cartographer] event {evt['id']} failed: {e}", flush=True)
                        traceback.print_exc(file=sys.stdout)
                        # Advance anyway so we don't get stuck on a bad event
                        last_id = evt["id"]
            except Exception as e:
                print(f"[cartographer] poll error: {e}", flush=True)
            await asyncio.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    asyncio.run(main())
