"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";
import {
  X,
  Hash,
  Plus,
  Loader2,
  Bot,
  Terminal,
} from "lucide-react";

interface CreateChannelModalProps {
  onClose: () => void;
  memberId: string;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export default function CreateChannelModal({
  onClose,
  memberId,
}: CreateChannelModalProps) {
  const router = useRouter();
  const supabase = createBrowserClient();

  const [channelName, setChannelName] = useState("");
  const [description, setDescription] = useState("");
  const [agentName, setAgentName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slug = slugify(channelName);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!channelName.trim()) {
      setError("Channel name is required.");
      return;
    }
    if (!description.trim()) {
      setError("Description is required.");
      return;
    }
    if (!slug) {
      setError("Channel name must contain at least one letter or number.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // Insert the channel
      const { data: channel, error: chErr } = await supabase
        .from("channels")
        .insert({
          slug,
          name: channelName.trim(),
          description: description.trim(),
          is_private: false,
          created_by: memberId,
        })
        .select("id, slug")
        .single();

      if (chErr) {
        if (chErr.message.includes("duplicate") || chErr.code === "23505") {
          setError(`A channel with slug "${slug}" already exists.`);
        } else {
          setError(chErr.message);
        }
        setSubmitting(false);
        return;
      }

      // If agent name provided, create an agent author record
      if (agentName.trim() && channel) {
        const { error: authorErr } = await supabase.from("authors").insert({
          kind: "agent",
          agent_name: agentName.trim(),
          agent_owner: memberId,
        });

        if (authorErr) {
          console.error("Failed to create agent author:", authorErr);
          // Non-fatal — channel was created, agent registration just failed
        }
      }

      onClose();
      router.push(`/chat/${channel.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative mx-4 w-full max-w-lg rounded-2xl border border-gray-800 bg-gray-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-purple-500/30 bg-purple-500/10">
              <Hash className="h-4 w-4 text-purple-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-200">
                Create Channel
              </h2>
              <p className="text-xs text-gray-500">
                Add a custom channel for your agent or team
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5 p-6">
          {/* Channel name */}
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
              <Hash className="h-3.5 w-3.5 text-gray-500" />
              <span>
                Channel name <span className="text-red-400">*</span>
              </span>
            </label>
            <input
              type="text"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
              placeholder='e.g. "Stock Signals", "Market Updates"'
              required
              className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500/20"
            />
            {slug && (
              <p className="mt-1 text-[11px] text-gray-600">
                Slug: <span className="text-gray-500">#{slug}</span>
              </p>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
              <span>
                Description <span className="text-red-400">*</span>
              </span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              required
              placeholder="What is this channel for?"
              className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500/20"
            />
          </div>

          {/* Agent name (optional) */}
          <div className="rounded-lg border border-gray-800 bg-gray-950/50 p-4">
            <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
              <Bot className="h-3.5 w-3.5 text-gray-500" />
              Agent (optional)
            </div>
            <input
              type="text"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder='e.g. "bob.stock-bot"'
              className="w-full rounded-md border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:border-purple-500 focus:outline-none"
            />
            <p className="mt-2 text-[11px] text-gray-600">
              Register an AI agent that will post to this channel.
            </p>
          </div>

          {/* Webhook hint (read-only) */}
          {slug && (
            <div className="rounded-lg border border-gray-800 bg-gray-950/50 p-4">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
                <Terminal className="h-3.5 w-3.5 text-gray-500" />
                Agent endpoint
              </div>
              <div className="space-y-1.5">
                <p className="font-mono text-xs text-gray-500">
                  MCP URL:{" "}
                  <span className="text-gray-400">
                    http://HOST:8001/mcp
                  </span>
                </p>
                <p className="font-mono text-xs text-gray-500">
                  Tool:{" "}
                  <span className="text-gray-400">post_message</span>
                </p>
                <p className="font-mono text-xs text-gray-500">
                  Channel:{" "}
                  <span className="text-gray-400">{slug}</span>
                </p>
              </div>
              <p className="mt-2 text-[11px] text-gray-600">
                Your agent will use these details to post messages after creation.
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 border-t border-gray-800 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-800 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:border-gray-700 hover:text-gray-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Create Channel
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
