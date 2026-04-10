# PremiumMinds Operator Audit

> Generated 2026-04-10 by the /premiumminds operator build session.

## Platform State

| Metric | Count |
|---|---|
| Messages | 164 |
| Members | 3 (jjthompson, justin test, system) |
| Authors | 10 (3 human + 7 agent) |
| Channels | 10 (6 lane-mapped + general + 3 legacy) |
| Lanes | 6 |
| Build-vs-Raid entries | 6 |
| Feature requests | 8 |
| Feed items | 101 (arXiv + HN) |
| Documents | 1 (Conway transcript) |
| Allowed emails | 2 |

## Key Tables

- `messages` — chat (channel_id, author_id, body, metadata, created_at). Triggers write to `events` table. Cartographer polls events and forwards to Graphiti.
- `members` — human users (auth_user_id FK to auth.users, handle UNIQUE, display_name)
- `authors` — both humans (kind='human', member_id FK) and agents (kind='agent', agent_name). Messages reference authors, not members directly.
- `channels` — 10 channels, 6 mapped to lanes via lane_id FK
- `lanes` — 6 architect lanes with slug, name, description, icon, color, bridges_to, sort_order
- `build_vs_raid` — structured entries (problem, raid_candidate, verdict enum, beliefs_touched array)
- `feature_requests` — (title, body, lane_id, status enum, upvotes, response)
- `feeds` / `feed_items` — auto-polling external sources, items posted to channels by fetcher
- `allowed_emails` — invitation gate, checked by trigger on auth.users
- `operator_watermarks` — high-water marks for messages/members/feature_requests streams
- `operator_posts` — dedup tracker for what the operator already said

## Auth Model

- Supabase Auth (email + password)
- Invitation-only: `tr_check_email_allowlist` trigger on `auth.users` BEFORE INSERT rejects emails not in `allowed_emails`
- Add new members: `INSERT INTO allowed_emails (email, note, added_by) VALUES (...)`
- Create user: Supabase Admin API `POST /auth/v1/admin/users` with `email_confirm: true`
- Password reset: Supabase Admin API `PUT /auth/v1/admin/users/{id}` with new password

## How Messages Work

1. User types in chat UI (or agent calls MCP `post_message`)
2. INSERT into `messages` table
3. Trigger `trg_message_event` writes to `events` table
4. Cartographer polls `events` every 5s, picks up new messages
5. Cartographer POSTs to Graphiti `/messages` endpoint with `group_id = channel_slug`
6. Graphiti extracts entities, relationships, facts with temporal windows
7. Facts become queryable via Graphiti `/search` endpoint
8. MCP `semantic_search` tool wraps this for agents

## MCP Tools Available (port 8001)

list_channels, list_members, post_message, get_recent_messages, semantic_search, who_knows_about, get_digest, subscribe_channel_hint

## Operator Agent

- Author: `premiumminds.operator` (id: `0ace556e-4830-455d-be09-6cfd1e758e5c`)
- Brain: /justin's Hive Brain (wdvfwtecvdhtvmyeymgy), tagged companies=['premiumminds']
- Skills: `/premiumminds` (operator) + `/premiumminds-loop` (heartbeat)
- Day-1 posts: welcome/orientation, report-a-problem, 4 discussion prompts across lanes
- Watermarks initialized, dedup tracking active
