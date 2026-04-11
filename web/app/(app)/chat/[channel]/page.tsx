"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";
import MessageList, { type Message } from "@/components/chat/MessageList";
import Composer from "@/components/chat/Composer";
import * as Icons from "lucide-react";
import { Hash, Users, Compass, ArrowLeft } from "lucide-react";
import Link from "next/link";

interface ChannelRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
}

interface LaneMeta {
  icon: string | null;
  color: string | null;
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

// Tailwind can't compile dynamic class names, so map lane color -> static classes.
const HEADER_COLOR_STYLES: Record<
  string,
  {
    icon: string;
    iconBg: string;
    iconRing: string;
    accent: string;
    glow: string;
  }
> = {
  purple: {
    icon: "text-purple-300",
    iconBg: "bg-purple-500/10",
    iconRing: "ring-purple-400/30",
    accent: "from-purple-500/60 via-purple-500/20 to-transparent",
    glow: "shadow-[0_0_30px_-10px_rgba(168,85,247,0.5)]",
  },
  amber: {
    icon: "text-amber-300",
    iconBg: "bg-amber-500/10",
    iconRing: "ring-amber-400/30",
    accent: "from-amber-500/60 via-amber-500/20 to-transparent",
    glow: "shadow-[0_0_30px_-10px_rgba(245,158,11,0.5)]",
  },
  blue: {
    icon: "text-blue-300",
    iconBg: "bg-blue-500/10",
    iconRing: "ring-blue-400/30",
    accent: "from-blue-500/60 via-blue-500/20 to-transparent",
    glow: "shadow-[0_0_30px_-10px_rgba(59,130,246,0.5)]",
  },
  emerald: {
    icon: "text-emerald-300",
    iconBg: "bg-emerald-500/10",
    iconRing: "ring-emerald-400/30",
    accent: "from-emerald-500/60 via-emerald-500/20 to-transparent",
    glow: "shadow-[0_0_30px_-10px_rgba(16,185,129,0.5)]",
  },
  sky: {
    icon: "text-sky-300",
    iconBg: "bg-sky-500/10",
    iconRing: "ring-sky-400/30",
    accent: "from-sky-500/60 via-sky-500/20 to-transparent",
    glow: "shadow-[0_0_30px_-10px_rgba(14,165,233,0.5)]",
  },
  rose: {
    icon: "text-rose-300",
    iconBg: "bg-rose-500/10",
    iconRing: "ring-rose-400/30",
    accent: "from-rose-500/60 via-rose-500/20 to-transparent",
    glow: "shadow-[0_0_30px_-10px_rgba(244,63,94,0.5)]",
  },
};

const DEFAULT_HEADER_STYLE = {
  icon: "text-gray-400",
  iconBg: "bg-gray-800",
  iconRing: "ring-gray-700",
  accent: "from-gray-700/60 via-gray-700/20 to-transparent",
  glow: "",
};

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
  const [lane, setLane] = useState<LaneMeta | null>(null);
  const [memberCount, setMemberCount] = useState<number | null>(null);
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

      // Best-effort: fetch lane metadata (slug matches) and member count.
      // Wrapped in try/catch so header stays usable even if tables are empty or
      // RLS blocks anon reads.
      try {
        const [{ data: laneRow }, { count: mCount }] = await Promise.all([
          supabase
            .from("lanes")
            .select("icon, color, description")
            .eq("slug", ch.slug)
            .maybeSingle(),
          supabase
            .from("channel_members")
            .select("member_id", { count: "exact", head: true })
            .eq("channel_id", ch.id),
        ]);
        if (mounted) {
          setLane((laneRow as LaneMeta | null) ?? null);
          setMemberCount(typeof mCount === "number" ? mCount : null);
        }
      } catch {
        // ignore — header falls back to default treatment
      }

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
      <div className="flex h-full flex-col items-center justify-center bg-gray-950 px-6 text-center">
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-gray-800 bg-gray-900">
          <Compass className="h-6 w-6 text-gray-500" />
        </div>
        <p className="text-lg font-semibold text-gray-200">
          Channel &ldquo;{channelSlug}&rdquo; not found
        </p>
        <p className="mt-1.5 max-w-sm text-sm text-gray-500">
          Check the URL, or browse the architect lanes to find the room you
          were looking for.
        </p>
        <Link
          href="/lanes"
          className="mt-5 inline-flex items-center gap-1.5 rounded-lg border border-gray-800 bg-gray-900 px-3.5 py-2 text-sm text-gray-300 transition-colors hover:border-purple-500/40 hover:text-purple-200"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to lanes
        </Link>
      </div>
    );
  }

  const headerStyle =
    (lane?.color && HEADER_COLOR_STYLES[lane.color]) || DEFAULT_HEADER_STYLE;
  const HeaderIcon =
    (lane?.icon &&
      (Icons as unknown as Record<string, Icons.LucideIcon>)[lane.icon]) ||
    Hash;
  const headerDescription = channel?.description || lane?.description || null;

  return (
    <div className="flex h-full flex-col bg-gray-950">
      {/* Channel header */}
      <div className="relative border-b border-gray-800 bg-gray-900/60 backdrop-blur">
        {/* Lane color accent rail */}
        <div
          className={`pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r ${headerStyle.accent}`}
          aria-hidden
        />
        <div className="flex items-center gap-4 px-6 py-4">
          <div
            className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ring-1 ${headerStyle.iconBg} ${headerStyle.iconRing} ${headerStyle.glow}`}
          >
            <HeaderIcon className={`h-5 w-5 ${headerStyle.icon}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Hash className="h-3.5 w-3.5 flex-shrink-0 text-gray-600" />
              <h1 className="truncate text-base font-semibold text-gray-100">
                {channel?.name || channelSlug}
              </h1>
            </div>
            {headerDescription && (
              <p className="mt-0.5 truncate text-xs leading-relaxed text-gray-500">
                {headerDescription}
              </p>
            )}
          </div>
          {memberCount !== null && memberCount > 0 && (
            <div
              className="flex flex-shrink-0 items-center gap-1.5 rounded-full border border-gray-800 bg-gray-900 px-2.5 py-1 text-xs text-gray-400"
              title={`${memberCount} member${memberCount === 1 ? "" : "s"}`}
            >
              <Users className="h-3.5 w-3.5 text-gray-500" />
              <span className="tabular-nums">{memberCount}</span>
            </div>
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
