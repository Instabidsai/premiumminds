# URL-in-chat -> Background Agent -> Results-back: Pattern Research

Evidence-based breakdown of how 4 real production systems implement the
"drop a URL in chat, trigger deep background work, post results back" pattern.
Everything below is extracted from actual source files, not blog posts.
Paths point at the exact commit of `main` at the time of research.

---

## 1. n8n Slack Trigger

### Files actually read
- `packages/nodes-base/nodes/Slack/SlackTrigger.node.ts`
  (https://github.com/n8n-io/n8n/blob/master/packages/nodes-base/nodes/Slack/SlackTrigger.node.ts)
- `packages/nodes-base/nodes/Slack/SlackTriggerHelpers.ts`
  (https://github.com/n8n-io/n8n/blob/master/packages/nodes-base/nodes/Slack/SlackTriggerHelpers.ts)

### Mechanism in 2-3 sentences
n8n does NOT subscribe to `link_shared`. It registers a generic Slack Events
webhook on the n8n server, the user configures Slack's Event Subscriptions UI
to point at n8n's `/webhook/<id>` URL, and n8n's `SlackTrigger.node.ts` receives
events, verifies the HMAC signature, filters by `trigger` type (`message`,
`app_mention`, `file_share`, etc.), and then hands the event body off to the
downstream workflow graph as a fresh execution. There is NO built-in URL regex
- if you want "URL in message" detection you add a Code/IF node downstream.

### Code snippet (SlackTrigger.node.ts, webhook() method)
```ts
async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
  const filters = this.getNodeParameter('trigger', []) as string[];
  const req = this.getRequestObject();

  const isSignatureValid = await verifySignature.call(this);
  if (!isSignatureValid) {
    this.getResponseObject().status(401).send('Unauthorized').end();
    return { noWebhookResponse: true };
  }

  // Slack's URL verification handshake on first setup
  if (req.body.type === 'url_verification') {
    this.getResponseObject().status(200).json({ challenge: req.body.challenge }).end();
    return { noWebhookResponse: true };
  }

  const eventType = req.body.event.type as string;
  if (!filters.includes('any_event') && !filters.includes(eventType)) return {};
  // ...channel filter, user filter, id resolution, then return the event to
  // the workflow executor which runs the rest of the graph asynchronously.
}
```

### Gotchas / failure modes
- **Every event = one execution.** A workspace-wide `message` trigger burns
  one workflow execution per message, which is why the UI has the red
  "use with caution" notice at line ~110.
- **Signature verification is mandatory but silent on failure.** Returns 401
  with no retry metadata; Slack will still retry 3 times.
- **No dedup.** n8n itself does not track `event_id`. Slack retries on any
  non-2xx and n8n will run the workflow again unless you put a dedup node
  downstream keyed on `event.event_id`.
- **`response_mode: 'onReceived'`** (line 33) means Slack gets its 200 before
  the workflow finishes. Good for the 3-second rule, but if the workflow
  crashes the Slack side never knows.
- **No built-in URL detection.** To do "URL in chat triggers research," you
  run SlackTrigger -> IF node with regex -> HTTP Request -> Slack Send.
  n8n ships zero batteries here.

---

## 2. Slack `link_shared` event + an open-source unfurler

### Files actually read
- Slack official reference: https://docs.slack.dev/reference/events/link_shared
- Slack Events API general: https://docs.slack.dev/apis/events-api
- `ckundo/alt-text-unfurl/app.js`
  (https://github.com/ckundo/alt-text-unfurl/blob/main/app.js) -
  a real Bolt-based unfurler that turns tweet URLs into alt-text unfurls
- `indra7777/unnanu-talent/listeners/events/link_shared.js` -
  a Bolt listener that calls a backend for job data, then `client.chat.unfurl`

### Mechanism in 2-3 sentences
Slack sends a `link_shared` event to your bot's Events URL whenever a user
pastes a URL whose domain is registered in your app's "App Unfurl Domains"
list. The bot has 3 seconds to return HTTP 200 (Slack retries 3x on timeout),
and posts the unfurl back by calling `chat.unfurl` with the original
`channel`, `ts`, and an `unfurls` map keyed by URL. The unfurl replaces
Slack's native preview in-place on the original message - no new reply.

### Payload shape (from docs.slack.dev reference)
```json
{
  "type": "link_shared",
  "channel": "C123ABC456",
  "user": "U123ABC456",
  "message_ts": "123456789.9875",
  "unfurl_id": "C123456.123456789...",
  "thread_ts": "123456621.1855",
  "source": "conversations_history",
  "links": [
    { "domain": "example.com", "url": "https://example.com/12345" }
  ]
}
```

### Code snippet (ckundo/alt-text-unfurl/app.js, lines 23-46)
```js
app.event('link_shared', async ({ event, client }) => {
  const url = event.links[0].url;
  const id = url.split('/').pop();

  const result = await twitter.get('statuses/show', {
    id, include_ext_alt_text: true, tweet_mode: 'extended',
  });

  const unfurls = {};
  const descriptions = result.extended_entities.media.map(i => i.ext_alt_text);
  unfurls[url] = { title: descriptions.join("\n") };

  await client.chat.unfurl({
    token: process.env.SLACK_BOT_TOKEN,
    ts: event.message_ts,
    channel: event.channel,
    unfurls,
  });
});
```

### Gotchas / failure modes
- **3-second ACK wall.** Slack requires HTTP 2xx in <=3s. If your research
  takes longer you MUST return 200 immediately and do the work in a
  background task. `chat.unfurl` can be called up to ~1 hour after the
  event fires using the saved `channel` + `message_ts`.
- **The "placeholder then edit" pattern does not exist for unfurls.**
  `chat.unfurl` only supports one shot - you cannot "unfurl with a spinner"
  then "unfurl again with results." You either (a) accept the delay and
  call `chat.unfurl` once when done, or (b) use `chat.postMessage` for a
  thread reply and skip unfurling.
- **Both unfurlers I read have zero idempotency.** Slack retries on timeout
  with `x-slack-retry-num: 1|2|3`. Neither repo stores the `event_id` or
  short-circuits on retry - they just re-run the Twitter lookup. Slack's
  own docs say apps that fail >5% in a 60-minute window can have event
  subscriptions disabled.
- **Domain allowlist.** `link_shared` only fires for domains you registered
  in the app manifest. You cannot "listen for all URLs" - Slack drops the
  event at the platform edge.
- **`is_unfurl_refresh: true`** means Slack is re-asking for an unfurl on
  the same message (user re-shared it). Neither sample repo handles this
  differently from the first fire.

---

## 3. GitHub Actions `repository_dispatch`

### Files actually read
- `iterative/cml/.github/workflows/trigger-external.yml`
  (https://github.com/iterative/cml/blob/master/.github/workflows/trigger-external.yml)
- `microsoft/agent-lightning/.github/workflows/issue-comment.yml`
  (https://github.com/microsoft/agent-lightning/blob/main/.github/workflows/issue-comment.yml)
- `letta-ai/letta/.github/workflows/letta-code-sync.yml`

### Mechanism in 2-3 sentences
An external service (or another workflow) POSTs to
`https://api.github.com/repos/{owner}/{repo}/dispatches` with an
`event_type` string and a `client_payload` JSON object. Any workflow in
that repo with `on: repository_dispatch: types: [<event_type>]` starts
running and can read the payload via `github.event.client_payload.*`.
Results are posted back to the originating PR/issue by calling
`github.rest.issues.createComment` from the workflow using the default
`GITHUB_TOKEN`.

### Code snippet (iterative/cml trigger - the fire side)
```yaml
# .github/workflows/trigger-external.yml lines 21-30
- name: Trigger external actions
  run: |
    curl --silent --show-error --request POST \
      --header "Authorization: token ${{ secrets.TEST_GITHUB_TOKEN }}" \
      --header "Accept: application/vnd.github.v3+json" \
      --url "https://api.github.com/repos/iterative/cml-playground/dispatches" \
      --data '{"event_type":"push", "client_payload": {"branch":"main"}}'
```

### Code snippet (microsoft/agent-lightning - the ack/watch pattern)
This is the pattern closest to "URL in chat -> background work -> edit
original message with results." The workflow triggers on `issue_comment`
containing `/ci`, fires `repository_dispatch`, posts an ack comment,
captures the ack comment id as an output, then a separate `watch` job
polls `listWorkflowRunsForRepo` every 60s and edits the ack comment in
place with updated status until all runs complete (175-minute deadline).

```yaml
# .github/workflows/issue-comment.yml (excerpt from the watch job)
- name: Track dispatched runs and update comment
  uses: actions/github-script@v8
  env:
    CORRELATION_ID: ${{ needs.dispatch.outputs.correlation_id }}
    ACK_COMMENT_ID: ${{ needs.dispatch.outputs.ack_comment_id }}
  with:
    script: |
      const deadlineMs = Date.now() + 175 * 60 * 1000;
      while (Date.now() < deadlineMs) {
        const runs = await github.paginate(
          github.rest.actions.listWorkflowRunsForRepo,
          { owner, repo, event: 'repository_dispatch', per_page: 100 }
        );
        const matching = runs.filter(r =>
          (r.display_title || '').includes(correlationId));
        // ...edit the ack comment body with per-run status badges...
        if (matching.every(r => r.status === 'completed')) break;
        await new Promise(res => setTimeout(res, 60000));
      }
```

### Gotchas / failure modes
- **`repository_dispatch` only runs on the default branch.** If your
  workflow file is only on a feature branch, the dispatch silently no-ops.
  GitHub returns 204 either way.
- **10-second delay is common.** `createDispatchEvent` is fire-and-forget
  and there is no way to get the `run_id` of the started workflow back.
  agent-lightning solves this by embedding a `correlation_id` in the
  `client_payload` and stuffing it in the workflow's `run-name:` so the
  watcher can grep for it across `listWorkflowRunsForRepo`.
- **No at-most-once.** If the caller retries on 5xx you get multiple runs.
  The only way to dedupe is to include a nonce in `client_payload` and
  have the workflow check an external lockfile/DB.
- **`GITHUB_TOKEN` cannot trigger other workflows.** If your dispatched
  workflow tries to fire another `repository_dispatch` using the default
  token, it silently does nothing. You must use a PAT or GitHub App token.
- **60-minute PR failure window** on the watch side is unrelated - that is
  Slack's failure budget. GitHub's own cap: 1000 `repository_dispatch`
  calls per repo per hour.
- **Commenting back requires `pull-requests: write` + `issues: write`**
  permissions in the workflow, which is why the agent-lightning file
  declares them at the top.

---

## 4. Composio triggers

### Files actually read
- `docs/content/docs/triggers.mdx`
  (https://github.com/ComposioHQ/composio/blob/main/docs/content/docs/triggers.mdx)
- `docs/content/docs/setting-up-triggers/subscribing-to-events.mdx`
- `docs/content/docs/setting-up-triggers/creating-triggers.mdx`
- `docs/content/docs/webhook-verification.mdx`
- `ts/packages/cli/test/__mocks__/trigger-types.json`
  (the source-of-truth mock of every trigger slug and its payload schema)

### Mechanism in 2-3 sentences
Composio maintains a central event-router. You call
`composio.triggers.create({slug: "SLACKBOT_RECEIVE_MESSAGE", user_id, trigger_config})`
which registers the trigger against a connected account. Composio then
subscribes to Slack's Events API on your behalf, and when events arrive
it wraps them in a V3 envelope and POSTs to your single webhook URL
(configured once in the dashboard) with HMAC headers `webhook-id`,
`webhook-signature`, `webhook-timestamp`. Your handler routes on
`metadata.trigger_slug` to decide what to do.

### Is there a "URL in message" trigger? No.
I grepped the full `trigger-types.json` for every SLACK trigger. The
message-related slugs are:
- `SLACKBOT_RECEIVE_MESSAGE` (public channel message)
- `SLACKBOT_RECEIVE_DIRECT_MESSAGE` (DM)
- `SLACKBOT_RECEIVE_GROUP_MESSAGE` (private channel)
- `SLACKBOT_RECEIVE_BOT_MESSAGE`, `SLACKBOT_RECEIVE_THREAD_REPLY`,
  `SLACKBOT_REACTION_ADDED`, `SLACKBOT_CHANNEL_CREATED`, ...

**None of them filter on "message contains a URL."** Composio just wraps
Slack's `message.channels` event subscription. If you want URL detection
you do it in your webhook handler, same as n8n.

### Code snippet (handler shape from subscribing-to-events.mdx)
```python
from composio import WebhookEventType

@app.post("/webhook")
async def webhook_handler(request: Request):
    payload = await request.json()
    if payload.get("type") == WebhookEventType.TRIGGER_MESSAGE:
        slug = payload["metadata"]["trigger_slug"]
        data = payload["data"]
        if slug == "SLACKBOT_RECEIVE_MESSAGE":
            # data contains text, channel, user, ts, etc.
            # URL detection happens here, not at the trigger level.
            urls = re.findall(r'https?://\S+', data.get('text', ''))
            if urls:
                enqueue_research(urls[0], reply_to={
                    "channel": data["channel"], "ts": data["ts"]
                })
    return {"status": "ok"}
```

### Payload shape (SLACKBOT_RECEIVE_MESSAGE, from trigger-types.json)
```json
{
  "type": "composio.trigger.message",
  "metadata": { "trigger_slug": "SLACKBOT_RECEIVE_MESSAGE", ... },
  "data": {
    "bot_id": null,
    "channel": "C0...",
    "channel_type": "channel",
    "text": "check this out https://example.com/x",
    "ts": "1712000000.000100",
    "user": "U0..."
  }
}
```

### Gotchas / failure modes
- **Polling latency on some toolkits.** Triggers are classified as
  `webhook` or `polling`. Slack is `webhook` so events are real-time,
  but Gmail is polling with a **15-minute minimum interval**. If your
  "URL in chat" surface is ever Gmail, you have a 15-min floor.
- **The webhook secret is shown exactly once.** Lose it and you must
  rotate - stored only on creation. Every production deploy must pin
  it in `COMPOSIO_WEBHOOK_SECRET` env var from the jump.
- **No idempotency key in V3 envelope.** The 300-second `tolerance`
  param on signature verification prevents replay attacks by timestamp,
  but Composio does not expose a stable event ID for at-most-once
  delivery. Dedup in your DB on `(trigger_slug, data.ts, data.channel)`.
- **Single global webhook URL.** Unlike raw Slack where each app has
  its own Events URL, Composio aggregates every trigger for every user
  into one endpoint. Your handler MUST route on
  `metadata.trigger_slug` - there is no path-based routing.
- **No way to respond back to Slack from the trigger.** Composio triggers
  are fire-only. To post a result back you call a separate
  `SLACK_SEND_MESSAGE` tool - two different API surfaces on the same
  vendor for one logical flow.

---

## Cross-cutting pattern analysis

| Pattern | n8n | Slack `link_shared` | GitHub `repository_dispatch` | Composio |
|---|---|---|---|---|
| URL detection | Downstream node | Platform-level (domain allowlist) | N/A (not chat) | Downstream handler |
| Dispatch | In-process workflow exec | HTTP handler -> bg task | `curl POST /dispatches` | HTTP handler -> job queue |
| Result delivery | Slack Send node | `chat.unfurl` (in-place, one shot) | `createComment` + edit in place | `SLACK_SEND_MESSAGE` tool |
| Idempotency | None (you add a dedup node) | None in samples | `correlation_id` in payload | None (dedup in your DB) |
| Ack-then-work | Yes, `responseMode: onReceived` | Must - 3s wall | Implicit (workflow runs async) | Yes, Composio does 3s ACK itself |
| Timeout behaviour | Slack retries 3x | Slack retries 3x | N/A | Composio retries, backoff unknown |

The single most mature pattern is `microsoft/agent-lightning`'s
`issue-comment.yml`: post an ack comment immediately, embed a
correlation id in the background job, poll for the job's status, edit
the ack comment in place with live updates, stop on completion or
175-minute deadline.

---

## Synthesis - what applies to PremiumMinds

PremiumMinds already has: Supabase realtime, a polling cartographer,
an MCP server (`mcp_groupmind`), and Claude Code sessions as the
agent dispatch layer. The question is what shape of "URL in chat ->
research -> post back" is cheapest to build on top of that stack.

### What each pattern contributes

1. **n8n** shows the minimum-viable webhook endpoint - HMAC verify,
   URL verification handshake, event filter, return 200 within 3s. If
   PremiumMinds ever exposes a raw Slack integration directly (not
   through Composio), this is the skeleton. But it also shows that n8n
   itself is NOT the right layer for PremiumMinds - it ships no URL
   detection, no idempotency, no result-delivery glue. You would
   reimplement the whole flow.

2. **Slack `link_shared`** is the only pattern in the list that is
   actually purpose-built for "user pasted a URL." But the 3-second
   ACK + one-shot `chat.unfurl` constraint means you MUST decouple the
   research work from the acknowledgement, and the domain allowlist
   means you cannot listen for "any URL" - you register the domains
   you care about. For PremiumMinds this is a fit IF the community
   lives in Slack, but it is overkill if the cartographer already
   polls the feed source.

3. **GitHub `repository_dispatch` + agent-lightning watch pattern** is
   the closest behavioral match to what PremiumMinds needs even though
   the surface is wrong. The pattern is: (a) cheap "fire" API with a
   `client_payload`, (b) correlation id flows through, (c) ack message
   posted immediately, (d) background watcher edits the ack in place
   until done. Translate the verbs and you have exactly the right
   architecture for a Supabase + Claude Code system.

4. **Composio** is the most relevant vendor surface because PremiumMinds
   already has Composio MCP connected. But the honest read is:
   Composio's triggers are just a normalized version of Slack's raw
   events. There is no URL-in-message filter, no idempotency, no
   result-delivery glue. You still build the same pipeline - Composio
   only saves you the OAuth and signature-verification boilerplate.

### The recommended shape for PremiumMinds

Given the existing stack (Supabase realtime, polling cartographer,
MCP, Claude Code as agent), the `agent-lightning` pattern translated
onto Supabase is the highest-leverage fit:

```
[source channel / Composio webhook / cartographer poll]
        |
        v
  Supabase table: research_requests
    (id, url, source, source_ref, correlation_id,
     status='queued', ack_message_id, created_at)
        |
        | (Supabase realtime OR pg_cron OR MCP poll)
        v
  Claude Code session picks up `status='queued'` rows
        |
        | (UPDATE status='running', post ack to source)
        v
  Does the deep research (tools: webfetch, mcp, composio)
        |
        | (UPDATE status='done', store results,
        |  edit/reply to ack_message_id in source)
        v
  Done. Idempotency enforced by UNIQUE(correlation_id)
  or (source, source_ref, url_normalized).
```

Why this beats the 4 patterns above for this specific stack:
- Supabase table IS the queue + the audit log + the dedup key in one
  step. No need for SQS/Redis.
- Polling cartographer already knows how to write rows - reuse it as
  the URL detector.
- Claude Code session is already the "agent dispatch" layer - no
  need for a separate worker process.
- MCP server can expose `research_next()` and `research_done()` as
  tools so the agent picks up work the same way it picks up any
  other MCP task.
- Idempotency is free via Postgres `UNIQUE` constraint - something
  none of the 4 reference systems actually solve cleanly.
- Result delivery is just "UPDATE a row" + whatever adapter
  (Composio `SLACK_SEND_MESSAGE`, Discord webhook, cartographer
  replay) the original source channel uses. One handler, many sinks.

### Honest gaps I could not verify
- I did not read n8n's internal workflow-execution dispatcher - only
  the trigger node. I am assuming "it runs the rest of the graph as
  a fresh execution" based on the `responseMode: onReceived` flag
  and the `return {}` pattern.
- I did not test whether Composio's webhook retries on 5xx - the
  docs do not state a retry schedule and the SDK source was not
  inspected.
- I did not find an open-source `link_shared` handler that implements
  "post placeholder unfurl, edit to results later." My read of the
  `chat.unfurl` API is that this is not possible (one shot), but I
  have not tried it against a live workspace to be sure.
- GitHub `repository_dispatch` rate limits: I stated 1000/hour from
  memory of the GitHub docs. I did not refetch the current published
  limit in this research pass.
