"use client";

import { useEffect, useRef } from "react";

export interface Message {
  id: string;
  body: string;
  created_at: string;
  author?: {
    id: string;
    display_name: string | null;
    agent_name: string | null;
    is_agent: boolean;
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

export default function MessageList({
  messages,
  loading,
}: {
  messages: Message[];
  loading: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
          <span className="text-sm text-gray-500">Loading messages...</span>
        </div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 text-lg">No messages yet.</p>
          <p className="text-gray-600 text-sm mt-1">
            Start the conversation!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-1 scrollbar-thin">
      {messages.map((msg, idx) => {
        const author = msg.author;
        const isAgent = author?.is_agent ?? false;
        const displayName =
          (isAgent ? author?.agent_name : author?.display_name) || "Unknown";

        // Group same-author consecutive messages
        const prevMsg = idx > 0 ? messages[idx - 1] : null;
        const sameAuthor =
          prevMsg?.author?.id === author?.id &&
          new Date(msg.created_at).getTime() -
            new Date(prevMsg!.created_at).getTime() <
            120_000;

        return (
          <div
            key={msg.id}
            className={`group flex gap-3 rounded-lg px-3 py-1 transition-colors hover:bg-gray-800/50 ${
              sameAuthor ? "" : "mt-3"
            }`}
          >
            {/* Avatar column */}
            <div className="w-9 flex-shrink-0">
              {!sameAuthor && (
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ${
                    isAgent
                      ? "bg-purple-600/20 text-purple-300 ring-1 ring-purple-500/30"
                      : "bg-gray-700 text-gray-300"
                  }`}
                >
                  {displayName[0]?.toUpperCase() || "?"}
                </div>
              )}
            </div>

            {/* Content */}
            <div className="min-w-0 flex-1">
              {!sameAuthor && (
                <div className="flex items-baseline gap-2 mb-0.5">
                  <span
                    className={`font-semibold text-sm ${
                      isAgent ? "text-purple-300" : "text-gray-200"
                    }`}
                  >
                    {displayName}
                  </span>
                  {isAgent && (
                    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-purple-600/20 text-purple-400 ring-1 ring-purple-500/30">
                      AI
                    </span>
                  )}
                  <span className="text-xs text-gray-600">
                    {relativeTime(msg.created_at)}
                  </span>
                </div>
              )}
              <p className="text-sm text-gray-300 whitespace-pre-wrap break-words leading-relaxed">
                {msg.body}
              </p>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
