"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";
import * as Icons from "lucide-react";
import {
  LayoutGrid,
  MessageSquare,
  Clock,
  ArrowRight,
  Sparkles,
  Activity,
} from "lucide-react";

interface Lane {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string | null;
  color: string | null;
  bridges_to: string[] | null;
  sort_order: number | null;
}

interface LaneStats {
  message_count: number;
  last_activity: string | null;
}

// Tailwind can't compile dynamic class names, so we map lane color -> full class strings.
const COLOR_STYLES: Record<
  string,
  {
    text: string;
    textStrong: string;
    bgIcon: string;
    border: string;
    bg: string;
    hoverBorder: string;
    chip: string;
    gradient: string;
    ring: string;
    dot: string;
    glow: string;
  }
> = {
  purple: {
    text: "text-purple-400",
    textStrong: "text-purple-300",
    bgIcon: "bg-purple-500/10",
    border: "border-purple-500/30",
    bg: "bg-purple-500/5",
    hoverBorder: "hover:border-purple-400/70",
    chip: "bg-purple-500/10 text-purple-300 border-purple-500/20",
    gradient: "from-purple-500/15 via-purple-500/5 to-transparent",
    ring: "ring-purple-500/40",
    dot: "bg-purple-400",
    glow: "shadow-purple-500/10",
  },
  amber: {
    text: "text-amber-400",
    textStrong: "text-amber-300",
    bgIcon: "bg-amber-500/10",
    border: "border-amber-500/30",
    bg: "bg-amber-500/5",
    hoverBorder: "hover:border-amber-400/70",
    chip: "bg-amber-500/10 text-amber-300 border-amber-500/20",
    gradient: "from-amber-500/15 via-amber-500/5 to-transparent",
    ring: "ring-amber-500/40",
    dot: "bg-amber-400",
    glow: "shadow-amber-500/10",
  },
  blue: {
    text: "text-blue-400",
    textStrong: "text-blue-300",
    bgIcon: "bg-blue-500/10",
    border: "border-blue-500/30",
    bg: "bg-blue-500/5",
    hoverBorder: "hover:border-blue-400/70",
    chip: "bg-blue-500/10 text-blue-300 border-blue-500/20",
    gradient: "from-blue-500/15 via-blue-500/5 to-transparent",
    ring: "ring-blue-500/40",
    dot: "bg-blue-400",
    glow: "shadow-blue-500/10",
  },
  emerald: {
    text: "text-emerald-400",
    textStrong: "text-emerald-300",
    bgIcon: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    bg: "bg-emerald-500/5",
    hoverBorder: "hover:border-emerald-400/70",
    chip: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
    gradient: "from-emerald-500/15 via-emerald-500/5 to-transparent",
    ring: "ring-emerald-500/40",
    dot: "bg-emerald-400",
    glow: "shadow-emerald-500/10",
  },
  sky: {
    text: "text-sky-400",
    textStrong: "text-sky-300",
    bgIcon: "bg-sky-500/10",
    border: "border-sky-500/30",
    bg: "bg-sky-500/5",
    hoverBorder: "hover:border-sky-400/70",
    chip: "bg-sky-500/10 text-sky-300 border-sky-500/20",
    gradient: "from-sky-500/15 via-sky-500/5 to-transparent",
    ring: "ring-sky-500/40",
    dot: "bg-sky-400",
    glow: "shadow-sky-500/10",
  },
  rose: {
    text: "text-rose-400",
    textStrong: "text-rose-300",
    bgIcon: "bg-rose-500/10",
    border: "border-rose-500/30",
    bg: "bg-rose-500/5",
    hoverBorder: "hover:border-rose-400/70",
    chip: "bg-rose-500/10 text-rose-300 border-rose-500/20",
    gradient: "from-rose-500/15 via-rose-500/5 to-transparent",
    ring: "ring-rose-500/40",
    dot: "bg-rose-400",
    glow: "shadow-rose-500/10",
  },
};

const DEFAULT_STYLE = {
  text: "text-gray-400",
  textStrong: "text-gray-300",
  bgIcon: "bg-gray-500/10",
  border: "border-gray-800",
  bg: "bg-gray-900/40",
  hoverBorder: "hover:border-gray-600",
  chip: "bg-gray-800 text-gray-300 border-gray-700",
  gradient: "from-gray-700/15 via-gray-700/5 to-transparent",
  ring: "ring-gray-600/40",
  dot: "bg-gray-500",
  glow: "shadow-gray-900/10",
};

function formatRelative(iso: string | null): string {
  if (!iso) return "no activity yet";
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

// A lane is "live" if it has had activity in the last 2 hours.
function isLive(iso: string | null): boolean {
  if (!iso) return false;
  const diffMs = Date.now() - new Date(iso).getTime();
  return diffMs < 1000 * 60 * 60 * 2;
}

export default function LanesPage() {
  const supabase = createBrowserClient();
  const [lanes, setLanes] = useState<Lane[]>([]);
  const [stats, setStats] = useState<Record<string, LaneStats>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data: laneData } = await supabase
        .from("lanes")
        .select("id, slug, name, description, icon, color, bridges_to, sort_order")
        .order("sort_order", { ascending: true });

      if (cancelled) return;

      if (!laneData) {
        setLoading(false);
        return;
      }

      setLanes(laneData as Lane[]);

      // For each lane, look up the matching channel and its message stats.
      const slugs = laneData.map((l) => l.slug);
      const { data: channelData } = await supabase
        .from("channels")
        .select("id, slug")
        .in("slug", slugs);

      const channelBySlug = new Map<string, string>();
      (channelData || []).forEach((c: { id: string; slug: string }) => {
        channelBySlug.set(c.slug, c.id);
      });

      const nextStats: Record<string, LaneStats> = {};

      await Promise.all(
        laneData.map(async (lane) => {
          const channelId = channelBySlug.get(lane.slug);
          if (!channelId) {
            nextStats[lane.slug] = { message_count: 0, last_activity: null };
            return;
          }

          const [{ count }, { data: latest }] = await Promise.all([
            supabase
              .from("messages")
              .select("id", { count: "exact", head: true })
              .eq("channel_id", channelId),
            supabase
              .from("messages")
              .select("created_at")
              .eq("channel_id", channelId)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle(),
          ]);

          nextStats[lane.slug] = {
            message_count: count ?? 0,
            last_activity: latest?.created_at ?? null,
          };
        })
      );

      if (cancelled) return;
      setStats(nextStats);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-950">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
          <span className="text-sm text-gray-400">Loading lanes...</span>
        </div>
      </div>
    );
  }

  if (lanes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-950 text-gray-400">
        <div className="flex flex-col items-center gap-3">
          <LayoutGrid className="h-10 w-10 text-gray-600" />
          <p>No lanes configured yet.</p>
        </div>
      </div>
    );
  }

  // Derive summary numbers for the header.
  const totalMessages = lanes.reduce(
    (sum, l) => sum + (stats[l.slug]?.message_count ?? 0),
    0
  );
  const activeLanes = lanes.filter((l) =>
    isLive(stats[l.slug]?.last_activity ?? null)
  ).length;

  // Pick the "featured" lane = most messages. Falls back to sort_order[0].
  let featuredSlug = lanes[0]?.slug;
  let featuredCount = -1;
  for (const l of lanes) {
    const c = stats[l.slug]?.message_count ?? 0;
    if (c > featuredCount) {
      featuredCount = c;
      featuredSlug = l.slug;
    }
  }
  // Only treat as "featured" if at least one lane actually has messages.
  const hasAnyMessages = featuredCount > 0;
  const featuredLane = hasAnyMessages
    ? lanes.find((l) => l.slug === featuredSlug)
    : undefined;
  const restLanes = featuredLane
    ? lanes.filter((l) => l.slug !== featuredLane.slug)
    : lanes;

  const resolveStyle = (lane: Lane) =>
    (lane.color && COLOR_STYLES[lane.color]) || DEFAULT_STYLE;

  const resolveIcon = (lane: Lane) =>
    (lane.icon &&
      (Icons as unknown as Record<string, Icons.LucideIcon>)[lane.icon]) ||
    Icons.Hash;

  return (
    <div className="h-full overflow-y-auto bg-gray-950">
      <div className="mx-auto max-w-6xl px-6 py-10">
        {/* Header */}
        <div className="mb-10">
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10 ring-1 ring-purple-500/30">
              <LayoutGrid className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-gray-100">
                Architect Lanes
              </h1>
              <p className="text-sm text-gray-500">
                Six lanes for the machinery underneath an agent.
              </p>
            </div>
          </div>

          {/* Summary strip */}
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-full border border-gray-800 bg-gray-900/60 px-3 py-1.5 text-xs text-gray-300">
              <LayoutGrid className="h-3.5 w-3.5 text-gray-500" />
              <span>
                <span className="font-semibold text-gray-100">
                  {lanes.length}
                </span>{" "}
                lanes
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-gray-800 bg-gray-900/60 px-3 py-1.5 text-xs text-gray-300">
              <MessageSquare className="h-3.5 w-3.5 text-gray-500" />
              <span>
                <span className="font-semibold text-gray-100">
                  {totalMessages}
                </span>{" "}
                messages
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/5 px-3 py-1.5 text-xs text-emerald-300">
              <span className="relative flex h-2 w-2">
                <span
                  className={`absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 ${
                    activeLanes > 0 ? "animate-ping" : ""
                  }`}
                />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              <span>
                <span className="font-semibold">{activeLanes}</span> live now
              </span>
            </div>
          </div>
        </div>

        {/* Featured lane (most active) */}
        {featuredLane && (
          <div className="mb-5">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                Most active
              </span>
            </div>
            <FeaturedCard
              lane={featuredLane}
              stats={
                stats[featuredLane.slug] || {
                  message_count: 0,
                  last_activity: null,
                }
              }
              style={resolveStyle(featuredLane)}
              Icon={resolveIcon(featuredLane)}
            />
          </div>
        )}

        {/* Rest of the lanes */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {restLanes.map((lane) => {
            const style = resolveStyle(lane);
            const Icon = resolveIcon(lane);
            const laneStats = stats[lane.slug] || {
              message_count: 0,
              last_activity: null,
            };
            return (
              <LaneCard
                key={lane.id}
                lane={lane}
                stats={laneStats}
                style={style}
                Icon={Icon}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* --------------------------- Featured (hero) card --------------------------- */

function FeaturedCard({
  lane,
  stats,
  style,
  Icon,
}: {
  lane: Lane;
  stats: LaneStats;
  style: typeof DEFAULT_STYLE;
  Icon: Icons.LucideIcon;
}) {
  const live = isLive(stats.last_activity);
  const bridges = lane.bridges_to || [];
  const empty = stats.message_count === 0;

  return (
    <Link
      href={`/chat/${lane.slug}`}
      className={`group relative block overflow-hidden rounded-2xl border p-8 transition-all duration-200 ${style.border} ${style.bg} ${style.hoverBorder} hover:shadow-lg ${style.glow}`}
    >
      {/* Gradient sheen */}
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${style.gradient} opacity-60`}
      />
      {/* Decorative large icon */}
      <Icon
        className={`pointer-events-none absolute -right-6 -top-6 h-48 w-48 ${style.text} opacity-[0.07]`}
      />

      <div className="relative flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div className="flex-1">
          <div className="mb-4 flex items-center gap-3">
            <div
              className={`flex h-14 w-14 items-center justify-center rounded-xl ring-1 ${style.bgIcon} ${style.ring}`}
            >
              <Icon className={`h-7 w-7 ${style.text}`} />
            </div>
            {live && (
              <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                </span>
                Live
              </span>
            )}
          </div>

          <h2 className="text-2xl font-bold text-gray-50 md:text-3xl">
            {lane.name}
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-gray-400">
            {lane.description}
          </p>

          {bridges.length > 0 && (
            <div className="mt-5 flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                Bridges to
              </span>
              {bridges.map((bridge) => (
                <span
                  key={bridge}
                  className={`rounded-full border px-2 py-0.5 text-[11px] ${style.chip}`}
                >
                  {bridge}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Right side: stat block + CTA */}
        <div className="flex flex-col items-start gap-4 md:items-end">
          <div
            className={`rounded-xl border ${style.border} bg-gray-950/40 px-5 py-3 text-right`}
          >
            <div
              className={`text-3xl font-bold tabular-nums ${style.textStrong}`}
            >
              {stats.message_count}
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              messages
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <Clock className="h-3.5 w-3.5" />
            <span>{formatRelative(stats.last_activity)}</span>
          </div>
          <div
            className={`flex items-center gap-1.5 text-sm font-medium ${style.text} transition-transform group-hover:translate-x-0.5`}
          >
            {empty ? "Start the lane" : "Open lane"}
            <ArrowRight className="h-4 w-4" />
          </div>
        </div>
      </div>
    </Link>
  );
}

/* -------------------------------- Standard card ------------------------------- */

function LaneCard({
  lane,
  stats,
  style,
  Icon,
}: {
  lane: Lane;
  stats: LaneStats;
  style: typeof DEFAULT_STYLE;
  Icon: Icons.LucideIcon;
}) {
  const live = isLive(stats.last_activity);
  const empty = stats.message_count === 0;
  const bridges = lane.bridges_to || [];

  return (
    <Link
      href={`/chat/${lane.slug}`}
      className={`group relative flex min-h-[260px] flex-col gap-4 overflow-hidden rounded-xl border p-6 transition-all duration-200 ${style.border} ${style.bg} ${style.hoverBorder} hover:-translate-y-0.5 hover:shadow-lg ${style.glow}`}
    >
      {/* Gradient sheen */}
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${style.gradient} opacity-40 transition-opacity group-hover:opacity-70`}
      />

      <div className="relative flex items-start justify-between gap-4">
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-xl ring-1 ${style.bgIcon} ${style.ring}`}
        >
          <Icon className={`h-6 w-6 ${style.text}`} />
        </div>
        <div className="flex items-center gap-2">
          {live && (
            <span className="flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
              Live
            </span>
          )}
          {!empty && (
            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums ${style.chip}`}
            >
              {stats.message_count}
            </span>
          )}
        </div>
      </div>

      <div className="relative">
        <h2 className="text-xl font-semibold text-gray-100">{lane.name}</h2>
        <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-gray-400">
          {lane.description}
        </p>
      </div>

      {/* Push footer to bottom */}
      <div className="relative mt-auto flex flex-col gap-3">
        {bridges.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {bridges.map((bridge) => (
              <span
                key={bridge}
                className={`rounded-full border px-2 py-0.5 text-[11px] ${style.chip}`}
              >
                {bridge}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-gray-800/70 pt-3">
          {empty ? (
            <span className="flex items-center gap-1.5 text-xs text-gray-600">
              <Activity className="h-3.5 w-3.5" />
              <span>waiting for first message</span>
            </span>
          ) : (
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <div className="flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5" />
                <span className="tabular-nums">
                  {stats.message_count} msgs
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                <span>{formatRelative(stats.last_activity)}</span>
              </div>
            </div>
          )}
          <div
            className={`flex items-center gap-1 text-xs font-medium ${style.text} transition-transform group-hover:translate-x-0.5`}
          >
            <span>{empty ? "Open" : "View"}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </div>
        </div>
      </div>
    </Link>
  );
}
