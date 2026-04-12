"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createBrowserClient } from "@/lib/supabase";
import {
  Rss,
  Plus,
  ToggleLeft,
  ToggleRight,
  Clock,
  AlertCircle,
  Hash,
  X,
  ExternalLink,
  Package,
  Zap,
} from "lucide-react";

type FeedKind = "rss" | "arxiv" | "hn" | "github_releases" | "url_poll";

interface Feed {
  id: string;
  label: string;
  kind: FeedKind;
  source_url: string;
  channel_id: string;
  enabled: boolean;
  poll_interval_minutes: number;
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

type FilterMode = "all" | "enabled" | "disabled";

const KIND_OPTIONS: {
  value: FeedKind;
  label: string;
  description: string;
}[] = [
  { value: "rss", label: "RSS", description: "Standard RSS or Atom feed" },
  { value: "arxiv", label: "arXiv", description: "arXiv paper category feed" },
  { value: "hn", label: "Hacker News", description: "HN front page or topic" },
  {
    value: "github_releases",
    label: "GitHub Releases",
    description: "Release feed for a repo",
  },
  {
    value: "url_poll",
    label: "URL Poll",
    description: "Poll a plain URL for changes",
  },
];

// Kind badge colors — each kind gets a lane color.
const KIND_BADGE: Record<FeedKind, string> = {
  rss: "bg-amber-500/10 text-amber-300 ring-amber-500/30",
  arxiv: "bg-red-500/10 text-red-300 ring-red-500/30",
  hn: "bg-orange-500/10 text-orange-300 ring-orange-500/30",
  github_releases: "bg-gray-500/10 text-gray-200 ring-gray-500/30",
  url_poll: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30",
};

// Favicon-style dot color for known sources
const KIND_DOT: Record<FeedKind, string> = {
  rss: "bg-amber-400",
  arxiv: "bg-red-500",
  hn: "bg-orange-500",
  github_releases: "bg-white",
  url_poll: "bg-emerald-400",
};

const KIND_LABEL: Record<FeedKind, string> = {
  rss: "RSS",
  arxiv: "arXiv",
  hn: "HN",
  github_releases: "GH Releases",
  url_poll: "URL Poll",
};

export default function FeedsPage() {
  const supabase = createBrowserClient();
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<FilterMode>("all");

  // Form state
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<FeedKind>("rss");
  const [sourceUrl, setSourceUrl] = useState("");
  const [targetChannelId, setTargetChannelId] = useState("");
  const [pollInterval, setPollInterval] = useState(60);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadFeeds = useCallback(async () => {
    const { data: feedData } = await supabase
      .from("feeds")
      .select(
        `
        id, label, kind, source_url, channel_id, enabled,
        poll_interval_minutes, last_polled_at, last_error, created_at,
        channel:channels!feeds_channel_id_fkey ( slug, name )
      `
      )
      .order("created_at", { ascending: false });

    if (feedData) {
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
        poll_interval_minutes: pollInterval,
        enabled: true,
      });

      if (error) throw error;

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

  const counts = useMemo(() => {
    const enabled = feeds.filter((f) => f.enabled).length;
    return {
      all: feeds.length,
      enabled,
      disabled: feeds.length - enabled,
    };
  }, [feeds]);

  const visibleFeeds = useMemo(() => {
    if (filter === "enabled") return feeds.filter((f) => f.enabled);
    if (filter === "disabled") return feeds.filter((f) => !f.enabled);
    return feeds;
  }, [feeds, filter]);

  const selectedKindDesc =
    KIND_OPTIONS.find((o) => o.value === kind)?.description ?? "";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800 bg-gray-900/50 px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-600/20 ring-1 ring-purple-500/30">
            <Rss className="h-4 w-4 text-purple-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-100">Feeds</h1>
            <p className="text-[11px] text-gray-500">
              RSS, arXiv, HN, GitHub releases, URL polls
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-950"
        >
          {showForm ? (
            <>
              <X className="h-4 w-4" />
              Close
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" />
              Add Feed
            </>
          )}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        {/* Add feed form (collapsible) */}
        {showForm && (
          <form
            onSubmit={handleAddFeed}
            className="mb-8 overflow-hidden rounded-xl border border-gray-800 bg-gray-900 shadow-lg"
          >
            <div className="flex items-center justify-between border-b border-gray-800 bg-gray-900/60 px-6 py-3">
              <h2 className="text-sm font-semibold text-gray-200">
                New feed
              </h2>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                aria-label="Close form"
                className="rounded-md p-1 text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-400">
                  Label
                </label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  required
                  placeholder="e.g., OpenAI Blog"
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 transition-colors focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
                <p className="mt-1 text-[11px] text-gray-500">
                  Short name shown in the feed list and messages.
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-400">
                  Kind
                </label>
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as FeedKind)}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 transition-colors focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                >
                  {KIND_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-gray-500">
                  {selectedKindDesc}
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-400">
                  Target Channel
                </label>
                <select
                  value={targetChannelId}
                  onChange={(e) => setTargetChannelId(e.target.value)}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 transition-colors focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                >
                  {channels.map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      #{ch.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-gray-500">
                  Where new items post as messages.
                </p>
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-400">
                  Source URL
                </label>
                <input
                  type="url"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  required
                  placeholder="https://example.com/feed.xml"
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 transition-colors focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-400">
                  Poll interval (minutes)
                </label>
                <input
                  type="number"
                  min={5}
                  max={1440}
                  value={pollInterval}
                  onChange={(e) => setPollInterval(Number(e.target.value))}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 transition-colors focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
                <p className="mt-1 text-[11px] text-gray-500">
                  Between 5 and 1440 minutes.
                </p>
              </div>
            </div>

            {formError && (
              <div className="mx-6 mb-4 flex items-start gap-2 rounded-lg border border-red-800 bg-red-900/30 px-4 py-2 text-sm text-red-300">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 border-t border-gray-800 bg-gray-900/40 px-6 py-3">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-lg bg-gray-800 px-4 py-1.5 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-purple-600 px-5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Adding..." : "Add feed"}
              </button>
            </div>
          </form>
        )}

        {/* Filter bar */}
        {!loading && feeds.length > 0 && (
          <div className="mb-4 flex items-center justify-between">
            <div className="inline-flex rounded-lg border border-gray-800 bg-gray-900 p-1">
              {(
                [
                  { id: "all", label: "All" },
                  { id: "enabled", label: "Enabled" },
                  { id: "disabled", label: "Disabled" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setFilter(tab.id)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    filter === tab.id
                      ? "bg-purple-600/20 text-purple-200 ring-1 ring-inset ring-purple-500/40"
                      : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  {tab.label}
                  <span className="ml-1.5 text-[10px] text-gray-500">
                    {counts[tab.id]}
                  </span>
                </button>
              ))}
            </div>
            <div className="text-xs text-gray-500">
              {visibleFeeds.length} shown
            </div>
          </div>
        )}

        {/* Feed list */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
          </div>
        ) : feeds.length === 0 ? (
          <div className="mx-auto max-w-md rounded-2xl border border-dashed border-gray-800 bg-gray-900/30 px-6 py-12 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-600/10 ring-1 ring-purple-500/20">
              <Rss className="h-6 w-6 text-purple-400" />
            </div>
            <h2 className="text-base font-semibold text-gray-200">
              No feeds yet
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Wire up an RSS, arXiv, HN, GitHub releases, or URL poll source and
              new items will post into the channel you pick.
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-500"
            >
              <Plus className="h-4 w-4" />
              Add your first feed
            </button>
          </div>
        ) : visibleFeeds.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-800 bg-gray-900/30 px-6 py-10 text-center text-sm text-gray-500">
            No feeds match this filter.
          </div>
        ) : (
          <div className="space-y-3">
            {visibleFeeds.map((feed) => {
              const disabled = !feed.enabled;
              return (
                <div
                  key={feed.id}
                  className={`rounded-xl border bg-gray-900 p-5 transition-colors ${
                    disabled
                      ? "border-gray-800/70 opacity-70 hover:border-gray-700/70"
                      : "border-gray-800 hover:border-gray-700"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${KIND_DOT[feed.kind]}`} />
                        <h3 className="truncate font-semibold text-gray-100">
                          {feed.label}
                        </h3>
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ring-inset ${
                            KIND_BADGE[feed.kind]
                          }`}
                        >
                          {KIND_LABEL[feed.kind]}
                        </span>
                        {feed.channel && (
                          <span className="flex items-center gap-1 rounded-md bg-gray-800/80 px-2 py-0.5 text-[11px] text-gray-400 ring-1 ring-inset ring-gray-700/60">
                            <Hash className="h-3 w-3" />
                            {feed.channel.name}
                          </span>
                        )}
                        {disabled && (
                          <span className="rounded-md bg-gray-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500 ring-1 ring-inset ring-gray-700">
                            Disabled
                          </span>
                        )}
                      </div>
                      <a
                        href={feed.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group mb-3 flex items-center gap-1 truncate text-xs text-gray-500 transition-colors hover:text-gray-300"
                      >
                        <span className="truncate">{feed.source_url}</span>
                        <ExternalLink className="h-3 w-3 flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                      </a>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-500">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Last polled {relativeTime(feed.last_polled_at)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Zap className="h-3 w-3" />
                          Every {feed.poll_interval_minutes}m
                        </span>
                        <span className="flex items-center gap-1">
                          <Package className="h-3 w-3" />
                          {feed.item_count ?? 0}{" "}
                          {feed.item_count === 1 ? "item" : "items"}
                        </span>
                      </div>
                      {feed.last_error && (
                        <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-[11px] text-red-300">
                          <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-red-400" />
                          <div className="min-w-0 flex-1">
                            <div className="mb-0.5 font-semibold uppercase tracking-wider text-red-400">
                              Last error
                            </div>
                            <div className="truncate">{feed.last_error}</div>
                          </div>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => toggleFeed(feed.id, feed.enabled)}
                      title={feed.enabled ? "Disable feed" : "Enable feed"}
                      aria-label={feed.enabled ? "Disable feed" : "Enable feed"}
                      className="flex-shrink-0 rounded-lg p-1 transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      {feed.enabled ? (
                        <ToggleRight className="h-7 w-7 text-purple-400 transition-colors hover:text-purple-300" />
                      ) : (
                        <ToggleLeft className="h-7 w-7 text-gray-600 transition-colors hover:text-gray-400" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
