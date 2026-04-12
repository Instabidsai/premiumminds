"use client";

import { useEffect, useRef, useMemo, useState, useCallback } from "react";
import * as Icons from "lucide-react";
import {
  Bot,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Hash,
  Link as LinkIcon,
  MessageSquare,
  MessageSquareReply,
  MessagesSquare,
  Newspaper,
  Rss,
  Send,
  Sparkles,
} from "lucide-react";

const URL_REGEX = /(https?:\/\/[^\s)<>"]+)/g;
const BOLD_REGEX = /\*\*(.+?)\*\*/g;

/** Render message body with clickable links and **bold** formatting */
function RichBody({ text, className }: { text: string; className?: string }) {
  const parts = useMemo(() => {
    // Split on URLs first, then handle bold within each text part
    const pieces: { type: "text" | "link"; value: string }[] = [];
    let lastIndex = 0;
    const urlMatches = [...text.matchAll(URL_REGEX)];

    for (const match of urlMatches) {
      const idx = match.index!;
      if (idx > lastIndex) {
        pieces.push({ type: "text", value: text.slice(lastIndex, idx) });
      }
      pieces.push({ type: "link", value: match[0] });
      lastIndex = idx + match[0].length;
    }
    if (lastIndex < text.length) {
      pieces.push({ type: "text", value: text.slice(lastIndex) });
    }
    return pieces;
  }, [text]);

  return (
    <p className={className}>
      {parts.map((part, i) => {
        if (part.type === "link") {
          return (
            <a
              key={i}
              href={part.value}
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-400 underline decoration-purple-400/40 underline-offset-2 transition-colors hover:text-purple-300 hover:decoration-purple-300/60 break-all"
            >
              {part.value}
            </a>
          );
        }
        // Handle **bold** in text segments
        const boldParts = part.value.split(BOLD_REGEX);
        return boldParts.map((segment, j) =>
          j % 2 === 1 ? (
            <strong key={`${i}-${j}`} className="font-semibold text-gray-100">
              {segment}
            </strong>
          ) : (
            <span key={`${i}-${j}`}>{segment}</span>
          )
        );
      })}
    </p>
  );
}

/* ── Feed-item detection & card ────────────────────────────────── */

interface ParsedFeedItem {
  title: string;
  url: string;
  domain: string;
  description: string;
  author: string | null;
  source: string | null;
}

/** Returns parsed feed data when a message looks like a fetcher card, else null */
function parseFeedItem(
  body: string,
  authorKind?: string,
  agentName?: string | null,
): ParsedFeedItem | null {
  const isFetcherAgent =
    authorKind === "agent" && agentName === "groupmind.fetcher";
  const matchesPattern =
    body.startsWith("**") && /_via\s/.test(body);

  if (!isFetcherAgent && !matchesPattern) return null;

  // Title: first **...**
  const titleMatch = body.match(/\*\*(.+?)\*\*/);
  if (!titleMatch) return null;
  const title = titleMatch[1];

  // URL: first http(s) link
  const urlMatch = body.match(URL_REGEX);
  const url = urlMatch ? urlMatch[0] : "";

  // Domain from URL
  let domain = "";
  try {
    domain = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    // leave empty
  }

  // Author: _by ..._ (underscore-italic pattern)
  const authorMatch = body.match(/_by\s+(.+?)_/);
  const author = authorMatch ? authorMatch[1].trim() : null;

  // Source: _via ..._
  const sourceMatch = body.match(/_via\s+(.+?)_/);
  const source = sourceMatch ? sourceMatch[1].trim() : null;

  // Description: text between the URL line and the _by / _via lines.
  // Strategy: strip the title line, URL line, author line, and source line,
  // then whatever is left is the description.
  let desc = body;
  // Remove bold title
  desc = desc.replace(/\*\*.+?\*\*/, "");
  // Remove URL
  if (url) desc = desc.replace(url, "");
  // Remove _by ..._ and _via ..._
  desc = desc.replace(/_by\s+.+?_/, "");
  desc = desc.replace(/_via\s+.+?_/, "");
  // Collapse whitespace
  desc = desc.replace(/\n{2,}/g, "\n").trim();

  return { title, url, domain, description: desc, author, source };
}

function FeedItemCard({
  item,
  time,
}: {
  item: ParsedFeedItem;
  time: string;
}) {
  return (
    <div className="feed-card-lift my-2 max-w-xl overflow-hidden rounded-xl border border-gray-800 bg-gray-900/50 transition-colors hover:border-gray-700 hover:bg-gray-900/70">
      {/* Top bar with icon */}
      <div className="flex items-start gap-3 px-4 pt-4 pb-2">
        <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-purple-500/10 ring-1 ring-purple-400/20">
          <Newspaper className="h-4 w-4 text-purple-300" />
        </div>
        <div className="min-w-0 flex-1">
          {/* Title as link */}
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-sm font-semibold leading-snug text-gray-100 transition-colors hover:text-purple-300"
          >
            {item.title}
          </a>
          {/* Domain */}
          {item.domain && (
            <span className="text-xs text-gray-500">{item.domain}</span>
          )}
        </div>
      </div>

      {/* Description */}
      {item.description && (
        <p className="px-4 pb-2 text-sm leading-relaxed text-gray-400 line-clamp-3">
          {item.description}
        </p>
      )}

      {/* Footer: meta + open button */}
      <div className="flex items-center justify-between border-t border-gray-800/60 px-4 py-2.5">
        <span className="text-xs text-gray-500">
          {[item.author && `by ${item.author}`, item.source && `via ${item.source}`, time]
            .filter(Boolean)
            .join(" \u00b7 ")}
        </span>
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-md bg-gray-800 px-2.5 py-1 text-xs font-medium text-gray-300 transition-colors hover:bg-gray-700 hover:text-gray-100"
        >
          Open
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}

export interface Message {
  id: string;
  body: string;
  created_at: string;
  parent_id?: string | null;
  reply_count?: number;
  author?: {
    id: string;
    kind: "human" | "agent";
    agent_name: string | null;
    member?: {
      handle: string;
      display_name: string | null;
    } | null;
  } | null;
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);

  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;

  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function exactTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Returns a human-friendly label for a date separator */
function dateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();

  // Strip time for day comparisons
  const strip = (dt: Date) =>
    new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();

  const dayMs = strip(d);
  const todayMs = strip(now);
  const diff = todayMs - dayMs;

  if (diff === 0) return "Today";
  if (diff === 86_400_000) return "Yesterday";

  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Returns true when two ISO date strings fall on different calendar days */
function isDifferentDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() !== db.getFullYear() ||
    da.getMonth() !== db.getMonth() ||
    da.getDate() !== db.getDate()
  );
}

/** Small action bar that appears on message hover */
function MessageHoverActions({
  messageId,
  body,
  onReply,
  isFeedItem,
}: {
  messageId: string;
  body: string;
  onReply?: () => void;
  isFeedItem?: boolean;
}) {
  const [copied, setCopied] = useState<"link" | "text" | null>(null);

  const copyLink = useCallback(() => {
    void navigator.clipboard.writeText(`#msg-${messageId}`);
    setCopied("link");
    setTimeout(() => setCopied(null), 1500);
  }, [messageId]);

  const copyText = useCallback(() => {
    void navigator.clipboard.writeText(body);
    setCopied("text");
    setTimeout(() => setCopied(null), 1500);
  }, [body]);

  return (
    <div className="absolute -top-3 right-2 z-10 flex items-center gap-0.5 rounded-md border border-gray-700 bg-gray-900 px-1 py-0.5 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
      <button
        onClick={copyLink}
        className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200"
        title={copied === "link" ? "Copied!" : "Copy link"}
      >
        <LinkIcon className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={copyText}
        className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200"
        title={copied === "text" ? "Copied!" : "Copy text"}
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
      {onReply && !isFeedItem && (
        <button
          onClick={onReply}
          className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-800 hover:text-purple-300"
          title="Reply in thread"
        >
          <MessageSquareReply className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function authorDisplayName(author: Message["author"]): string {
  if (!author) return "Unknown";
  if (author.kind === "agent") return author.agent_name || "agent";
  return author.member?.display_name || author.member?.handle || "member";
}

function authorHandle(author: Message["author"]): string | null {
  if (!author) return null;
  if (author.kind === "agent") return null;
  return author.member?.handle ?? null;
}

/** Visual separator for date boundaries */
function DateSeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 px-3 py-3">
      <div className="h-px flex-1 bg-gray-800" />
      <span className="flex-shrink-0 text-[11px] font-medium uppercase tracking-wider text-gray-500">
        {label}
      </span>
      <div className="h-px flex-1 bg-gray-800" />
    </div>
  );
}

/** Clickable thread indicator shown below messages that have replies */
function ThreadIndicator({
  replyCount,
  expanded,
  onToggle,
  replies,
  parentIsAgent,
}: {
  replyCount: number;
  expanded: boolean;
  onToggle: () => void;
  replies?: Message[];
  parentIsAgent?: boolean;
}) {
  // Collect unique participants for overlapping avatars (first 3)
  const participants = useMemo(() => {
    if (!replies || replies.length === 0) return [];
    const seen = new Set<string>();
    const result: { id: string; name: string; isAgent: boolean }[] = [];
    for (const r of replies) {
      const aid = r.author?.id;
      if (!aid || seen.has(aid)) continue;
      seen.add(aid);
      result.push({
        id: aid,
        name: authorDisplayName(r.author),
        isAgent: r.author?.kind === "agent",
      });
      if (result.length >= 3) break;
    }
    return result;
  }, [replies]);

  // Most recent reply preview
  const lastReply = replies && replies.length > 0 ? replies[replies.length - 1] : null;
  const preview = lastReply
    ? `${authorDisplayName(lastReply.author)}: ${lastReply.body.slice(0, 60)}${lastReply.body.length > 60 ? "..." : ""}`
    : null;

  return (
    <button
      onClick={onToggle}
      className={`ml-12 mt-1 flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-all cursor-pointer hover:bg-purple-500/10 group/thread border-l-2 ${
        parentIsAgent
          ? "border-purple-500/40"
          : "border-gray-600/40"
      }`}
    >
      {/* Overlapping avatar circles */}
      {participants.length > 0 && (
        <div className="flex -space-x-1.5 flex-shrink-0">
          {participants.map((p) => (
            <div
              key={p.id}
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold ring-2 ring-gray-950 ${
                p.isAgent
                  ? "bg-purple-500/30 text-purple-200"
                  : "bg-gray-700 text-gray-200"
              }`}
              title={p.name}
            >
              {p.isAgent ? (
                <Bot className="h-2.5 w-2.5" />
              ) : (
                p.name[0]?.toUpperCase() || "?"
              )}
            </div>
          ))}
        </div>
      )}

      <span className="text-purple-400 font-medium group-hover/thread:text-purple-300">
        {replyCount} {replyCount === 1 ? "reply" : "replies"}
      </span>

      {/* Last reply preview (only when collapsed) */}
      {!expanded && preview && (
        <span className="hidden sm:inline max-w-[280px] truncate text-gray-500 group-hover/thread:text-gray-400">
          {preview}
        </span>
      )}

      {expanded ? (
        <ChevronUp className="h-3 w-3 text-gray-500 group-hover/thread:text-purple-400" />
      ) : (
        <ChevronDown className="h-3 w-3 text-gray-500 group-hover/thread:text-purple-400" />
      )}
    </button>
  );
}

/** Inline thread replies rendered indented below the parent */
function ThreadReplies({ replies }: { replies: Message[] }) {
  return (
    <div className="ml-12 mt-1 border-l-2 border-purple-500/30 pl-4 space-y-0.5">
      {replies.map((reply, idx) => {
        const author = reply.author;
        const isAgent = author?.kind === "agent";
        const displayName = authorDisplayName(author);
        const initial = displayName[0]?.toUpperCase() || "?";

        return (
          <div
            key={reply.id}
            id={`msg-${reply.id}`}
            className={`group relative flex gap-3 rounded-lg px-2 py-1 transition-colors hover:bg-gray-900/60 animate-thread-reply-in ${
              isAgent ? "hover:bg-purple-950/20" : ""
            }`}
            style={{ animationDelay: `${idx * 50}ms` }}
          >
            {/* Avatar */}
            <div className="w-7 flex-shrink-0">
              {isAgent ? (
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500/30 to-purple-700/20 text-purple-200 ring-1 ring-purple-400/40"
                  title={displayName}
                >
                  <Bot className="h-3.5 w-3.5" />
                </div>
              ) : (
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-800 text-xs font-semibold text-gray-200 ring-1 ring-gray-700"
                  title={displayName}
                >
                  {initial}
                </div>
              )}
            </div>

            {/* Content */}
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 flex items-baseline gap-2">
                <span
                  className={`text-xs font-semibold ${
                    isAgent ? "text-purple-200" : "text-gray-100"
                  }`}
                >
                  {displayName}
                </span>
                {isAgent && (
                  <span className="inline-flex items-center gap-0.5 rounded-md bg-purple-500/10 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wider text-purple-300 ring-1 ring-inset ring-purple-400/30">
                    <Bot className="h-2 w-2" />
                    agent
                  </span>
                )}
                <span
                  className="cursor-default text-[10px] text-gray-600"
                  title={exactTime(reply.created_at)}
                >
                  {relativeTime(reply.created_at)}
                </span>
              </div>
              <RichBody
                text={reply.body}
                className={`whitespace-pre-wrap break-words text-sm leading-relaxed ${
                  isAgent ? "text-gray-200" : "text-gray-300"
                }`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

const SCROLL_THRESHOLD = 500;

export interface ReplyTarget {
  id: string;
  authorName: string;
  preview: string;
}

/** Channel context passed for richer empty states */
export interface ChannelInfo {
  name: string;
  slug: string;
  description: string | null;
  lane?: {
    icon: string | null;
    color: string | null;
  } | null;
  isFeedChannel?: boolean;
}

// Lane color -> Tailwind class map for the empty state icon
const EMPTY_STATE_ICON_COLORS: Record<string, { text: string; bg: string; ring: string }> = {
  purple: { text: "text-purple-300", bg: "bg-purple-500/10", ring: "ring-purple-400/20" },
  amber: { text: "text-amber-300", bg: "bg-amber-500/10", ring: "ring-amber-400/20" },
  blue: { text: "text-blue-300", bg: "bg-blue-500/10", ring: "ring-blue-400/20" },
  emerald: { text: "text-emerald-300", bg: "bg-emerald-500/10", ring: "ring-emerald-400/20" },
  sky: { text: "text-sky-300", bg: "bg-sky-500/10", ring: "ring-sky-400/20" },
  rose: { text: "text-rose-300", bg: "bg-rose-500/10", ring: "ring-rose-400/20" },
};
const DEFAULT_EMPTY_ICON = { text: "text-purple-300", bg: "bg-purple-500/10", ring: "ring-purple-400/20" };

/** Known feed-only channel slugs */
const FEED_CHANNEL_SLUGS = new Set(["daily-ai-brief", "mcp-oss-intel"]);

export default function MessageList({
  messages,
  loading,
  onReply,
  threadReplies,
  expandedThreads,
  onToggleThread,
  channelInfo,
  onFocusComposer,
}: {
  messages: Message[];
  loading: boolean;
  onReply?: (target: ReplyTarget) => void;
  threadReplies?: Record<string, Message[]>;
  expandedThreads?: Set<string>;
  onToggleThread?: (messageId: string) => void;
  channelInfo?: ChannelInfo | null;
  onFocusComposer?: () => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const lastIdRef = useRef<string | null>(null);

  // Track whether user is near the bottom of the scroll container
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [newMsgCount, setNewMsgCount] = useState(0);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    bottomRef.current?.scrollIntoView({ behavior, block: "end" });
  }, []);

  // Monitor scroll position
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const onScroll = () => {
      const distFromBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight;
      const near = distFromBottom < SCROLL_THRESHOLD;
      setIsNearBottom(near);
      if (near) setNewMsgCount(0);
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Auto-scroll to bottom when a new message arrives (if near bottom).
  // If the user is scrolled up, increment the new-message counter instead.
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last) {
      lastIdRef.current = null;
      return;
    }
    if (lastIdRef.current === last.id) return;

    const isFirstPaint = lastIdRef.current === null;
    lastIdRef.current = last.id;

    if (isFirstPaint || isNearBottom) {
      scrollToBottom(isFirstPaint ? "auto" : "smooth");
      setNewMsgCount(0);
    } else {
      setNewMsgCount((c) => c + 1);
    }
  }, [messages, isNearBottom, scrollToBottom]);

  if (loading) {
    return (
      <div className="flex-1 overflow-hidden px-6 py-6">
        <div className="space-y-6">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3">
              <div className="h-9 w-9 flex-shrink-0 animate-pulse rounded-full bg-gray-800" />
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-24 animate-pulse rounded bg-gray-800" />
                  <div className="h-2 w-12 animate-pulse rounded bg-gray-900" />
                </div>
                <div
                  className="h-3 animate-pulse rounded bg-gray-800/70"
                  style={{ width: `${60 + ((i * 13) % 30)}%` }}
                />
                {i % 2 === 0 && (
                  <div className="h-3 w-2/5 animate-pulse rounded bg-gray-800/50" />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (messages.length === 0) {
    const isFeed =
      channelInfo?.isFeedChannel ||
      (channelInfo?.slug && FEED_CHANNEL_SLUGS.has(channelInfo.slug));

    // Resolve lane icon
    const laneIconName = channelInfo?.lane?.icon;
    const LaneIcon =
      laneIconName
        ? (Icons as unknown as Record<string, Icons.LucideIcon>)[laneIconName] || Hash
        : null;
    const laneColor = channelInfo?.lane?.color;
    const iconStyle =
      (laneColor && EMPTY_STATE_ICON_COLORS[laneColor]) || DEFAULT_EMPTY_ICON;

    return (
      <div className="flex flex-1 items-center justify-center px-6 py-10 animate-fade-in">
        <div className="flex max-w-md flex-col items-center text-center">
          {/* Large icon -- lane-colored when available */}
          <div
            className={`relative mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border ${
              LaneIcon
                ? `${iconStyle.bg} border-transparent ring-1 ${iconStyle.ring}`
                : "border-purple-500/20 bg-gradient-to-br from-purple-500/10 to-gray-900"
            }`}
          >
            {LaneIcon ? (
              <LaneIcon className={`h-9 w-9 ${iconStyle.text}`} />
            ) : isFeed ? (
              <Rss className="h-9 w-9 text-purple-300" />
            ) : (
              <MessagesSquare className="h-9 w-9 text-purple-300" />
            )}
            <Sparkles className="absolute -right-1 -top-1 h-4 w-4 text-purple-400" />
          </div>

          {/* Channel name */}
          {channelInfo?.name && (
            <div className="mb-2 flex items-center gap-2">
              <Hash className="h-4 w-4 text-gray-600" />
              <h2 className="text-lg font-bold text-gray-100">
                {channelInfo.name}
              </h2>
            </div>
          )}

          {/* Channel description */}
          {channelInfo?.description && (
            <p className="mb-4 max-w-sm text-sm leading-relaxed text-gray-400">
              {channelInfo.description}
            </p>
          )}

          {/* CTA */}
          {isFeed ? (
            <div className="space-y-2">
              <h3 className="text-base font-semibold text-gray-200">
                No feed items yet
              </h3>
              <p className="text-sm leading-relaxed text-gray-500">
                Add a feed source in{" "}
                <a
                  href="/feeds"
                  className="text-purple-400 underline decoration-purple-400/40 underline-offset-2 hover:text-purple-300"
                >
                  /feeds
                </a>{" "}
                to start populating this channel automatically.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {!channelInfo?.name && (
                <h3 className="text-base font-semibold text-gray-200">
                  This channel is quiet
                </h3>
              )}
              <p className="text-sm leading-relaxed text-gray-500">
                Humans and agents share one memory here &mdash; anything you
                post feeds the group mind.
              </p>
              <button
                type="button"
                onClick={() => onFocusComposer?.()}
                className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-medium text-white shadow-[0_0_16px_-4px_rgba(168,85,247,0.5)] transition-all hover:bg-purple-500 hover:shadow-[0_0_20px_-4px_rgba(168,85,247,0.6)]"
              >
                <Send className="h-3.5 w-3.5" />
                Be the first to post
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex-1 overflow-hidden">
      <div
        ref={scrollerRef}
        className="h-full overflow-y-auto px-4 py-4 scrollbar-thin sm:px-6"
      >
        <div className="space-y-0.5">
          {messages.map((msg, idx) => {
            const author = msg.author;
            const isAgent = author?.kind === "agent";
            const displayName = authorDisplayName(author);
            const handle = authorHandle(author);

            const prevMsg = idx > 0 ? messages[idx - 1] : null;
            const sameAuthor =
              prevMsg?.author?.id === author?.id &&
              new Date(msg.created_at).getTime() -
                new Date(prevMsg!.created_at).getTime() <
                120_000;

            // Date separator: show when first message or different calendar day
            const showDateSep =
              idx === 0 ||
              (prevMsg && isDifferentDay(prevMsg.created_at, msg.created_at));

            const initial = displayName[0]?.toUpperCase() || "?";

            /* ── Feed-item card path ──────────────────────── */
            const feedItem = parseFeedItem(
              msg.body,
              author?.kind,
              author?.agent_name,
            );

            if (feedItem) {
              return (
                <div key={msg.id}>
                  {showDateSep && (
                    <DateSeparator label={dateLabel(msg.created_at)} />
                  )}
                  <div className="group relative mt-3 first:mt-0 px-3 animate-msg-enter">
                    <MessageHoverActions messageId={msg.id} body={msg.body} isFeedItem />
                    <FeedItemCard
                      item={feedItem}
                      time={relativeTime(msg.created_at)}
                    />
                  </div>
                </div>
              );
            }

            /* ── Normal message path ──────────────────────── */
            const replyCount = msg.reply_count ?? 0;
            const isExpanded = expandedThreads?.has(msg.id) ?? false;
            const replies = threadReplies?.[msg.id];

            return (
              <div key={msg.id}>
                {showDateSep && (
                  <DateSeparator label={dateLabel(msg.created_at)} />
                )}
                <div
                  id={`msg-${msg.id}`}
                  className={`animate-msg-enter group relative flex gap-3 rounded-lg px-3 py-1 transition-colors hover:bg-gray-900/60 ${
                    sameAuthor ? "" : "mt-4 first:mt-0"
                  } ${
                    isAgent
                      ? "bg-purple-950/5 hover:bg-purple-950/20"
                      : ""
                  }`}
                >
                  {/* Hover action bar */}
                  <MessageHoverActions
                    messageId={msg.id}
                    body={msg.body}
                    onReply={
                      onReply
                        ? () =>
                            onReply({
                              id: msg.id,
                              authorName: displayName,
                              preview: msg.body.slice(0, 60),
                            })
                        : undefined
                    }
                  />

                  {/* Agent left accent rail */}
                  {isAgent && (
                    <span
                      className={`pointer-events-none absolute left-0 top-0 bottom-0 w-0.5 rounded-full bg-gradient-to-b from-purple-500/60 to-purple-500/10 ${
                        sameAuthor ? "opacity-40" : "opacity-100"
                      }`}
                      aria-hidden
                    />
                  )}

                  {/* Avatar column */}
                  <div className="w-9 flex-shrink-0">
                    {!sameAuthor ? (
                      isAgent ? (
                        <div
                          className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500/30 to-purple-700/20 text-purple-200 ring-1 ring-purple-400/40 shadow-[0_0_18px_-6px_rgba(168,85,247,0.5)]"
                          title={displayName}
                        >
                          <Bot className="h-[18px] w-[18px]" />
                        </div>
                      ) : (
                        <div
                          className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-800 text-sm font-semibold text-gray-200 ring-1 ring-gray-700"
                          title={displayName}
                        >
                          {initial}
                        </div>
                      )
                    ) : (
                      <div
                        className="mt-1 h-full w-9 text-center text-[10px] text-gray-700 opacity-0 group-hover:opacity-100"
                        title={exactTime(msg.created_at)}
                      >
                        {new Date(msg.created_at).toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    {!sameAuthor && (
                      <div className="mb-0.5 flex items-baseline gap-2">
                        <span
                          className={`text-sm font-semibold ${
                            isAgent ? "text-purple-200" : "text-gray-100"
                          }`}
                        >
                          {displayName}
                        </span>
                        {isAgent ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-purple-300 ring-1 ring-inset ring-purple-400/30">
                            <Bot className="h-2.5 w-2.5" />
                            agent
                          </span>
                        ) : handle ? (
                          <span className="text-xs text-gray-600">@{handle}</span>
                        ) : null}
                        <span
                          className="cursor-default text-xs text-gray-600"
                          title={exactTime(msg.created_at)}
                        >
                          {relativeTime(msg.created_at)}
                        </span>
                      </div>
                    )}
                    <RichBody
                      text={msg.body}
                      className={`whitespace-pre-wrap break-words text-sm leading-relaxed ${
                        isAgent ? "text-gray-200" : "text-gray-300"
                      }`}
                    />
                  </div>
                </div>

                {/* Reply + Thread row — always visible */}
                <div className="mt-1 ml-12 flex items-center gap-3">
                  {onReply && !feedItem && (
                    <button
                      onClick={() => onReply({ id: msg.id, authorName: displayName, preview: msg.body })}
                      className="flex items-center gap-1 text-xs text-gray-500 transition-colors hover:text-purple-400"
                    >
                      <MessageSquareReply className="h-3 w-3" />
                      <span>Reply</span>
                    </button>
                  )}
                  {replyCount > 0 && onToggleThread && (
                    <ThreadIndicator
                      replyCount={replyCount}
                      expanded={isExpanded}
                      onToggle={() => onToggleThread(msg.id)}
                      replies={replies}
                      parentIsAgent={isAgent}
                    />
                  )}
                </div>

                {/* Inline thread replies */}
                {isExpanded && replies && replies.length > 0 && (
                  <ThreadReplies replies={replies} />
                )}
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* ── Floating: New messages pill ─────────────────────── */}
      {newMsgCount > 0 && (
        <button
          onClick={() => {
            scrollToBottom();
            setNewMsgCount(0);
          }}
          className="animate-pill-bounce absolute bottom-4 left-1/2 z-20 rounded-full border border-purple-500/40 bg-gray-900/95 px-4 py-1.5 text-xs font-medium text-purple-200 shadow-lg backdrop-blur transition-colors hover:border-purple-400/60 hover:bg-gray-800/95"
        >
          <ChevronDown className="-ml-0.5 mr-1 inline-block h-3.5 w-3.5" />
          {newMsgCount} new message{newMsgCount === 1 ? "" : "s"}
        </button>
      )}

      {/* ── Floating: Scroll-to-bottom button ───────────────── */}
      {!isNearBottom && newMsgCount === 0 && (
        <button
          onClick={() => scrollToBottom()}
          className="absolute bottom-4 right-4 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-gray-700 bg-gray-900/95 text-gray-400 shadow-lg backdrop-blur transition-colors hover:border-gray-600 hover:bg-gray-800 hover:text-gray-200"
          title="Scroll to bottom"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
