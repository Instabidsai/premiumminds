# Message Threading Implementation Plan

> For: PremiumMinds.io
> Status: PLAN ONLY -- hand to builder agent
> Date: 2026-04-09

---

## 1. Schema Audit -- What Already Exists

### messages table (verified via SQL)

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | uuid PK | NO | `uuid_generate_v4()` |
| channel_id | uuid FK -> channels | NO | |
| author_id | uuid FK -> authors | NO | |
| **parent_id** | **uuid FK -> messages** | **YES** | **EXISTS, unused, self-referential FK** |
| body | text | NO | |
| metadata | jsonb | YES | defaults `'{}'` |
| embedding | vector | YES | pgvector |
| ingested_at | timestamptz | YES | |
| created_at | timestamptz | YES | `now()` |

### Existing constraints
- `messages_parent_id_fkey` -- FOREIGN KEY (parent_id) REFERENCES messages(id) -- ALREADY EXISTS
- `messages_channel_created_idx` -- btree on (channel_id, created_at DESC)

### Existing trigger
- `trg_message_event` fires `emit_message_event` on INSERT, writes to `events` table. Currently does NOT include `parent_id` in the payload.

### Current message count
- 285 total messages, 0 with parent_id set. Column is ready to use.

### RLS policies
- SELECT: authenticated users can read messages in non-private channels (or channels they're members of)
- INSERT: any authenticated user (`auth.uid() IS NOT NULL`)
- No UPDATE/DELETE policies (threading won't need them initially)

---

## 2. Recommended Threading Pattern: Collapsible Inline

### Why NOT Slack-style side panel
- Slack threading works for large orgs (50+ people) where threads prevent noise in busy channels.
- PremiumMinds targets 3-10 people. A side panel splits attention and adds navigation overhead.
- Requires a whole panel component, URL routing for thread state, and split-pane layout.

### Why NOT Discord-style inline reply
- Discord shows a small "replying to X" header above each reply, but replies still appear in the main chronological feed.
- This works for casual chat but destroys context -- reply #1 and reply #5 may be 40 messages apart in the feed.
- For a group-mind/discussion platform, losing thread coherence defeats the purpose.

### Why Collapsible Inline (Linear/GitHub-style)
- **Thread replies nest visually under the parent**, collapsed by default.
- Main feed shows parent messages chronologically. Each parent shows a "N replies" badge.
- Click to expand the thread inline -- replies appear indented below the parent, still in the same scroll context.
- **Zero layout changes** -- no side panel, no split pane. The MessageList stays a single column.
- **Minimal cognitive overhead** -- users in a 3-10 person group naturally want to see "what did people say about THIS thing."
- **Future-proof** -- if you later want a Slack-style panel, the data model is identical. The only change is rendering target.

### UI Behavior

```
Main feed (parent_id IS NULL only):
+--------------------------------------------------+
| [avatar] Alice                           2m ago   |
| Has anyone tried the new Claude 4 context window? |
|   [Reply icon] [3 replies] [last: Bob, 1m ago]   |  <-- collapsed thread bar
+--------------------------------------------------+
| [avatar] groupmind.fetcher              5m ago    |
| **New paper on agent memory**                     |
| arxiv.org ...                                     |
|   [Reply icon]                                    |  <-- no replies yet, just reply button
+--------------------------------------------------+

Expanded thread (user clicked "3 replies"):
+--------------------------------------------------+
| [avatar] Alice                           2m ago   |
| Has anyone tried the new Claude 4 context window? |
|   +----------------------------------------------+
|   | [avatar] Bob                         1m ago  |
|   | Yes, it's incredible for code review.        |
|   +----------------------------------------------+
|   | [avatar] Carol                       30s ago |
|   | Agreed, especially with the 1M token window. |
|   +----------------------------------------------+
|   | [mini-composer: "Reply to thread..."]        |
|   +----------------------------------------------+
|   [Collapse]                                      |
+--------------------------------------------------+
```

### ASCII Wireframe -- Thread Bar (collapsed)

```
Parent message body text here...

 +-----------------------------------------------------------------+
 | [reply-icon]  3 replies   Bob, Carol   last reply 1m ago    [v] |
 +-----------------------------------------------------------------+
     ^              ^            ^              ^               ^
     reply btn    count      avatars/names   timestamp      expand
```

### ASCII Wireframe -- Thread Expanded

```
Parent message body text here...

 +-- thread indent (left border line, like agent accent rail) ----+
 |                                                                 |
 |  [avatar] Bob                                       1m ago      |
 |  Reply text here...                                             |
 |                                                                 |
 |  [avatar] Carol                                     30s ago     |
 |  Reply text here...                                             |
 |                                                                 |
 |  +-----------------------------------------------------------+  |
 |  | Reply to thread...                              [Send]    |  |
 |  +-----------------------------------------------------------+  |
 |                                                                 |
 |  [Collapse thread]                                              |
 +-----------------------------------------------------------------+
```

---

## 3. Schema Changes Required

### 3A. New index on parent_id (REQUIRED)

There is NO index on `parent_id`. Every thread expansion will do a sequential scan.

```sql
CREATE INDEX messages_parent_id_idx ON public.messages (parent_id)
WHERE parent_id IS NOT NULL;
```

### 3B. Update emit_message_event trigger (REQUIRED)

Include `parent_id` so downstream workers (Cartographer) know a message is a reply.

```sql
CREATE OR REPLACE FUNCTION emit_message_event()
RETURNS trigger AS $$
begin
  insert into public.events(kind, payload)
  values ('message.created',
          jsonb_build_object(
            'message_id', new.id,
            'channel_id', new.channel_id,
            'author_id', new.author_id,
            'parent_id', new.parent_id,
            'body', new.body
          ));
  return new;
end
$$ LANGUAGE plpgsql;
```

### 3C. (OPTIONAL, recommended) Materialized reply count

Two options:

**Option A -- RPC (simpler, recommended for now):**

```sql
CREATE OR REPLACE FUNCTION get_thread_summaries(p_channel_id uuid)
RETURNS TABLE (
  parent_id uuid,
  reply_count bigint,
  last_reply_at timestamptz,
  last_reply_author_name text,
  participant_names text[]
) AS $$
  SELECT
    m.parent_id,
    count(*) AS reply_count,
    max(m.created_at) AS last_reply_at,
    (SELECT COALESCE(mem.display_name, mem.handle, a.agent_name, 'Unknown')
     FROM authors a
     LEFT JOIN members mem ON mem.id = a.member_id
     WHERE a.id = (
       SELECT m2.author_id FROM messages m2
       WHERE m2.parent_id = m.parent_id
       ORDER BY m2.created_at DESC LIMIT 1
     )
    ) AS last_reply_author_name,
    array_agg(DISTINCT COALESCE(mem.display_name, mem.handle, a.agent_name, 'Unknown'))
      FILTER (WHERE COALESCE(mem.display_name, mem.handle, a.agent_name) IS NOT NULL)
      AS participant_names
  FROM messages m
  JOIN authors a ON a.id = m.author_id
  LEFT JOIN members mem ON mem.id = a.member_id
  WHERE m.parent_id IS NOT NULL
    AND m.channel_id = p_channel_id
  GROUP BY m.parent_id;
$$ LANGUAGE sql STABLE;
```

**Option B -- Denormalized columns on parent row (overkill for now):**

Add `reply_count int DEFAULT 0` and `last_reply_at timestamptz` columns to `messages`, maintained by a trigger. Skip this until you hit performance problems with Option A.

### 3D. No schema changes needed for "Move to channel" (future)

Moving a thread to its own channel means:
1. Create a new channel
2. `UPDATE messages SET channel_id = new_channel_id WHERE id = thread_parent_id OR parent_id = thread_parent_id`
3. `UPDATE messages SET parent_id = NULL WHERE id = thread_parent_id` (the parent becomes a regular message in the new channel)

The existing schema supports this out of the box. No new columns needed.

---

## 4. Query Patterns

### 4A. Main feed -- top-level messages only

Change the existing query from fetching ALL messages to only top-level:

```sql
-- Current (fetches everything including future replies mixed in):
SELECT id, body, created_at, author_id
FROM messages
WHERE channel_id = $1
ORDER BY created_at ASC
LIMIT 200;

-- New (top-level only):
SELECT id, body, created_at, author_id
FROM messages
WHERE channel_id = $1
  AND parent_id IS NULL
ORDER BY created_at ASC
LIMIT 200;
```

In Supabase JS:
```typescript
const { data: msgs } = await supabase
  .from("messages")
  .select(`
    id, body, created_at,
    author:authors!messages_author_id_fkey (
      id, kind, agent_name,
      member:members!authors_member_id_fkey ( handle, display_name )
    )
  `)
  .eq("channel_id", channelId)
  .is("parent_id", null)          // <-- ADD THIS
  .order("created_at", { ascending: true })
  .limit(200);
```

### 4B. Thread summaries -- reply counts for the feed

Call the RPC after loading messages:

```typescript
const { data: threads } = await supabase
  .rpc("get_thread_summaries", { p_channel_id: channelId });

// Returns: [{ parent_id, reply_count, last_reply_at, last_reply_author_name, participant_names }]
// Build a Map<string, ThreadSummary> keyed by parent_id for O(1) lookup during render.
```

### 4C. Thread expansion -- fetch replies for one parent

```typescript
const { data: replies } = await supabase
  .from("messages")
  .select(`
    id, body, created_at,
    author:authors!messages_author_id_fkey (
      id, kind, agent_name,
      member:members!authors_member_id_fkey ( handle, display_name )
    )
  `)
  .eq("parent_id", parentMessageId)
  .order("created_at", { ascending: true });
```

### 4D. Sending a reply

```typescript
await supabase.from("messages").insert({
  channel_id: channel.id,
  author_id: author.id,
  parent_id: parentMessageId,  // <-- the only difference from a normal message
  body: text,
});
```

---

## 5. Realtime Subscription Changes

### Current behavior
Single subscription on `messages` table filtered by `channel_id`. Every INSERT triggers a fetch of the full author and appends to the list.

### New behavior -- two parallel subscriptions

**Subscription 1: Main feed** (already exists, add filter)
```typescript
supabase
  .channel(`feed:${channel.id}`)
  .on("postgres_changes", {
    event: "INSERT",
    schema: "public",
    table: "messages",
    filter: `channel_id=eq.${channel.id}`,
  }, async (payload) => {
    const newMsg = payload.new;

    if (newMsg.parent_id === null) {
      // Top-level message: add to main feed
      // (same logic as current handler)
    } else {
      // Reply: update the thread summary badge on the parent
      // Increment reply_count in the threadSummaries map
      // If this thread is currently expanded, also add to the expanded replies list
    }
  })
  .subscribe();
```

Key insight: You do NOT need a separate subscription per open thread. One subscription on the channel catches all messages. The handler routes based on `parent_id`:
- `parent_id === null` --> append to main feed
- `parent_id !== null` --> update thread badge + optionally append to expanded thread

This is more efficient than Slack's approach (separate subscriptions per thread).

### Realtime payload includes parent_id

Supabase Realtime sends the full row on INSERT, so `payload.new.parent_id` is available without any config changes.

---

## 6. File Changes -- Exact List

### Files to MODIFY

| File | What Changes |
|------|-------------|
| `web/components/chat/MessageList.tsx` | Filter rendering to `parent_id IS NULL` messages. Add `ThreadBar` collapsed component under each message. Add `ThreadExpanded` inline component. Add expand/collapse state management. Export updated `Message` interface with optional `parent_id`. |
| `web/components/chat/Composer.tsx` | Accept optional `parentId?: string` prop. When set, show "Replying to..." header and style as thread composer (smaller, indented). Pass `parentId` through `onSend`. |
| `web/app/(app)/chat/[channel]/page.tsx` | Add `.is("parent_id", null)` to messages query. Call `get_thread_summaries` RPC on load. Update realtime handler to route by `parent_id`. Add state for `expandedThreads: Set<string>` and `threadReplies: Map<string, Message[]>`. Add `fetchThreadReplies(parentId)` function. Update `handleSend` to accept optional `parentId`. |

### Files to CREATE

| File | Purpose |
|------|---------|
| `web/components/chat/ThreadBar.tsx` | Collapsed thread indicator: "N replies -- Alice, Bob -- last reply 2m ago [expand]". Small component, ~60 lines. |
| `web/components/chat/ThreadExpanded.tsx` | Expanded thread view: indented message list + mini-composer. Reuses `MessageList` rendering logic (extract a `MessageBubble` sub-component from `MessageList` to share). ~100 lines. |

### Database migration

One migration file with:
1. `CREATE INDEX messages_parent_id_idx`
2. `CREATE OR REPLACE FUNCTION get_thread_summaries(...)`
3. `CREATE OR REPLACE FUNCTION emit_message_event(...)` (updated to include parent_id)

---

## 7. Component Architecture

```
ChatPage (page.tsx)
  |
  +-- ChannelHeader
  +-- AgentConnectPanel
  +-- MessageList
  |     |
  |     +-- DateSeparator
  |     +-- MessageBubble (extracted from current inline render)
  |     |     +-- MessageHoverActions (add "Reply" button here)
  |     |     +-- RichBody
  |     |     +-- FeedItemCard (for feed items)
  |     |
  |     +-- ThreadBar (collapsed, below each parent with replies)
  |     |     onClick -> expand
  |     |
  |     +-- ThreadExpanded (when expanded)
  |           +-- MessageBubble (reused, indented)
  |           +-- Composer (mini, with parentId)
  |           +-- [Collapse] button
  |
  +-- Composer (main, no parentId)
```

### Key refactor: Extract MessageBubble

The current `MessageList` renders each message inline in the `.map()`. Extract this into a `MessageBubble` component so both the main feed and expanded threads can reuse it. This is ~80 lines of JSX moving into its own function (still in `MessageList.tsx` is fine, or a separate file).

---

## 8. State Management

All state lives in `page.tsx` (no global store needed):

```typescript
// Existing
const [messages, setMessages] = useState<Message[]>([]);

// New
const [threadSummaries, setThreadSummaries] = useState<Map<string, ThreadSummary>>(new Map());
const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
const [threadReplies, setThreadReplies] = useState<Map<string, Message[]>>(new Map());

interface ThreadSummary {
  reply_count: number;
  last_reply_at: string;
  last_reply_author_name: string;
  participant_names: string[];
}
```

### Flow: User clicks "Reply" on a message

1. `MessageHoverActions` gets a new "Reply" button.
2. Clicking it calls `onReply(messageId)` which is passed down from `page.tsx`.
3. `page.tsx` adds the message ID to `expandedThreads` and calls `fetchThreadReplies(messageId)`.
4. `MessageList` sees the message ID is in `expandedThreads` and renders `ThreadExpanded` below it.
5. `ThreadExpanded` contains a mini `Composer` with `parentId` set.
6. Sending a reply calls `handleSend(text, parentId)` which inserts with `parent_id`.

### Flow: Realtime reply arrives

1. Realtime handler checks `payload.new.parent_id`.
2. If non-null, updates `threadSummaries` (increment count, update last_reply_at).
3. If the thread is in `expandedThreads`, also appends to `threadReplies.get(parent_id)`.
4. Main feed is NOT affected (reply does not appear in the top-level list).

---

## 9. Implementation Order (for builder agent)

### Step 1: Database migration
- Create index on parent_id
- Create `get_thread_summaries` RPC
- Update `emit_message_event` trigger
- **Verify**: Run `SELECT * FROM get_thread_summaries('some-channel-uuid')` -- should return empty (no threads yet)

### Step 2: Query changes in page.tsx
- Add `.is("parent_id", null)` to the messages query
- Call `get_thread_summaries` after loading messages
- Store in `threadSummaries` state
- **Verify**: Main feed still loads correctly (all 285 existing messages have parent_id=NULL so behavior is identical)

### Step 3: Extract MessageBubble component
- Pull the per-message render logic out of `MessageList.tsx` into a reusable component
- **Verify**: Build succeeds, feed renders identically

### Step 4: Add "Reply" button to hover actions
- Add reply icon to `MessageHoverActions`
- Wire `onReply` callback through MessageList props
- **Verify**: Clicking "Reply" logs the message ID (placeholder)

### Step 5: Build ThreadBar (collapsed indicator)
- Create `ThreadBar.tsx`
- Render below each message that has entries in `threadSummaries`
- **Verify**: Manually insert a message with `parent_id` set via SQL, confirm badge appears

### Step 6: Build ThreadExpanded
- Create `ThreadExpanded.tsx`
- Fetch replies on expand, render with reused MessageBubble
- Include mini Composer with `parentId`
- **Verify**: Expand a thread, see the reply, post a new reply

### Step 7: Realtime handler update
- Route INSERT events by parent_id
- Update thread summaries on new replies
- Append to expanded thread in real time
- **Verify**: Open two browser tabs, reply in one, see it appear in the other

### Step 8: Polish
- Collapse/expand animation (CSS transition on height)
- "Reply" button highlight when thread is expanded
- Thread count badge in MessageHoverActions
- Keyboard shortcut: `r` to reply to hovered message (optional)

---

## 10. What This Plan Does NOT Cover (Future)

- **Move thread to channel**: Schema supports it (section 3D), but needs an admin UI button + confirmation modal + RPC. Separate task.
- **Thread notifications**: Currently no notification system. When added, threading integrates naturally (notify parent author when someone replies).
- **Thread search**: Current search (if any) would need to include threaded messages. No changes needed to the data -- just ensure search queries don't filter on `parent_id IS NULL`.
- **Pagination within threads**: If a thread has 100+ replies, fetch with `.range(0, 49)` and add "load more." Not needed until threads get long.
- **MCP agent thread awareness**: The `post_message` MCP tool should accept an optional `parent_id` parameter so agents can reply to threads. Update the GroupMind MCP schema.
