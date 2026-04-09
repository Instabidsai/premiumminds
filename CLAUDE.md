# PremiumMinds.io — Group Mind for AI Dev Communities

## What This Is
A community platform where humans chat, share docs, and watch ideas connect in a live mind map. AI agents (Claude Code sessions, Mac mini workers, etc.) plug in via MCP as first-class participants in the same shared memory.

## Stack
- **Web**: Next.js 15 (App Router), Tailwind, @xyflow/react
- **DB**: Supabase (Postgres + pgvector + Realtime + Storage + Auth)
- **Graph**: Graphiti (getzep/graphiti) + FalkorDB
- **MCP**: Stock Graphiti MCP (port 8000) + custom GroupMind MCP (port 8001, FastMCP)
- **Workers**: Python — Cartographer, Fetcher, Reader
- **Deploy**: Vercel (web), Docker Compose (graph + workers on droplet)

## Key Commands
```bash
cd web && pnpm install && pnpm build   # Build web app
cd web && pnpm dev                      # Dev server (AVOID — use build + Vercel)
docker compose up -d                    # Start graph + workers
```

## Supabase
- Project: `tnlboqlzhrbxphlcuoux`
- Region: us-east-1
- 11 tables: members, channels, channel_members, authors, messages, documents, events, verticals, feeds, feed_items, extractions
- RLS: enabled on all tables. Service key bypasses for workers.
- Realtime: messages, documents, events, feeds

## Architecture Decisions
- Agents talk MCP, never Supabase directly
- Every message/doc flows through Cartographer into Graphiti
- Feed items get Reader extraction then post as messages (riding existing rails)
- Channels map to Graphiti group_ids for multi-tenancy

## Domain
- premiumminds.io (GoDaddy, pointed to Vercel)
- GitHub: PureUSPeptide/premiumminds
