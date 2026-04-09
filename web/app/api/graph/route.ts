import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@/lib/supabase";

interface GraphNode {
  id: string;
  label: string;
  size: number;
  group: string;
}

interface GraphEdge {
  source: string;
  target: string;
  weight: number;
}

interface GraphitiFact {
  uuid: string;
  name: string;
  fact: string;
  source_node_uuid?: string;
  target_node_uuid?: string;
  valid_at?: string;
  group_id?: string;
}

/**
 * Graph API — reads Graphiti /search for a channel and shapes the facts
 * into React Flow nodes+edges. Falls back to Supabase-based channel graph
 * if Graphiti is unreachable.
 */
export async function GET(request: NextRequest) {
  const channelSlug = request.nextUrl.searchParams.get("channel");
  const graphitiUrl = process.env.GRAPHITI_MCP_URL;

  // ── Try Graphiti first ────────────────────────────────────────
  if (graphitiUrl) {
    try {
      const groupIds = channelSlug ? [channelSlug] : undefined;
      const body: Record<string, unknown> = {
        query: "*",
        num_results: 100,
      };
      if (groupIds) body.group_ids = groupIds;

      const graphitiRes = await fetch(`${graphitiUrl}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (graphitiRes.ok) {
        const data = (await graphitiRes.json()) as { facts?: GraphitiFact[] };
        const facts = data.facts ?? [];

        if (facts.length > 0) {
          const nodeMap = new Map<string, GraphNode>();
          const edges: GraphEdge[] = [];

          for (const f of facts) {
            // Each fact is a triple: source_node -> target_node
            // with the relation name = f.name and the content = f.fact
            if (f.source_node_uuid && f.target_node_uuid) {
              // Add both nodes if not already present (label them by name from the fact text)
              // We don't have the node names from the fact endpoint alone, so use short IDs
              // until we upgrade to a node-fetching call. For now, use the relation name as label.
              if (!nodeMap.has(f.source_node_uuid)) {
                nodeMap.set(f.source_node_uuid, {
                  id: f.source_node_uuid,
                  label: f.fact.split(" ").slice(0, 3).join(" "),
                  size: 4,
                  group: f.group_id || "graph",
                });
              }
              if (!nodeMap.has(f.target_node_uuid)) {
                nodeMap.set(f.target_node_uuid, {
                  id: f.target_node_uuid,
                  label: f.fact.split(" ").slice(-3).join(" "),
                  size: 4,
                  group: f.group_id || "graph",
                });
              }
              edges.push({
                source: f.source_node_uuid,
                target: f.target_node_uuid,
                weight: 0.6,
              });
            } else {
              // Standalone fact — render as a single node
              nodeMap.set(f.uuid, {
                id: f.uuid,
                label: f.name || f.fact.slice(0, 40),
                size: 5,
                group: f.group_id || "graph",
              });
            }
          }

          // Increase size of nodes with more edges
          const edgeCount = new Map<string, number>();
          for (const e of edges) {
            edgeCount.set(e.source, (edgeCount.get(e.source) || 0) + 1);
            edgeCount.set(e.target, (edgeCount.get(e.target) || 0) + 1);
          }
          for (const [id, count] of edgeCount) {
            const node = nodeMap.get(id);
            if (node) node.size = Math.min(12, 3 + count);
          }

          return Response.json({
            nodes: Array.from(nodeMap.values()),
            edges,
          });
        }
      }
    } catch {
      // Graphiti unavailable or errored, fall through to Supabase fallback
    }
  }

  // ── Fallback: Supabase channel/author activity graph ─────────
  const cookieStore = await cookies();
  const supabase = createServerClient(cookieStore);

  let channelQuery = supabase.from("channels").select("id, slug, name");
  if (channelSlug) channelQuery = channelQuery.eq("slug", channelSlug);
  const { data: channels } = await channelQuery;

  if (!channels || channels.length === 0) {
    return Response.json({ nodes: [], edges: [] });
  }

  const channelIds = channels.map((c) => c.id);

  const { data: messages } = await supabase
    .from("messages")
    .select("id, channel_id, author_id")
    .in("channel_id", channelIds)
    .order("created_at", { ascending: false })
    .limit(300);

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // Channel nodes sized by message count
  const msgCountByChannel: Record<string, number> = {};
  for (const m of messages || []) {
    msgCountByChannel[m.channel_id] = (msgCountByChannel[m.channel_id] || 0) + 1;
  }
  for (const ch of channels) {
    nodes.push({
      id: `ch-${ch.id}`,
      label: `#${ch.slug}`,
      size: Math.min(12, 3 + (msgCountByChannel[ch.id] || 0) / 2),
      group: "channel",
    });
  }

  // Author nodes + edges from author -> each channel they posted in
  const authorActivity = new Map<string, { channels: Set<string>; count: number }>();
  for (const m of messages || []) {
    if (!m.author_id) continue;
    let a = authorActivity.get(m.author_id);
    if (!a) {
      a = { channels: new Set(), count: 0 };
      authorActivity.set(m.author_id, a);
    }
    a.count += 1;
    a.channels.add(m.channel_id);
  }

  if (authorActivity.size > 0) {
    const authorIds = Array.from(authorActivity.keys());
    const { data: authors } = await supabase
      .from("authors")
      .select("id, kind, agent_name, member_id")
      .in("id", authorIds);

    // Resolve member handles for humans
    const memberIds = (authors || [])
      .filter((a) => a.kind === "human" && a.member_id)
      .map((a) => a.member_id as string);
    let memberMap: Record<string, string> = {};
    if (memberIds.length > 0) {
      const { data: members } = await supabase
        .from("members")
        .select("id, handle")
        .in("id", memberIds);
      memberMap = Object.fromEntries((members || []).map((m) => [m.id, m.handle]));
    }

    for (const author of authors || []) {
      const activity = authorActivity.get(author.id);
      if (!activity) continue;
      const label =
        author.kind === "agent"
          ? author.agent_name || "agent"
          : memberMap[author.member_id || ""] || "member";

      nodes.push({
        id: `a-${author.id}`,
        label,
        size: Math.min(10, 2 + activity.count / 2),
        group: author.kind === "agent" ? "agent" : "user",
      });

      for (const chId of activity.channels) {
        edges.push({
          source: `a-${author.id}`,
          target: `ch-${chId}`,
          weight: 0.5,
        });
      }
    }
  }

  return Response.json({ nodes, edges });
}
