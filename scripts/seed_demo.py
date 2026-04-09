"""
Seed demo data: a test member, an agent author, and a few messages.
Run: python scripts/seed_demo.py
"""
import os
from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

sb = create_client(SUPABASE_URL, SUPABASE_KEY)


def seed():
    # Create a system member for agents
    system = sb.table("members").upsert({
        "handle": "system",
        "display_name": "System",
        "bio": "PremiumMinds system account",
    }, on_conflict="handle").execute()
    system_id = system.data[0]["id"]

    # Create reader agent author
    sb.table("authors").upsert({
        "kind": "agent",
        "agent_name": "groupmind.reader",
        "agent_owner": system_id,
    }, on_conflict="agent_name").execute()

    # Create cartographer agent author
    sb.table("authors").upsert({
        "kind": "agent",
        "agent_name": "groupmind.cartographer",
        "agent_owner": system_id,
    }, on_conflict="agent_name").execute()

    print("✅ Demo data seeded")
    print(f"   System member: {system_id}")

    # List channels
    channels = sb.table("channels").select("slug,name").execute()
    print(f"   Channels: {len(channels.data)}")
    for ch in channels.data:
        print(f"     #{ch['slug']} — {ch['name']}")


if __name__ == "__main__":
    seed()
