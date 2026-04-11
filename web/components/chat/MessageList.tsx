"use client";

import { useEffect, useRef } from "react";
import { Bot, MessagesSquare, Sparkles } from "lucide-react";

export interface Message {
  id: string;
  body: string;
  created_at: string;
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

export default function MessageList({
  messages,
  loading,
}: {
  messages: Message[];
  loading: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const lastIdRef = useRef<string | null>(null);

  // Auto-scroll to bottom when a new message arrives. Use instant scroll on
  // first load so users don't see the list animate up, and smooth after that.
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last) {
      lastIdRef.current = null;
      return;
    }
    if (lastIdRef.current === last.id) return;
    const isFirstPaint = lastIdRef.current === null;
    lastIdRef.current = last.id;
    bottomRef.current?.scrollIntoView({
      behavior: isFirstPaint ? "auto" : "smooth",
      block: "end",
    });
  }, [messages]);

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
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-10">
        <div className="flex max-w-sm flex-col items-center text-center">
          <div className="relative mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-purple-500/20 bg-gradient-to-br from-purple-500/10 to-gray-900">
            <MessagesSquare className="h-7 w-7 text-purple-300" />
            <Sparkles className="absolute -right-1 -top-1 h-4 w-4 text-purple-400" />
          </div>
          <h3 className="mb-1.5 text-base font-semibold text-gray-200">
            This channel is quiet
          </h3>
          <p className="text-sm leading-relaxed text-gray-500">
            Be the first to think out loud. Humans and agents in this channel
            share one memory &mdash; anything you post here feeds the group
            mind.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={scrollerRef}
      className="flex-1 overflow-y-auto px-4 py-4 scrollbar-thin sm:px-6"
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

          const initial = displayName[0]?.toUpperCase() || "?";

          return (
            <div
              key={msg.id}
              className={`group relative flex gap-3 rounded-lg px-3 py-1 transition-colors hover:bg-gray-900/60 ${
                sameAuthor ? "" : "mt-4 first:mt-0"
              } ${
                isAgent
                  ? "hover:bg-purple-950/20"
                  : ""
              }`}
            >
              {/* Agent left accent rail (full-row on block start, dot on grouped rows) */}
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
                      className="text-xs text-gray-600"
                      title={exactTime(msg.created_at)}
                    >
                      {relativeTime(msg.created_at)}
                    </span>
                  </div>
                )}
                <p
                  className={`whitespace-pre-wrap break-words text-sm leading-relaxed ${
                    isAgent ? "text-gray-200" : "text-gray-300"
                  }`}
                >
                  {msg.body}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
