"use client";

import { useEffect, useState, useCallback } from "react";
import { createBrowserClient } from "@/lib/supabase";
import {
  Rss,
  Plus,
  ToggleLeft,
  ToggleRight,
  Clock,
  AlertCircle,
  Hash,
} from "lucide-react";

type FeedKind = "rss" | "arxiv" | "hn" | "github_releases" | "url_poll";

interface Feed {
  id: string;
  label: string;
  kind: FeedKind;
  source_url: string;
  channel_id: string;
  enabled: boolean;
  poll_interval_min: number;
  last_polled_at: string | null;
  last_error: string | null;
  created_at: string;
  item_count?: number;
  channel?: { slug: string; name: string } | null;
}

interface Channel {
  id: string;
  slug: string;
  name: string;
}

const KIND_OPTIONS: { value: FeedKind; label: string }[] = [
  { value: "rss", label: "RSS" },
  { value: "arxiv", label: "arXiv" },
  { value: "hn", label: "Hacker News" },
  { value: "github_releases", label: "GitHub Releases" },
  { value: "url_poll", label: "URL Poll" },
];

export default function FeedsPage() {
  const supabase = createBrowserClient();
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<FeedKind>("rss");
  const [sourceUrl, setSourceUrl] = useState("");
  const [targetChannelId, setTargetChannelId] = useState("");
  const [pollInterval, setPollInterval] = useState(60);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadFeeds = useCallback(async () => {
    // Load feeds with channel info
    const { data: feedData } = await supabase
      .from("feeds")
      .select(
        `
        id, label, kind, source_url, channel_id, enabled,
        poll_interval_min, last_polled_at, last_error, created_at,
        channel:channels!feeds_channel_id_fkey ( slug, name )
      `
      )
      .order("created_at", { ascending: false });

    if (feedData) {
      // For each feed, get the item count
      const feedsWithCounts = await Promise.all(
        feedData.map(async (f) => {
          const { count } = await supabase
            .from("feed_items")
            .select("id", { count: "exact", head: true })
            .eq("feed_id", f.id);

          return {
            ...f,
            item_count: count ?? 0,
            channel: Array.isArray(f.channel) ? f.channel[0] ?? null : f.channel,
          } as Feed;
        })
      );
      setFeeds(feedsWithCounts);
    }

    setLoading(false);
  }, [supabase]);

  const loadChannels = useCallback(async () => {
    const { data } = await supabase
      .from("channels")
      .select("id, slug, name")
      .order("name");
    if (data) {
      setChannels(data);
      if (data.length > 0 && !targetChannelId) {
        setTargetChannelId(data[0].id);
      }
    }
  }, [supabase, targetChannelId]);

  useEffect(() => {
    loadFeeds();
    loadChannels();
  }, [loadFeeds, loadChannels]);

  async function handleAddFeed(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || !sourceUrl.trim() || !targetChannelId) return;

    setSaving(true);
    setFormError(null);

    try {
      const { error } = await supabase.from("feeds").insert({
        label: label.trim(),
        kind,
        source_url: sourceUrl.trim(),
        channel_id: targetChannelId,
        poll_interval_min: pollInterval,
        enabled: true,
      });

      if (error) throw error;

      // Reset form
      setLabel("");
      setSourceUrl("");
      setKind("rss");
      setPollInterval(60);
      setShowForm(false);
      await loadFeeds();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to add feed");
    } finally {
      setSaving(false);
    }
  }

  async function toggleFeed(feedId: string, currentEnabled: boolean) {
    await supabase
      .from("feeds")
      .update({ enabled: !currentEnabled })
      .eq("id", feedId);
    await loadFeeds();
  }

  function relativeTime(dateStr: string | null): string {
    if (!dateStr) return "Never";
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diffMin = Math.floor((now - then) / 60000);
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`;
    return `${Math.floor(diffMin / 1440)}d ago`;
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800 bg-gray-900/50 px-6 py-3">
        <div className="flex items-center gap-3">
          <Rss className="h-5 w-5 text-purple-400" />
          <h1 className="text-lg font-semibold text-gray-100">Feeds</h1>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-purple-500"
        >
          <Plus className="h-4 w-4" />
          Add Feed
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        {/* Add feed form */}
        {showForm && (
          <form
            onSubmit={handleAddFeed}
            className="mb-8 rounded-xl border border-gray-800 bg-gray-900 p-6"
          >
            <h2 className="text-base font-semibold mb-4">Add New Feed</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Label
                </label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  required
                  placeholder="e.g., OpenAI Blog"
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Kind
                </label>
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as FeedKind)}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                >
                  {KIND_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Source URL
                </label>
                <input
                  type="url"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  required
                  placeholder="https://..."
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Target Channel
                </label>
                <select
                  value={targetChannelId}
                  onChange={(e) => setTargetChannelId(e.target.value)}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                >
                  {channels.map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      #{ch.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Poll Interval (minutes)
                </label>
                <input
                  type="number"
                  min={5}
                  max={1440}
                  value={pollInterval}
                  onChange={(e) => setPollInterval(Number(e.target.value))}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>
            </div>

            {formError && (
              <div className="mt-3 rounded-lg bg-red-900/30 border border-red-800 px-4 py-2 text-sm text-red-300">
                {formError}
              </div>
            )}

            <div className="mt-4 flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-purple-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-500 disabled:opacity-50"
              >
                {saving ? "Adding..." : "Add Feed"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-lg bg-gray-800 px-5 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-700"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Feed list */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
          </div>
        ) : feeds.length === 0 ? (
          <div className="text-center py-12">
            <Rss className="mx-auto h-12 w-12 text-gray-700 mb-3" />
            <p className="text-gray-400">No feeds configured yet.</p>
            <p className="text-gray-600 text-sm mt-1">
              Click &ldquo;Add Feed&rdquo; to start ingesting content.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {feeds.map((feed) => (
              <div
                key={feed.id}
                className="rounded-xl border border-gray-800 bg-gray-900 p-5 transition-colors hover:border-gray-700"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-semibold text-gray-200 truncate">
                        {feed.label}
                      </h3>
                      <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider bg-gray-800 text-gray-400 ring-1 ring-gray-700">
                        {feed.kind.replace("_", " ")}
                      </span>
                      {feed.channel && (
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                          <Hash className="h-3 w-3" />
                          {feed.channel.name}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 truncate mb-2">
                      {feed.source_url}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Last polled: {relativeTime(feed.last_polled_at)}
                      </span>
                      <span>
                        Every {feed.poll_interval_min}m
                      </span>
                      <span>
                        {feed.item_count ?? 0} items
                      </span>
                      {feed.last_error && (
                        <span className="flex items-center gap-1 text-red-400">
                          <AlertCircle className="h-3 w-3" />
                          Error
                        </span>
                      )}
                    </div>
                    {feed.last_error && (
                      <p className="mt-2 text-xs text-red-400/80 truncate">
                        {feed.last_error}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => toggleFeed(feed.id, feed.enabled)}
                    title={feed.enabled ? "Disable feed" : "Enable feed"}
                    className="flex-shrink-0 p-1 transition-colors"
                  >
                    {feed.enabled ? (
                      <ToggleRight className="h-7 w-7 text-purple-400" />
                    ) : (
                      <ToggleLeft className="h-7 w-7 text-gray-600" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
