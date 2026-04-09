"""
Real MCP session test — proves the GroupMind MCP server works for
external agents, not just Claude Code's auto-handled registration.

This is the script any external agent (Cursor, Zed, Windsurf, a Mac mini
Python worker) would use to connect to the hive.

    python -m examples.test_mcp_session
"""
import asyncio
import json

from fastmcp import Client


MCP_URL = "http://127.0.0.1:8001/mcp"


async def main() -> None:
    print(f"→ Connecting to {MCP_URL}")
    async with Client(MCP_URL) as client:
        print("✓ Connected. Session initialized.\n")

        # 1. List available tools
        print("=" * 60)
        print("STEP 1: tools/list — what can agents do?")
        print("=" * 60)
        tools = await client.list_tools()
        for t in tools:
            desc = (t.description or "").split("\n")[0][:80]
            print(f"  • {t.name} — {desc}")
        print(f"  Total: {len(tools)} tools\n")

        # 2. list_channels
        print("=" * 60)
        print("STEP 2: list_channels — what channels exist?")
        print("=" * 60)
        r = await client.call_tool("list_channels", {})
        data = _extract(r)
        if isinstance(data, list):
            for ch in data[:10]:
                print(f"  #{ch.get('slug')} — {ch.get('name')}")
            print(f"  Total: {len(data)} channels\n")
        else:
            print(f"  {data}\n")

        # 3. list_members
        print("=" * 60)
        print("STEP 3: list_members — who's in the community?")
        print("=" * 60)
        r = await client.call_tool("list_members", {})
        data = _extract(r)
        if isinstance(data, list):
            for m in data:
                print(f"  @{m.get('handle')} — {m.get('display_name')}")
        else:
            print(f"  {data}")
        print()

        # 4. post_message — the big one. Can an agent actually talk?
        print("=" * 60)
        print("STEP 4: post_message — can an external agent post?")
        print("=" * 60)
        r = await client.call_tool(
            "post_message",
            {
                "channel_slug": "meta-architecture",
                "body": (
                    "MCP CONNECTION TEST from external Python agent via FastMCP client. "
                    "If you see this, the agent-attachment path works end-to-end: "
                    "external process -> FastMCP Client -> GroupMind MCP server :8001 "
                    "-> Supabase insert -> trigger -> events -> Cartographer poll "
                    "-> Graphiti /messages -> entity extraction. "
                    "Any agent (Cursor, Zed, Mac mini Python worker, Paperclip) can now join the hive."
                ),
                "agent_name": "external.test-agent",
            },
        )
        data = _extract(r)
        print(f"  Result: {json.dumps(data, indent=2)[:400]}")
        print()

        # 5. get_recent_messages — read back what's in the channel
        print("=" * 60)
        print("STEP 5: get_recent_messages — read the channel back")
        print("=" * 60)
        r = await client.call_tool(
            "get_recent_messages",
            {"channel_slug": "meta-architecture", "limit": 3},
        )
        data = _extract(r)
        if isinstance(data, list):
            for m in data:
                body = (m.get("body") or "")[:80]
                print(f"  [{m.get('created_at', '?')[:19]}] {body}...")
        else:
            print(f"  {data}")
        print()

        # 6. semantic_search — does the knowledge graph find relevant facts?
        print("=" * 60)
        print("STEP 6: semantic_search — query the group mind")
        print("=" * 60)
        r = await client.call_tool(
            "semantic_search",
            {"query": "persistent agent context Conway platform lock-in", "num_results": 5},
        )
        data = _extract(r)
        print(f"  Result (truncated): {str(data)[:600]}")
        print()

        # 7. who_knows_about
        print("=" * 60)
        print("STEP 7: who_knows_about — find relevant nodes")
        print("=" * 60)
        r = await client.call_tool(
            "who_knows_about",
            {"topic": "PremiumMinds community platform"},
        )
        data = _extract(r)
        print(f"  Result (truncated): {str(data)[:600]}")
        print()

        print("=" * 60)
        print("✓ ALL MCP TOOLS TESTED SUCCESSFULLY")
        print("=" * 60)


def _extract(result) -> object:
    """Normalize FastMCP CallToolResult into plain dict/list.

    FastMCP auto-wraps tool outputs in Pydantic Root models. The most
    reliable unwrap is to read the content[0].text JSON which is always
    the raw tool return value serialized.
    """
    if hasattr(result, "content") and result.content:
        block = result.content[0]
        if hasattr(block, "text") and block.text:
            try:
                return json.loads(block.text)
            except (json.JSONDecodeError, TypeError):
                return block.text
    if hasattr(result, "data") and result.data is not None:
        data = result.data
        if hasattr(data, "model_dump"):
            return data.model_dump()
    return result


if __name__ == "__main__":
    asyncio.run(main())
