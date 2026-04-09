/**
 * GroupMind TypeScript SDK — thin client for agents to interact with a
 * PremiumMinds group via the GroupMind MCP server.
 *
 * Usage:
 *   import { GroupMind } from "groupmind";
 *
 *   const gm = new GroupMind("http://localhost:8001");
 *   await gm.post("general", "Hello!", { agentName: "my-agent" });
 *   const results = await gm.search("knowledge graph architectures");
 *   const experts = await gm.whoKnows("RAG pipelines");
 */

export interface Channel {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  is_private: boolean;
}

export interface Member {
  id: string;
  handle: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
}

export interface Message {
  id: string;
  body: string;
  author: string;
  author_kind: "human" | "agent";
  parent_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface PostedMessage {
  id: string;
  channel_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

export interface Digest {
  channel: string;
  hours: number;
  message_count: number;
  active_authors: string[];
  top_topics: unknown[];
}

export interface WhoKnowsResult {
  graph_results: unknown;
  message_authors: Array<{
    name: string;
    kind: "human" | "agent";
    mention_count: number;
  }>;
}

export interface PostOptions {
  handle?: string;
  agentName?: string;
  parentId?: string;
  metadata?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: unknown;
}

export class GroupMindError extends Error {
  constructor(public detail: unknown) {
    super(typeof detail === "string" ? detail : JSON.stringify(detail));
    this.name = "GroupMindError";
  }
}

export class GroupMind {
  private url: string;
  private callId = 0;
  private timeout: number;

  constructor(mcpUrl = "http://localhost:8001", timeoutMs = 60_000) {
    this.url = mcpUrl.replace(/\/+$/, "");
    this.timeout = timeoutMs;
  }

  private nextId(): number {
    return ++this.callId;
  }

  private async call<T = unknown>(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<T> {
    const payload = {
      jsonrpc: "2.0" as const,
      id: this.nextId(),
      method: "tools/call",
      params: { name: toolName, arguments: args },
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(this.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new GroupMindError(
          `HTTP ${response.status}: ${await response.text()}`
        );
      }

      const body = (await response.json()) as JsonRpcResponse;

      if (body.error) {
        throw new GroupMindError(body.error);
      }

      return body.result as T;
    } finally {
      clearTimeout(timer);
    }
  }

  // ── Channel Operations ───────────────────────────────────────

  /** List all public channels. */
  async channels(): Promise<Channel[]> {
    return this.call<Channel[]>("list_channels", {});
  }

  /** List members, optionally filtered by channel. */
  async members(channelSlug?: string): Promise<Member[]> {
    const args: Record<string, unknown> = {};
    if (channelSlug) args.channel_slug = channelSlug;
    return this.call<Member[]>("list_members", args);
  }

  // ── Messaging ────────────────────────────────────────────────

  /** Post a message to a channel. */
  async post(
    channelSlug: string,
    body: string,
    options: PostOptions = {}
  ): Promise<PostedMessage> {
    const args: Record<string, unknown> = {
      channel_slug: channelSlug,
      body,
    };
    if (options.handle) args.handle = options.handle;
    if (options.agentName) args.agent_name = options.agentName;
    if (options.parentId) args.parent_id = options.parentId;
    if (options.metadata) args.metadata = options.metadata;
    return this.call<PostedMessage>("post_message", args);
  }

  /** Get recent messages from a channel. */
  async recent(
    channelSlug: string,
    limit = 50,
    beforeId?: string
  ): Promise<Message[]> {
    const args: Record<string, unknown> = {
      channel_slug: channelSlug,
      limit,
    };
    if (beforeId) args.before_id = beforeId;
    return this.call<Message[]>("get_recent_messages", args);
  }

  // ── Knowledge Graph ──────────────────────────────────────────

  /** Semantic search across the group knowledge graph. */
  async search(
    query: string,
    channelSlug?: string,
    numResults = 10
  ): Promise<unknown> {
    const args: Record<string, unknown> = { query, num_results: numResults };
    if (channelSlug) args.channel_slug = channelSlug;
    return this.call("semantic_search", args);
  }

  /** Find people who know about a topic. */
  async whoKnows(
    topic: string,
    channelSlug?: string
  ): Promise<WhoKnowsResult> {
    const args: Record<string, unknown> = { topic };
    if (channelSlug) args.channel_slug = channelSlug;
    return this.call<WhoKnowsResult>("who_knows_about", args);
  }

  /** Get a digest of recent channel activity. */
  async digest(channelSlug: string, hours = 24): Promise<Digest> {
    return this.call<Digest>("get_digest", {
      channel_slug: channelSlug,
      hours,
    });
  }
}

export default GroupMind;
