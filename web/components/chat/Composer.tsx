"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Send, Sparkles, Network, CornerDownLeft } from "lucide-react";

// Static class maps — Tailwind JIT can't compile dynamic class names.
const LANE_ACCENT: Record<
  string,
  { bar: string; dot: string; ring: string }
> = {
  purple: {
    bar: "bg-gradient-to-b from-purple-500/80 via-purple-500/40 to-transparent",
    dot: "bg-purple-400",
    ring: "focus-within:border-purple-500/60 focus-within:ring-purple-500/20",
  },
  amber: {
    bar: "bg-gradient-to-b from-amber-500/80 via-amber-500/40 to-transparent",
    dot: "bg-amber-400",
    ring: "focus-within:border-amber-500/60 focus-within:ring-amber-500/20",
  },
  blue: {
    bar: "bg-gradient-to-b from-blue-500/80 via-blue-500/40 to-transparent",
    dot: "bg-blue-400",
    ring: "focus-within:border-blue-500/60 focus-within:ring-blue-500/20",
  },
  emerald: {
    bar: "bg-gradient-to-b from-emerald-500/80 via-emerald-500/40 to-transparent",
    dot: "bg-emerald-400",
    ring: "focus-within:border-emerald-500/60 focus-within:ring-emerald-500/20",
  },
  sky: {
    bar: "bg-gradient-to-b from-sky-500/80 via-sky-500/40 to-transparent",
    dot: "bg-sky-400",
    ring: "focus-within:border-sky-500/60 focus-within:ring-sky-500/20",
  },
  rose: {
    bar: "bg-gradient-to-b from-rose-500/80 via-rose-500/40 to-transparent",
    dot: "bg-rose-400",
    ring: "focus-within:border-rose-500/60 focus-within:ring-rose-500/20",
  },
};

const DEFAULT_ACCENT = {
  bar: "bg-gradient-to-b from-purple-500/70 via-purple-500/30 to-transparent",
  dot: "bg-purple-400",
  ring: "focus-within:border-purple-500/60 focus-within:ring-purple-500/20",
};

const PLACEHOLDERS = [
  "What's on your mind?",
  "Drop a thought, a link, or a question...",
  "Think out loud — the hive listens.",
  "Your idea becomes a fact in the knowledge graph.",
];

// Auto-growing textarea: 1 line min, ~8 lines max.
// Line height ~20px + padding — cap around 184px.
const MAX_HEIGHT_PX = 184;

export default function Composer({
  onSend,
  disabled,
  laneColor,
}: {
  onSend: (text: string) => void | Promise<void>;
  disabled: boolean;
  laneColor?: string | null;
}) {
  const [text, setText] = useState("");
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Rotate placeholder every 6s — only while idle & empty, so it doesn't
  // jitter while the user is typing or reading their own draft.
  useEffect(() => {
    if (text.length > 0) return;
    const id = setInterval(() => {
      setPlaceholderIndex((i) => (i + 1) % PLACEHOLDERS.length);
    }, 6000);
    return () => clearInterval(id);
  }, [text.length]);

  const accent = useMemo(
    () => (laneColor && LANE_ACCENT[laneColor]) || DEFAULT_ACCENT,
    [laneColor]
  );

  const adjustHeight = useCallback(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, MAX_HEIGHT_PX) + "px";
    }
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || disabled || sending) return;
    setSending(true);
    setText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    try {
      await onSend(trimmed);
    } finally {
      setSending(false);
    }
  }

  const isDisabled = disabled || sending;
  const canSend = !isDisabled && text.trim().length > 0;

  return (
    <div className="border-t border-gray-800 bg-gray-900/50 px-3 py-3 backdrop-blur sm:px-6 sm:py-5">
      <div
        className={`group relative overflow-hidden rounded-2xl border border-gray-800 bg-gray-900/80 shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_8px_24px_-12px_rgba(0,0,0,0.6)] transition-colors ring-1 ring-transparent focus-within:ring-1 ${accent.ring}`}
      >
        {/* Lane color accent strip on the left edge */}
        <div
          className={`pointer-events-none absolute inset-y-3 left-0 w-[2px] rounded-full ${accent.bar}`}
          aria-hidden
        />

        {/* Input row */}
        <div className="flex items-end gap-2 px-3 pt-3 pb-2 sm:gap-3 sm:px-5 sm:pt-4 sm:pb-3">
          <div className="flex-1">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                adjustHeight();
              }}
              onKeyDown={handleKeyDown}
              disabled={isDisabled}
              rows={1}
              placeholder={PLACEHOLDERS[placeholderIndex]}
              aria-label="Compose a thought for this channel"
              className="block w-full resize-none rounded-lg bg-gray-950/30 px-3 py-1.5 text-[15px] leading-6 text-gray-100 placeholder-gray-500 shadow-[inset_0_1px_3px_rgba(0,0,0,0.3)] outline-none transition-[placeholder] duration-500 disabled:opacity-50"
            />
          </div>

          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            aria-label={sending ? "Sending…" : "Send message"}
            className={`flex h-11 min-w-[44px] flex-shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-all sm:h-9 sm:min-w-0 ${
              canSend
                ? "bg-purple-600 text-white shadow-[0_0_12px_-2px_rgba(168,85,247,0.45)] hover:bg-purple-500 hover:shadow-[0_0_18px_-2px_rgba(168,85,247,0.55)]"
                : "bg-gray-800 text-gray-500"
            } disabled:cursor-not-allowed`}
          >
            {sending ? (
              <>
                <Sparkles className="h-3.5 w-3.5 animate-pulse" />
                <span>Thinking…</span>
              </>
            ) : (
              <>
                <Send className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Send</span>
              </>
            )}
          </button>
        </div>

        {/* Footer hint strip — shortcuts + hive indicator. Hidden on small screens to save space. */}
        <div className="hidden items-center justify-between gap-4 border-t border-gray-800/40 bg-gray-950/30 px-5 py-1.5 text-[10px] text-gray-600 sm:flex">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <kbd className="inline-flex h-4 items-center rounded border border-gray-700 bg-gray-900 px-1 font-sans text-[10px] text-gray-400">
                <CornerDownLeft className="h-2.5 w-2.5" />
              </kbd>
              <span>to send</span>
            </span>
            <span className="text-gray-700">·</span>
            <span className="inline-flex items-center gap-1">
              <kbd className="inline-flex h-4 items-center rounded border border-gray-700 bg-gray-900 px-1 font-sans text-[10px] text-gray-400">
                Shift
              </kbd>
              <kbd className="inline-flex h-4 items-center rounded border border-gray-700 bg-gray-900 px-1 font-sans text-[10px] text-gray-400">
                <CornerDownLeft className="h-2.5 w-2.5" />
              </kbd>
              <span>for newline</span>
            </span>
          </div>
          <div className="inline-flex items-center gap-1.5 opacity-70">
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${accent.dot} ${
                sending ? "animate-pulse" : ""
              }`}
              aria-hidden
            />
            <Network className="h-2.5 w-2.5 text-gray-600" />
            <span className="text-gray-600">feeds the group mind</span>
          </div>
        </div>
      </div>
    </div>
  );
}
