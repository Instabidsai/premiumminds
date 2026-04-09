"use client";

import { useState, useRef, useCallback } from "react";
import { Send } from "lucide-react";

export default function Composer({
  onSend,
  disabled,
}: {
  onSend: (text: string) => void | Promise<void>;
  disabled: boolean;
}) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
    }
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    setText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    await onSend(trimmed);
  }

  return (
    <div className="border-t border-gray-800 bg-gray-900/50 px-6 py-4">
      <div className="flex items-end gap-3 rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 focus-within:border-purple-500 focus-within:ring-1 focus-within:ring-purple-500 transition-colors">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            adjustHeight();
          }}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={1}
          placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
          className="flex-1 resize-none bg-transparent text-sm text-gray-100 placeholder-gray-500 outline-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={disabled || !text.trim()}
          className="flex-shrink-0 rounded-lg p-2 text-purple-400 transition-colors hover:bg-purple-600/20 hover:text-purple-300 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
