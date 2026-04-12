"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";
import MessageList, { type Message, type ReplyTarget, type ChannelInfo } from "@/components/chat/MessageList";
import Composer, { type ReplyingTo } from "@/components/chat/Composer";
import * as Icons from "lucide-react";
import { Hash, Users, Compass, ArrowLeft } from "lucide-react";
import Link from "next/link";
import AgentConnectPanel from "@/components/channels/AgentConnectPanel";

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

interface RpcMessageRow {
  id: string;
  body: string;
  created_at: string;
  parent_id: string | null;
  author_id: string;
  author_kind: string;
  agent_name: string | null;
  member_handle: string | null;
  member_display_name: string | null;
  reply_count: number | string;
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
  const [replyingTo, setReplyingTo] = useState<ReplyingTo | null>(null);
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  const [threadReplies, setThreadReplies] = useState<Record<string, Message[]>>({});
  const [pinnedMessages, setPinnedMessages] = useState<
    { id: string; message: string; link_to_channel: string | null; link_label: string | null }[]
  >([]);

  // Mark channel as read for unread tracking
  const markRead = useCallback(
    async (channelId: string, userId: string) => {
      try {
        const { data: member } = await supabase
          .from("members")
          .select("id")
          .eq("auth_user_id", userId)
          .maybeSingle();
        if (!member) return;
        await supabase.from("channel_read_state").upsert(
          {
            member_id: member.id,
            channel_id: channelId,
            last_read_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "member_id,channel_id" }
        );
      } catch {
        // Best-effort, don't break the chat flow
      }
    },
    [supabase]
  );

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

      // Fetch pinned messages for this channel
      try {
        const { data: pins } = await supabase
          .from("pinned_messages")
          .select("id, message, link_to_channel, link_label")
          .eq("channel_id", ch.id)
          .eq("active", true)
          .order("pinned_at", { ascending: false });
        if (mounted && pins) setPinnedMessages(pins);
      } catch {
        // Non-critical
      }

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

      // Fetch top-level messages via RPC (includes reply_count, excludes thread replies)
      const { data: rpcRows } = await supabase.rpc("get_channel_messages", {
        p_channel_id: ch.id,
        p_limit: 200,
      });

      if (!mounted) return;

      if (rpcRows) {
        const mapped: Message[] = (rpcRows as RpcMessageRow[]).map((r) => ({
          id: r.id,
          body: r.body,
          created_at: r.created_at,
          parent_id: r.parent_id,
          reply_count: Number(r.reply_count) || 0,
          author: {
            id: r.author_id,
            kind: r.author_kind as "human" | "agent",
            agent_name: r.agent_name,
            member:
              r.member_handle != null
                ? { handle: r.member_handle, display_name: r.member_display_name }
                : null,
          },
        }));
        setMessages(mapped);
      }
      setLoading(false);

      // Mark channel as read after loading messages
      if (user && ch) {
        markRead(ch.id, user.id);
      }
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
            parent_id: string | null;
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
            parent_id: newMsg.parent_id,
            author: author
              ? {
                  id: author.id,
                  kind: author.kind as "human" | "agent",
                  agent_name: author.agent_name,
                  member,
                }
              : null,
          };

          if (newMsg.parent_id) {
            // This is a thread reply — increment reply_count on the parent
            setMessages((prev) =>
              prev.map((m) =>
                m.id === newMsg.parent_id
                  ? { ...m, reply_count: (m.reply_count ?? 0) + 1 }
                  : m
              )
            );
            // If thread is expanded, add the reply to the inline view
            setThreadReplies((prev) => {
              const existing = prev[newMsg.parent_id!];
              if (!existing) return prev; // Thread not loaded yet
              if (existing.some((r) => r.id === fullMsg.id)) return prev;
              return { ...prev, [newMsg.parent_id!]: [...existing, fullMsg] };
            });
          } else {
            // Top-level message — add to the main feed
            setMessages((prev) => {
              if (prev.some((m) => m.id === fullMsg.id)) return prev;
              return [...prev, { ...fullMsg, reply_count: 0 }];
            });
          }

          // Mark channel as read on each new message while viewing
          if (authUserId && channel) {
            markRead(channel.id, authUserId);
          }
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

        // 3. Insert the message (with optional parent_id for thread replies)
        const insertPayload: Record<string, unknown> = {
          channel_id: channel.id,
          author_id: author.id,
          body: text,
        };
        if (replyingTo) {
          insertPayload.parent_id = replyingTo.id;
        }

        const { error: msgErr } = await supabase.from("messages").insert(insertPayload);

        if (msgErr) {
          console.error("Failed to send message:", msgErr);
        } else if (replyingTo) {
          // Clear reply state on success
          setReplyingTo(null);
        }
      } catch (err) {
        console.error("Failed to send message:", err);
      } finally {
        setSending(false);
      }
    },
    [channel, authUserId, supabase, replyingTo]
  );

  // Fetch thread replies for a given parent message
  const fetchThreadReplies = useCallback(
    async (parentId: string) => {
      const { data: rows } = await supabase
        .from("messages")
        .select(
          `
          id, body, created_at, parent_id,
          author:authors!messages_author_id_fkey (
            id, kind, agent_name,
            member:members!authors_member_id_fkey ( handle, display_name )
          )
        `
        )
        .eq("parent_id", parentId)
        .order("created_at", { ascending: true });

      if (rows) {
        const mapped = (rows as unknown as RawMessageRow[]).map(normalizeMessage);
        setThreadReplies((prev) => ({ ...prev, [parentId]: mapped }));
      }
    },
    [supabase]
  );

  // Toggle thread expansion (fetch replies on first expand)
  const handleToggleThread = useCallback(
    (messageId: string) => {
      setExpandedThreads((prev) => {
        const next = new Set(prev);
        if (next.has(messageId)) {
          next.delete(messageId);
        } else {
          next.add(messageId);
          // Fetch replies if not already loaded
          if (!threadReplies[messageId]) {
            fetchThreadReplies(messageId);
          }
        }
        return next;
      });
    },
    [threadReplies, fetchThreadReplies]
  );

  // Handle reply button click from MessageList
  const handleReply = useCallback((target: ReplyTarget) => {
    setReplyingTo({
      id: target.id,
      authorName: target.authorName,
      preview: target.preview,
    });
  }, []);

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

  // Build channel info for the empty state in MessageList
  const channelInfoForList: ChannelInfo | null = channel
    ? {
        name: channel.name,
        slug: channel.slug,
        description: headerDescription,
        lane: lane ? { icon: lane.icon, color: lane.color } : null,
      }
    : null;

  // Focus the composer textarea from the empty-state CTA
  const focusComposer = useCallback(() => {
    // The Composer has a textarea -- find it by the aria-label
    const ta = document.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="Compose a thought for this channel"]'
    );
    ta?.focus();
  }, []);

  return (
    <div className="flex h-full flex-col bg-gray-950">
      {/* Channel header */}
      <div className="relative border-b border-gray-800 bg-gray-900/60 backdrop-blur">
        {/* Lane color accent rail */}
        <div
          className={`pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r ${headerStyle.accent}`}
          aria-hidden
        />
        <div className="flex items-center gap-3 px-4 py-3 sm:gap-4 sm:px-6 sm:py-4">
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

      {/* Agent connect panel */}
      {channel && <AgentConnectPanel channelSlug={channel.slug} />}

      {/* Pinned messages */}
      {pinnedMessages.length > 0 && (
        <div className="border-b border-gray-800 bg-purple-500/5 px-6 py-2.5 space-y-2">
          {pinnedMessages.map((pin) => (
            <div key={pin.id} className="flex items-center gap-3 text-sm">
              <Icons.Pin className="h-3.5 w-3.5 flex-shrink-0 text-purple-400" />
              <span className="flex-1 text-gray-300">{pin.message}</span>
              {pin.link_to_channel && (
                <Link
                  href={`/chat/${pin.link_to_channel}`}
                  className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-purple-500"
                >
                  {pin.link_label || "Go"}
                  <Icons.ArrowRight className="h-3 w-3" />
                </Link>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Messages */}
      <MessageList
        messages={messages}
        loading={loading}
        onReply={handleReply}
        threadReplies={threadReplies}
        expandedThreads={expandedThreads}
        onToggleThread={handleToggleThread}
        channelInfo={channelInfoForList}
        onFocusComposer={focusComposer}
      />

      {/* Composer */}
      <Composer
        onSend={handleSend}
        disabled={sending || loading}
        laneColor={lane?.color ?? null}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
      />
    </div>
  );
}
