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

export async function GET(request: NextRequest) {
  const channelSlug = request.nextUrl.searchParams.get("channel");

  // Try Graphiti MCP first
  const graphitiUrl = process.env.GRAPHITI_MCP_URL;
  if (graphitiUrl) {
    try {
      const graphitiRes = await fetch(`${graphitiUrl}/graph`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: channelSlug }),
      });
      if (graphitiRes.ok) {
        const data = await graphitiRes.json();
        return Response.json(data);
      }
    } catch {
      // Graphiti unavailable, fall back to Supabase
    }
  }

  // Fallback: build a simple graph from message frequency
  const cookieStore = await cookies();
  const supabase = createServerClient(cookieStore);

  // Get channels
  let channelQuery = supabase
    .from("channels")
    .select("id, slug, name");

  if (channelSlug) {
    channelQuery = channelQuery.eq("slug", channelSlug);
  }

  const { data: channels } = await channelQuery;

  if (!channels || channels.length === 0) {
    return Response.json({ nodes: [], edges: [] });
  }

  const channelIds = channels.map((c) => c.id);

  // Get recent messages with authors
  const { data: messages } = await supabase
    .from("messages")
    .select("id, channel_id, author_id, body, created_at")
    .in("channel_id", channelIds)
    .order("created_at", { ascending: false })
    .limit(500);

  if (!messages || messages.length === 0) {
    // Return channel nodes at least
    const nodes: GraphNode[] = channels.map((ch) => ({
      id: `ch-${ch.id}`,
      label: `#${ch.name}`,
      size: 5,
      group: "channel",
    }));
    return Response.json({ nodes, edges: [] });
  }

  // Build nodes: channels + unique authors
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // Channel nodes with message count
  const channelMsgCount: Record<string, number> = {};
  messages.forEach((m) => {
    channelMsgCount[m.channel_id] = (channelMsgCount[m.channel_id] || 0) + 1;
  });

  channels.forEach((ch) => {
    nodes.push({
      id: `ch-${ch.id}`,
      label: `#${ch.name}`,
      size: Math.min(12, 3 + (channelMsgCount[ch.id] || 0) / 10),
      group: "channel",
    });
  });

  // Author nodes with activity count
  const authorActivity: Record<
    string,
    { count: number; channels: Set<string> }
  > = {};
  messages.forEach((m) => {
    if (!m.author_id) return;
    if (!authorActivity[m.author_id]) {
      authorActivity[m.author_id] = { count: 0, channels: new Set() };
    }
    authorActivity[m.author_id].count++;
    authorActivity[m.author_id].channels.add(m.channel_id);
  });

  // Fetch author details
  const authorIds = Object.keys(authorActivity);
  if (authorIds.length > 0) {
    const { data: authors } = await supabase
      .from("authors")
      .select("id, display_name, agent_name, is_agent")
      .in("id", authorIds);

    if (authors) {
      authors.forEach((author) => {
        const activity = authorActivity[author.id];
        const name = author.is_agent
          ? author.agent_name || "AI Agent"
          : author.display_name || "Member";

        nodes.push({
          id: `author-${author.id}`,
          label: name,
          size: Math.min(10, 2 + activity.count / 5),
          group: author.is_agent ? "agent" : "user",
        });

        // Edge from author to each channel they participated in
        activity.channels.forEach((chId) => {
          const weight = Math.min(
            1,
            messages.filter(
              (m) => m.author_id === author.id && m.channel_id === chId
            ).length / 20
          );
          edges.push({
            source: `author-${author.id}`,
            target: `ch-${chId}`,
            weight: Math.max(0.2, weight),
          });
        });
      });
    }
  }

  // Extract simple topic nodes from frequently mentioned words
  const wordFreq: Record<string, number> = {};
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "need", "dare", "ought",
    "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
    "as", "into", "about", "like", "through", "after", "over", "between",
    "out", "against", "during", "without", "before", "under", "around",
    "among", "i", "me", "my", "we", "our", "you", "your", "he", "she",
    "it", "they", "them", "their", "this", "that", "these", "those",
    "and", "but", "or", "nor", "not", "so", "very", "just", "also",
    "than", "then", "now", "here", "there", "when", "where", "how",
    "all", "each", "every", "both", "few", "more", "most", "other",
    "some", "such", "no", "only", "same", "too", "what", "which", "who",
  ]);

  messages.forEach((m) => {
    if (!m.body) return;
    const words = m.body
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter((w: string) => w.length > 3 && !stopWords.has(w));

    words.forEach((word: string) => {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    });
  });

  // Top topic words as nodes
  const topicWords = Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  topicWords.forEach(([word, freq]) => {
    nodes.push({
      id: `topic-${word}`,
      label: word,
      size: Math.min(8, 2 + freq / 5),
      group: "topic",
    });

    // Connect topic to channels where it appears most
    channels.forEach((ch) => {
      const chMessages = messages.filter((m) => m.channel_id === ch.id);
      const topicCount = chMessages.filter((m) =>
        m.body?.toLowerCase().includes(word)
      ).length;
      if (topicCount > 0) {
        edges.push({
          source: `topic-${word}`,
          target: `ch-${ch.id}`,
          weight: Math.min(1, topicCount / 10),
        });
      }
    });
  });

  return Response.json({ nodes, edges });
}
