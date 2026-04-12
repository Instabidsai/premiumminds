"use client";

import { useEffect, useRef, useState } from "react";
import {
  Search,
  MessageSquare,
  FileText,
  Clock,
  Hash,
  Network,
  Sparkles,
  X,
  Command,
} from "lucide-react";

type SourceType = "message" | "document" | "graph";

interface SearchResult {
  content: string;
  source_type: SourceType;
  channel?: string | null;
  created_at?: string | null;
  relevance?: number;
}

const SOURCE_META: Record<
  SourceType,
  { label: string; Icon: typeof Search; tint: string; bg: string; border: string }
> = {
  message: {
    label: "Chat message",
    Icon: MessageSquare,
    tint: "text-blue-300",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
  },
  document: {
    label: "Document",
    Icon: FileText,
    tint: "text-emerald-300",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
  },
  graph: {
    label: "Knowledge graph",
    Icon: Network,
    tint: "text-purple-300",
    bg: "bg-purple-500/10",
    border: "border-purple-500/20",
  },
};

function highlight(content: string, query: string): React.ReactNode {
  const trimmed = query.trim();
  if (!trimmed) return content;
  // escape regex special chars
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = content.split(new RegExp(`(${escaped})`, "ig"));
  return parts.map((part, i) =>
    part.toLowerCase() === trimmed.toLowerCase() ? (
      <mark
        key={i}
        className="rounded bg-purple-500/30 px-0.5 text-purple-100"
      >
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [lastQuery, setLastQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [activeFilter, setActiveFilter] = useState<SourceType | "all">("all");
  const inputRef = useRef<HTMLInputElement>(null);

  // Cmd/Ctrl+K focuses the search bar
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
      if (e.key === "Escape" && document.activeElement === inputRef.current) {
        inputRef.current?.blur();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    setSearching(true);
    setHasSearched(true);
    setLastQuery(trimmed);

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
      });

      if (res.ok) {
        const data = await res.json();
        setResults(data.results || []);
      } else {
        setResults([]);
      }
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  const filtered =
    activeFilter === "all"
      ? results
      : results.filter((r) => r.source_type === activeFilter);

  const counts = {
    all: results.length,
    message: results.filter((r) => r.source_type === "message").length,
    document: results.filter((r) => r.source_type === "document").length,
    graph: results.filter((r) => r.source_type === "graph").length,
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-gray-800 bg-gray-900/50 px-6 py-3">
        <Search className="h-5 w-5 text-purple-400" />
        <h1 className="text-lg font-semibold text-gray-100">Search</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-8">
        {/* Search form */}
        <form onSubmit={handleSearch} className="mx-auto max-w-3xl">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search messages, documents, and the knowledge graph..."
              className="search-focus-glow w-full rounded-2xl border border-gray-800 bg-gray-900 py-4 pl-12 pr-36 text-base text-gray-100 placeholder-gray-500 shadow-lg shadow-black/20 transition-all focus:border-purple-500 focus:outline-none"
              autoFocus
            />
            <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    inputRef.current?.focus();
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-200"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              {!query && (
                <span className="hidden items-center gap-1 rounded-md border border-gray-700 bg-gray-800/70 px-2 py-1 text-[11px] font-medium text-gray-400 sm:inline-flex">
                  <Command className="h-3 w-3" />K
                </span>
              )}
              <button
                type="submit"
                disabled={searching || !query.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {searching ? (
                  <>
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
                    <span className="hidden sm:inline">Searching</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    <span className="hidden sm:inline">Search</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Filter chips - only show after a search */}
          {hasSearched && !searching && results.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {(["all", "message", "document", "graph"] as const).map((f) => {
                const active = activeFilter === f;
                const count = counts[f];
                const label =
                  f === "all" ? "All" : SOURCE_META[f as SourceType].label;
                const Icon =
                  f === "all" ? Sparkles : SOURCE_META[f as SourceType].Icon;
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setActiveFilter(f)}
                    disabled={count === 0}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      active
                        ? "border-purple-500 bg-purple-500/15 text-purple-200"
                        : "border-gray-800 bg-gray-900 text-gray-400 hover:border-gray-700 hover:text-gray-200"
                    }`}
                  >
                    <Icon className="h-3 w-3" />
                    {label}
                    <span
                      className={`ml-0.5 rounded-full px-1.5 text-[10px] ${
                        active ? "bg-purple-500/30" : "bg-gray-800"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </form>

        {/* Results region */}
        <div className="mx-auto mt-8 max-w-3xl">
          {searching ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="animate-pulse rounded-xl border border-gray-800 bg-gray-900 p-5"
                >
                  <div className="mb-3 flex items-center gap-3">
                    <div className="h-4 w-4 rounded bg-gray-800" />
                    <div className="h-3 w-24 rounded bg-gray-800" />
                    <div className="h-3 w-16 rounded bg-gray-800" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-3 w-full rounded bg-gray-800" />
                    <div className="h-3 w-5/6 rounded bg-gray-800" />
                    <div className="h-3 w-2/3 rounded bg-gray-800" />
                  </div>
                </div>
              ))}
            </div>
          ) : !hasSearched ? (
            // Initial state: never searched
            <div className="mx-auto max-w-md rounded-2xl border border-dashed border-gray-800 bg-gray-900/40 px-6 py-12 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-600/15">
                <Sparkles className="h-7 w-7 text-purple-300" />
              </div>
              <h3 className="text-base font-semibold text-gray-100">
                Ask the group mind anything
              </h3>
              <p className="mt-1 text-sm text-gray-400">
                Search across every channel message, uploaded document, and
                knowledge graph node in one shot.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {[
                  "latest Graphiti notes",
                  "MCP setup",
                  "onboarding playbook",
                ].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setQuery(s);
                      inputRef.current?.focus();
                    }}
                    className="rounded-full border border-gray-800 bg-gray-900 px-3 py-1 text-xs text-gray-400 transition-colors hover:border-purple-600/50 hover:bg-purple-600/10 hover:text-purple-200"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : filtered.length === 0 ? (
            // Searched but no matches
            <div className="mx-auto max-w-md rounded-2xl border border-dashed border-gray-800 bg-gray-900/40 px-6 py-12 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-800">
                <Search className="h-7 w-7 text-gray-500" />
              </div>
              <h3 className="text-base font-semibold text-gray-100">
                No matches for {lastQuery ? `"${lastQuery}"` : "that query"}
              </h3>
              <p className="mt-1 text-sm text-gray-400">
                Try different keywords, broaden the wording, or check your
                spelling.
              </p>
              {activeFilter !== "all" && results.length > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveFilter("all")}
                  className="mt-4 rounded-lg border border-purple-600/40 bg-purple-600/10 px-3 py-1.5 text-xs font-medium text-purple-200 transition-colors hover:bg-purple-600/20"
                >
                  Show all {results.length} results
                </button>
              )}
            </div>
          ) : (
            <>
              <p className="mb-3 text-xs text-gray-500">
                {filtered.length} {filtered.length === 1 ? "result" : "results"}
                {lastQuery ? (
                  <>
                    {" "}
                    for{" "}
                    <span className="text-gray-300">&quot;{lastQuery}&quot;</span>
                  </>
                ) : null}
              </p>
              <div className="space-y-3">
                {filtered.map((result, idx) => {
                  const meta = SOURCE_META[result.source_type] ?? SOURCE_META.graph;
                  const Icon = meta.Icon;
                  const relevancePct =
                    typeof result.relevance === "number"
                      ? Math.round(Math.max(0, Math.min(1, result.relevance)) * 100)
                      : null;
                  return (
                    <article
                      key={idx}
                      className="group rounded-xl border border-gray-800 bg-gray-900 p-5 transition-all hover:-translate-y-0.5 hover:border-purple-600/60 hover:shadow-lg hover:shadow-purple-950/30"
                    >
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium ${meta.border} ${meta.bg} ${meta.tint}`}
                        >
                          <Icon className="h-3 w-3" />
                          {meta.label}
                        </span>
                        {result.channel && (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                            <Hash className="h-3 w-3" />
                            {result.channel}
                          </span>
                        )}
                        {result.created_at && (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                            <Clock className="h-3 w-3" />
                            {new Date(result.created_at).toLocaleDateString(
                              "en-US",
                              {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              }
                            )}
                          </span>
                        )}
                        {relevancePct !== null && (
                          <span
                            className="ml-auto inline-flex items-center gap-2"
                            title={`Relevance: ${relevancePct}%`}
                          >
                            <span className="h-1 w-16 overflow-hidden rounded-full bg-gray-800">
                              <span
                                className="block h-full rounded-full bg-purple-500"
                                style={{ width: `${relevancePct}%` }}
                              />
                            </span>
                            <span className="text-[10px] font-medium text-gray-500">
                              {relevancePct}%
                            </span>
                          </span>
                        )}
                      </div>
                      <p className="text-sm leading-relaxed text-gray-300 line-clamp-4 group-hover:text-gray-200">
                        {highlight(result.content, lastQuery)}
                      </p>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
