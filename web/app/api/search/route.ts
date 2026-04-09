import { cookies } from "next/headers";
import { createServerClient } from "@/lib/supabase";

interface SearchResult {
  content: string;
  source_type: "message" | "document" | "graph";
  channel?: string | null;
  created_at?: string | null;
  relevance?: number;
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(cookieStore);

  // Verify user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { query: string; channel_slug?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { query, channel_slug } = body;
  if (!query?.trim()) {
    return Response.json({ error: "Query is required" }, { status: 400 });
  }

  const results: SearchResult[] = [];

  // Try Graphiti MCP search_facts if available
  const graphitiUrl = process.env.GRAPHITI_MCP_URL;
  if (graphitiUrl) {
    try {
      const graphitiRes = await fetch(`${graphitiUrl}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, channel: channel_slug }),
      });
      if (graphitiRes.ok) {
        const data = await graphitiRes.json();
        if (data.facts && Array.isArray(data.facts)) {
          data.facts.forEach(
            (fact: { content: string; created_at?: string }) => {
              results.push({
                content: fact.content,
                source_type: "graph",
                created_at: fact.created_at || null,
              });
            }
          );
        }
      }
    } catch {
      // Graphiti unavailable, continue with fallback
    }
  }

  // Full-text search on messages
  // Convert user query to tsquery format: split on spaces, join with &
  const tsQuery = query
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .join(" & ");

  if (tsQuery) {
    let messageQuery = supabase
      .from("messages")
      .select(
        `
        id, body, created_at, channel_id,
        channel:channels!messages_channel_id_fkey ( slug, name )
      `
      )
      .textSearch("body", tsQuery)
      .order("created_at", { ascending: false })
      .limit(20);

    if (channel_slug) {
      // We need the channel id for filtering
      const { data: ch } = await supabase
        .from("channels")
        .select("id")
        .eq("slug", channel_slug)
        .single();

      if (ch) {
        messageQuery = messageQuery.eq("channel_id", ch.id);
      }
    }

    const { data: messages } = await messageQuery;

    if (messages) {
      messages.forEach((msg) => {
        const channel = Array.isArray(msg.channel)
          ? msg.channel[0]
          : msg.channel;
        results.push({
          content: msg.body,
          source_type: "message",
          channel: channel?.name || null,
          created_at: msg.created_at,
        });
      });
    }
  }

  // Also search documents by extracted_text (ilike fallback)
  const escapedQuery = query.replace(/[%_]/g, "\$&");
  const { data: docs } = await supabase
    .from("documents")
    .select("id, title, extracted_text, created_at")
    .or(`title.ilike.%${escapedQuery}%,extracted_text.ilike.%${escapedQuery}%`)
    .order("created_at", { ascending: false })
    .limit(10);

  if (docs) {
    docs.forEach((doc) => {
      const snippet = doc.extracted_text?.slice(0, 300) || doc.title;
      results.push({
        content: snippet,
        source_type: "document",
        created_at: doc.created_at,
      });
    });
  }

  return Response.json({ results });
}
