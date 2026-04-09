"use client";

import { useState } from "react";
import { Search, MessageSquare, FileText, Clock, Hash } from "lucide-react";

interface SearchResult {
  content: string;
  source_type: "message" | "document" | "graph";
  channel?: string | null;
  created_at?: string | null;
  relevance?: number;
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    setSearching(true);
    setHasSearched(true);

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

  const sourceIcon = (type: string) => {
    switch (type) {
      case "message":
        return <MessageSquare className="h-4 w-4 text-blue-400" />;
      case "document":
        return <FileText className="h-4 w-4 text-green-400" />;
      default:
        return <Search className="h-4 w-4 text-purple-400" />;
    }
  };

  const sourceLabel = (type: string) => {
    switch (type) {
      case "message":
        return "Chat message";
      case "document":
        return "Document";
      case "graph":
        return "Knowledge graph";
      default:
        return type;
    }
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-gray-800 bg-gray-900/50 px-6 py-3">
        <Search className="h-5 w-5 text-purple-400" />
        <h1 className="text-lg font-semibold text-gray-100">Search</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        {/* Search form */}
        <form onSubmit={handleSearch} className="mb-8 max-w-2xl mx-auto">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search messages, documents, and knowledge..."
                className="w-full rounded-xl border border-gray-700 bg-gray-800 py-3 pl-10 pr-4 text-sm text-gray-100 placeholder-gray-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={searching || !query.trim()}
              className="rounded-xl bg-purple-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {searching ? "Searching..." : "Search"}
            </button>
          </div>
        </form>

        {/* Results */}
        {searching ? (
          <div className="flex justify-center py-12">
            <div className="flex flex-col items-center gap-3">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
              <span className="text-sm text-gray-500">Searching...</span>
            </div>
          </div>
        ) : hasSearched && results.length === 0 ? (
          <div className="text-center py-12 max-w-md mx-auto">
            <Search className="mx-auto h-12 w-12 text-gray-700 mb-3" />
            <p className="text-gray-400">No results found</p>
            <p className="text-gray-600 text-sm mt-1">
              Try different keywords or check your spelling.
            </p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-3">
            {results.map((result, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-gray-800 bg-gray-900 p-5 transition-colors hover:border-gray-700"
              >
                <div className="flex items-center gap-3 mb-2">
                  {sourceIcon(result.source_type)}
                  <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                    {sourceLabel(result.source_type)}
                  </span>
                  {result.channel && (
                    <span className="flex items-center gap-1 text-xs text-gray-500">
                      <Hash className="h-3 w-3" />
                      {result.channel}
                    </span>
                  )}
                  {result.created_at && (
                    <span className="flex items-center gap-1 text-xs text-gray-600 ml-auto">
                      <Clock className="h-3 w-3" />
                      {new Date(result.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-300 leading-relaxed line-clamp-3">
                  {result.content}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
