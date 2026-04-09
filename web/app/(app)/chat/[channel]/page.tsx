"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";
import MessageList, { type Message } from "@/components/chat/MessageList";
import Composer from "@/components/chat/Composer";
import { Hash } from "lucide-react";

interface ChannelRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
}

export default function ChatPage() {
  const params = useParams<{ channel: string }>();
  const channelSlug = params.channel;
  const supabase = createBrowserClient();

  const [channel, setChannel] = useState<ChannelRow | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Load channel + messages
  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);

      // Get current user
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) setUserId(user.id);

      // Get channel by slug
      const { data: ch } = await supabase
        .from("channels")
        .select("id, slug, name, description")
        .eq("slug", channelSlug)
        .single();

      if (!mounted) return;

      if (!ch) {
        setChannel(null);
        setMessages([]);
        setLoading(false);
        return;
      }

      setChannel(ch);

      // Fetch messages with author info
      const { data: msgs } = await supabase
        .from("messages")
        .select(
          `
          id, body, created_at,
          author:authors!messages_author_id_fkey (
            id, display_name, agent_name, is_agent
          )
        `
        )
        .eq("channel_id", ch.id)
        .order("created_at", { ascending: true })
        .limit(200);

      if (!mounted) return;

      if (msgs) {
        // Normalize author from array to single object
        const normalized: Message[] = msgs.map((m) => ({
          ...m,
          author: Array.isArray(m.author) ? m.author[0] ?? null : m.author,
        }));
        setMessages(normalized);
      }
      setLoading(false);
    }

    load();
    return () => {
      mounted = false;
    };
  }, [channelSlug, supabase]);

  // Realtime subscription
  useEffect(() => {
    if (!channel) return;

    const subscription = supabase
      .channel(`messages:${channel.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `channel_id=eq.${channel.id}`,
        },
        async (payload) => {
          const newMsg = payload.new as {
            id: string;
            body: string;
            created_at: string;
            author_id: string;
          };

          // Fetch author info for the new message
          const { data: author } = await supabase
            .from("authors")
            .select("id, display_name, agent_name, is_agent")
            .eq("id", newMsg.author_id)
            .single();

          const fullMsg: Message = {
            id: newMsg.id,
            body: newMsg.body,
            created_at: newMsg.created_at,
            author: author ?? null,
          };

          setMessages((prev) => {
            // Avoid duplicates
            if (prev.some((m) => m.id === fullMsg.id)) return prev;
            return [...prev, fullMsg];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [channel, supabase]);

  // Send message
  const handleSend = useCallback(
    async (text: string) => {
      if (!channel || !userId) return;
      setSending(true);

      try {
        // Find or create the author record for this user in this channel's community
        let { data: author } = await supabase
          .from("authors")
          .select("id")
          .eq("user_id", userId)
          .eq("is_agent", false)
          .limit(1)
          .single();

        if (!author) {
          // Get user email for display name
          const {
            data: { user },
          } = await supabase.auth.getUser();
          const displayName =
            user?.user_metadata?.display_name ||
            user?.email?.split("@")[0] ||
            "Anonymous";

          const { data: newAuthor } = await supabase
            .from("authors")
            .insert({
              user_id: userId,
              display_name: displayName,
              is_agent: false,
            })
            .select("id")
            .single();

          author = newAuthor;
        }

        if (!author) {
          console.error("Failed to create/find author");
          return;
        }

        await supabase.from("messages").insert({
          channel_id: channel.id,
          author_id: author.id,
          body: text,
        });
      } catch (err) {
        console.error("Failed to send message:", err);
      } finally {
        setSending(false);
      }
    },
    [channel, userId, supabase]
  );

  if (!loading && !channel) {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <p className="text-gray-400 text-lg">
          Channel &ldquo;{channelSlug}&rdquo; not found
        </p>
        <p className="text-gray-600 text-sm mt-1">
          Check the URL or select a channel from the sidebar.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Channel header */}
      <div className="flex items-center gap-3 border-b border-gray-800 bg-gray-900/50 px-6 py-3">
        <Hash className="h-5 w-5 text-gray-500" />
        <div>
          <h1 className="text-lg font-semibold text-gray-100">
            {channel?.name || channelSlug}
          </h1>
          {channel?.description && (
            <p className="text-xs text-gray-500">{channel.description}</p>
          )}
        </div>
      </div>

      {/* Messages */}
      <MessageList messages={messages} loading={loading} />

      {/* Composer */}
      <Composer onSend={handleSend} disabled={sending || loading} />
    </div>
  );
}
