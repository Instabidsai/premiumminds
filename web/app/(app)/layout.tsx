"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";
import * as Icons from "lucide-react";
import {
  MessageSquare,
  Brain,
  FileText,
  Search,
  LogOut,
  Hash,
  LayoutGrid,
  Scale,
  Lightbulb,
  Rss,
} from "lucide-react";

interface Lane {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  color: string | null;
  sort_order: number | null;
}

const NAV_ITEMS = [
  { href: "/chat/general", label: "Chat", icon: MessageSquare },
  { href: "/lanes", label: "Lanes", icon: LayoutGrid },
  { href: "/mindmap", label: "Mind Map", icon: Brain },
  { href: "/docs", label: "Docs", icon: FileText },
  { href: "/search", label: "Search", icon: Search },
  { href: "/build-vs-raid", label: "Build vs Raid", icon: Scale },
  { href: "/requests", label: "Feature Requests", icon: Lightbulb },
  { href: "/feeds", label: "Feeds", icon: Rss },
];

// Tailwind needs full class strings at build time, so we map lane colors -> classes.
const LANE_TEXT: Record<string, string> = {
  purple: "text-purple-400",
  amber: "text-amber-400",
  blue: "text-blue-400",
  emerald: "text-emerald-400",
  sky: "text-sky-400",
  rose: "text-rose-400",
};

const LANE_DOT: Record<string, string> = {
  purple: "bg-purple-400",
  amber: "bg-amber-400",
  blue: "bg-blue-400",
  emerald: "bg-emerald-400",
  sky: "bg-sky-400",
  rose: "bg-rose-400",
};

// CSS-only placeholder for "unread activity" — tag a few lane slugs so the
// dot renders without needing real tracking yet.
const DEMO_UNREAD_SLUGS = new Set<string>(["builds", "research", "wins"]);

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createBrowserClient();

  const [user, setUser] = useState<User | null>(null);
  const [lanes, setLanes] = useState<Lane[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (!currentUser) {
        router.push("/");
        return;
      }

      setUser(currentUser);

      // Fetch lanes ordered by sort_order
      const { data: laneData } = await supabase
        .from("lanes")
        .select("id, slug, name, icon, color, sort_order")
        .order("sort_order", { ascending: true });

      if (laneData) setLanes(laneData as Lane[]);
      setLoading(false);
    }

    init();
  }, [supabase, router]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/");
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
          <span className="text-sm text-gray-400">Loading...</span>
        </div>
      </div>
    );
  }

  function isNavActive(href: string): boolean {
    if (href === "/chat/general") {
      return pathname === "/chat/general";
    }
    return pathname === href || pathname.startsWith(href + "/");
  }

  const userInitial = user?.email?.[0]?.toUpperCase() ?? "?";

  return (
    <div className="flex h-screen overflow-hidden bg-gray-950">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col border-r border-gray-800 bg-gray-900">
        {/* Brand header */}
        <div className="flex items-center gap-2.5 border-b border-gray-800 px-5 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-600/20 ring-1 ring-purple-500/30">
            <Brain className="h-5 w-5 text-purple-400" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-[15px] font-bold tracking-tight">
              <span className="text-purple-400">Premium</span>
              <span className="text-gray-100">Minds</span>
            </span>
            <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
              Group Mind
            </span>
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            Navigation
          </div>
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isNavActive(href);
            return (
              <Link
                key={href}
                href={href}
                className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-purple-600/15 text-purple-200 ring-1 ring-inset ring-purple-500/30"
                    : "text-gray-400 hover:bg-gray-800/70 hover:text-gray-100"
                }`}
              >
                {active && (
                  <span
                    aria-hidden
                    className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-purple-400"
                  />
                )}
                <Icon
                  className={`h-4 w-4 flex-shrink-0 transition-colors ${
                    active
                      ? "text-purple-300"
                      : "text-gray-500 group-hover:text-gray-300"
                  }`}
                />
                <span className="truncate">{label}</span>
              </Link>
            );
          })}

          {/* Lanes */}
          {lanes.length > 0 && (
            <>
              <div className="mb-2 mt-6 flex items-center justify-between px-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  Lanes
                </span>
                <span className="text-[10px] font-medium text-gray-600">
                  {lanes.length}
                </span>
              </div>
              {lanes.map((lane) => {
                const href = `/chat/${lane.slug}`;
                const active = pathname === href;
                const LaneIcon =
                  (lane.icon &&
                    (Icons as unknown as Record<string, Icons.LucideIcon>)[
                      lane.icon
                    ]) ||
                  Icons.Hash;
                const colorClass =
                  (lane.color && LANE_TEXT[lane.color]) || "text-gray-400";
                const dotClass =
                  (lane.color && LANE_DOT[lane.color]) || "bg-gray-400";
                const hasUnread = DEMO_UNREAD_SLUGS.has(lane.slug);
                return (
                  <Link
                    key={lane.id}
                    href={href}
                    className={`group relative flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                      active
                        ? "bg-purple-600/15 text-purple-200 ring-1 ring-inset ring-purple-500/30"
                        : "text-gray-400 hover:bg-gray-800/70 hover:text-gray-100"
                    }`}
                  >
                    {active && (
                      <span
                        aria-hidden
                        className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r-full bg-purple-400"
                      />
                    )}
                    <LaneIcon
                      className={`h-4 w-4 flex-shrink-0 ${colorClass}`}
                    />
                    <span className="flex-1 truncate">{lane.name}</span>
                    {hasUnread && (
                      <span
                        aria-label="unread activity"
                        className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${dotClass} shadow-[0_0_6px_currentColor]`}
                      />
                    )}
                  </Link>
                );
              })}
            </>
          )}

          {/* Catch-all */}
          <div className="mb-2 mt-6 px-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            Catch-all
          </div>
          <Link
            href="/chat/general"
            className={`group relative flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
              pathname === "/chat/general"
                ? "bg-purple-600/15 text-purple-200 ring-1 ring-inset ring-purple-500/30"
                : "text-gray-400 hover:bg-gray-800/70 hover:text-gray-100"
            }`}
          >
            {pathname === "/chat/general" && (
              <span
                aria-hidden
                className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r-full bg-purple-400"
              />
            )}
            <Hash className="h-3.5 w-3.5 flex-shrink-0 opacity-60" />
            <span className="truncate">general</span>
          </Link>
        </nav>

        {/* User info & sign out */}
        <div className="border-t border-gray-800 bg-gray-900/60 px-3 py-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-1.5">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-800 text-xs font-semibold uppercase text-purple-300 ring-1 ring-gray-700">
              {userInitial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-200">
                {user?.email}
              </p>
              <p className="flex items-center gap-1.5 text-[11px] text-gray-500">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Online
              </p>
            </div>
            <button
              onClick={handleSignOut}
              title="Sign out"
              aria-label="Sign out"
              className="flex-shrink-0 rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-600"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
