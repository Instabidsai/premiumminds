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

interface RawMessageRow {
  id: string;
  body: string;
  created_at: string;
  author:
    | {
        id: string;
        kind: "human" | "agent";
        agent_name: string | null;
        member:
          | { handle: string; display_name: string | null }
          | { handle: string; display_name: string | null }[]
          | null;
      }
    | {
        id: string;
        kind: "human" | "agent";
        agent_name: string | null;
        member:
          | { handle: string; display_name: string | null }
          | { handle: string; display_name: string | null }[]
          | null;
      }[]
    | null;
}

function normalizeMessage(raw: RawMessageRow): Message {
  const authorRaw = Array.isArray(raw.author) ? raw.author[0] ?? null : raw.author;
  let member: { handle: string; display_name: string | null } | null = null;
  if (authorRaw?.member) {
    member = Array.isArray(authorRaw.member) ? authorRaw.member[0] ?? null : authorRaw.member;
  }
  return {
    id: raw.id,
    body: raw.body,
    created_at: raw.created_at,
    author: authorRaw
      ? {
          id: authorRaw.id,
          kind: authorRaw.kind,
          agent_name: authorRaw.agent_name,
          member,
        }
      : null,
  };
}

export default function ChatPage() {
  const params = useParams<{ channel: string }>();
  const channelSlug = params.channel;
  const supabase = createBrowserClient();

  const [channel, setChannel] = useState<ChannelRow | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [authUserId, setAuthUserId] = useState<string | null>(null);

  // Load channel + messages
  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);

      // Get current auth user
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) setAuthUserId(user.id);

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

      // Fetch messages with author + member joined
      const { data: msgs } = await supabase
        .from("messages")
        .select(
          `
          id, body, created_at,
          author:authors!messages_author_id_fkey (
            id, kind, agent_name,
            member:members!authors_member_id_fkey ( handle, display_name )
          )
        `
        )
        .eq("channel_id", ch.id)
        .order("created_at", { ascending: true })
        .limit(200);

      if (!mounted) return;

      if (msgs) {
        setMessages((msgs as unknown as RawMessageRow[]).map(normalizeMessage));
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

          // Fetch author + member for the new message
          const { data: author } = await supabase
            .from("authors")
            .select(
              `
              id, kind, agent_name,
              member:members!authors_member_id_fkey ( handle, display_name )
            `
            )
            .eq("id", newMsg.author_id)
            .single();

          let member: { handle: string; display_name: string | null } | null = null;
          if (author?.member) {
            member = Array.isArray(author.member) ? author.member[0] ?? null : author.member;
          }

          const fullMsg: Message = {
            id: newMsg.id,
            body: newMsg.body,
            created_at: newMsg.created_at,
            author: author
              ? {
                  id: author.id,
                  kind: author.kind as "human" | "agent",
                  agent_name: author.agent_name,
                  member,
                }
              : null,
          };

          setMessages((prev) => {
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
      if (!channel || !authUserId) return;
      setSending(true);

      try {
        // 1. Find the member row for this auth user
        let { data: member } = await supabase
          .from("members")
          .select("id, handle")
          .eq("auth_user_id", authUserId)
          .maybeSingle();

        // Create member if missing (first-time user)
        if (!member) {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          const handle =
            user?.user_metadata?.handle ||
            user?.email?.split("@")[0] ||
            `user-${authUserId.slice(0, 8)}`;
          const displayName =
            user?.user_metadata?.display_name || user?.email?.split("@")[0] || handle;

          const { data: newMember, error: memberErr } = await supabase
            .from("members")
            .insert({
              auth_user_id: authUserId,
              handle,
              display_name: displayName,
            })
            .select("id, handle")
            .single();

          if (memberErr || !newMember) {
            console.error("Failed to create member:", memberErr);
            return;
          }
          member = newMember;
        }

        // 2. Find the human author for this member
        let { data: author } = await supabase
          .from("authors")
          .select("id")
          .eq("member_id", member.id)
          .eq("kind", "human")
          .maybeSingle();

        // Create author if missing
        if (!author) {
          const { data: newAuthor, error: authorErr } = await supabase
            .from("authors")
            .insert({
              kind: "human",
              member_id: member.id,
            })
            .select("id")
            .single();

          if (authorErr || !newAuthor) {
            console.error("Failed to create author:", authorErr);
            return;
          }
          author = newAuthor;
        }

        // 3. Insert the message
        const { error: msgErr } = await supabase.from("messages").insert({
          channel_id: channel.id,
          author_id: author.id,
          body: text,
        });

        if (msgErr) {
          console.error("Failed to send message:", msgErr);
        }
      } catch (err) {
        console.error("Failed to send message:", err);
      } finally {
        setSending(false);
      }
    },
    [channel, authUserId, supabase]
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
