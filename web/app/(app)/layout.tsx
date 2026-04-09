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

  return (
    <div className="flex h-screen overflow-hidden bg-gray-950">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col bg-gray-900 border-r border-gray-800">
        {/* Header */}
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-gray-800">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-600/20">
            <Brain className="h-5 w-5 text-purple-400" />
          </div>
          <span className="text-lg font-bold tracking-tight">
            <span className="text-purple-400">Premium</span>
            <span className="text-gray-100">Minds</span>
          </span>
        </div>

        {/* Nav links */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          <div className="mb-3 px-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Navigation
          </div>
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const isActive =
              pathname === href ||
              (href !== "/chat/general" && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-purple-600/15 text-purple-300"
                    : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
                }`}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                {label}
              </Link>
            );
          })}

          {/* Lanes */}
          {lanes.length > 0 && (
            <>
              <div className="mt-6 mb-3 px-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Lanes
              </div>
              {lanes.map((lane) => {
                const href = `/chat/${lane.slug}`;
                const isActive = pathname === href;
                const LaneIcon =
                  (lane.icon &&
                    (Icons as unknown as Record<string, Icons.LucideIcon>)[
                      lane.icon
                    ]) ||
                  Icons.Hash;
                const colorClass =
                  (lane.color && LANE_TEXT[lane.color]) || "text-gray-400";
                return (
                  <Link
                    key={lane.id}
                    href={href}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                      isActive
                        ? "bg-purple-600/15 text-purple-300"
                        : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
                    }`}
                  >
                    <LaneIcon
                      className={`h-4 w-4 flex-shrink-0 ${colorClass}`}
                    />
                    <span className="truncate">{lane.name}</span>
                  </Link>
                );
              })}
            </>
          )}

          {/* Catch-all */}
          <div className="mt-6 mb-3 px-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Catch-all
          </div>
          <Link
            href="/chat/general"
            className={`flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
              pathname === "/chat/general"
                ? "bg-purple-600/15 text-purple-300"
                : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
            }`}
          >
            <Hash className="h-3.5 w-3.5 flex-shrink-0 opacity-60" />
            general
          </Link>
        </nav>

        {/* User info & sign out */}
        <div className="border-t border-gray-800 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-200">
                {user?.email}
              </p>
              <p className="text-xs text-gray-500">Online</p>
            </div>
            <button
              onClick={handleSignOut}
              title="Sign out"
              className="flex-shrink-0 rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-800 hover:text-red-400"
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
