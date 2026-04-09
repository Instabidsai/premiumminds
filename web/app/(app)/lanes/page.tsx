"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";
import * as Icons from "lucide-react";
import { LayoutGrid, MessageSquare, Clock, ArrowRight } from "lucide-react";

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
    bgIcon: string;
    border: string;
    bg: string;
    hoverBorder: string;
    chip: string;
  }
> = {
  purple: {
    text: "text-purple-400",
    bgIcon: "bg-purple-500/10",
    border: "border-purple-500/30",
    bg: "bg-purple-500/5",
    hoverBorder: "hover:border-purple-400/60",
    chip: "bg-purple-500/10 text-purple-300 border-purple-500/20",
  },
  amber: {
    text: "text-amber-400",
    bgIcon: "bg-amber-500/10",
    border: "border-amber-500/30",
    bg: "bg-amber-500/5",
    hoverBorder: "hover:border-amber-400/60",
    chip: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  },
  blue: {
    text: "text-blue-400",
    bgIcon: "bg-blue-500/10",
    border: "border-blue-500/30",
    bg: "bg-blue-500/5",
    hoverBorder: "hover:border-blue-400/60",
    chip: "bg-blue-500/10 text-blue-300 border-blue-500/20",
  },
  emerald: {
    text: "text-emerald-400",
    bgIcon: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    bg: "bg-emerald-500/5",
    hoverBorder: "hover:border-emerald-400/60",
    chip: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  },
  sky: {
    text: "text-sky-400",
    bgIcon: "bg-sky-500/10",
    border: "border-sky-500/30",
    bg: "bg-sky-500/5",
    hoverBorder: "hover:border-sky-400/60",
    chip: "bg-sky-500/10 text-sky-300 border-sky-500/20",
  },
  rose: {
    text: "text-rose-400",
    bgIcon: "bg-rose-500/10",
    border: "border-rose-500/30",
    bg: "bg-rose-500/5",
    hoverBorder: "hover:border-rose-400/60",
    chip: "bg-rose-500/10 text-rose-300 border-rose-500/20",
  },
};

const DEFAULT_STYLE = {
  text: "text-gray-400",
  bgIcon: "bg-gray-500/10",
  border: "border-gray-700",
  bg: "bg-gray-900/40",
  hoverBorder: "hover:border-gray-500",
  chip: "bg-gray-800 text-gray-300 border-gray-700",
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

  return (
    <div className="h-full overflow-y-auto bg-gray-950">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex items-center gap-3">
          <LayoutGrid className="h-6 w-6 text-purple-400" />
          <h1 className="text-2xl font-bold text-gray-100">Architect Lanes</h1>
        </div>
        <p className="mb-8 max-w-2xl text-sm text-gray-400">
          Six lanes for the machinery underneath an agent. Click a lane to jump
          into its channel.
        </p>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {lanes.map((lane) => {
            const style =
              (lane.color && COLOR_STYLES[lane.color]) || DEFAULT_STYLE;
            const Icon =
              (lane.icon &&
                (Icons as unknown as Record<string, Icons.LucideIcon>)[
                  lane.icon
                ]) ||
              Icons.Hash;
            const laneStats = stats[lane.slug] || {
              message_count: 0,
              last_activity: null,
            };
            const bridges = lane.bridges_to || [];

            return (
              <Link
                key={lane.id}
                href={`/chat/${lane.slug}`}
                className={`group relative flex flex-col gap-4 rounded-xl border p-6 transition-all ${style.border} ${style.bg} ${style.hoverBorder}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-xl ${style.bgIcon}`}
                  >
                    <Icon className={`h-6 w-6 ${style.text}`} />
                  </div>
                  <ArrowRight
                    className={`h-5 w-5 ${style.text} opacity-0 transition-opacity group-hover:opacity-100`}
                  />
                </div>

                <div>
                  <h2 className="text-xl font-semibold text-gray-100">
                    {lane.name}
                  </h2>
                  <p className="mt-1.5 text-sm leading-relaxed text-gray-400">
                    {lane.description}
                  </p>
                </div>

                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <div className="flex items-center gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5" />
                    <span>{laneStats.message_count} msgs</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{formatRelative(laneStats.last_activity)}</span>
                  </div>
                </div>

                {bridges.length > 0 && (
                  <div className="border-t border-gray-800/70 pt-3">
                    <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                      Bridges to
                    </div>
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
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
