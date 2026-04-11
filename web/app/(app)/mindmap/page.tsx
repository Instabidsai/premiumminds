"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/supabase";
import GraphView from "@/components/mindmap/GraphView";
import { Brain, Filter, Hash, X } from "lucide-react";

interface Channel {
  id: string;
  slug: string;
  name: string;
}

export default function MindMapPage() {
  const supabase = createBrowserClient();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string | undefined>(
    undefined
  );

  useEffect(() => {
    async function loadChannels() {
      const { data } = await supabase
        .from("channels")
        .select("id, slug, name")
        .order("name");
      if (data) setChannels(data);
    }
    loadChannels();
  }, [supabase]);

  const activeChannel = useMemo(
    () => channels.find((c) => c.slug === selectedSlug),
    [channels, selectedSlug]
  );

  return (
    <div className="flex h-full flex-col bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/60 backdrop-blur px-6 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-purple-500/30 bg-purple-500/10">
              <Brain className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-100">
                Mind Map
              </h1>
              <p className="mt-0.5 text-sm text-gray-400">
                Live knowledge graph of humans, agents, channels, and topics.
                {activeChannel ? (
                  <>
                    {" "}
                    Focused on{" "}
                    <span className="text-purple-300">
                      #{activeChannel.name}
                    </span>
                    .
                  </>
                ) : (
                  <> Showing everything across {channels.length} channels.</>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="group relative flex items-center">
              <Filter className="pointer-events-none absolute left-3 h-4 w-4 text-gray-500 group-focus-within:text-purple-400" />
              <select
                aria-label="Filter by channel"
                value={selectedSlug ?? ""}
                onChange={(e) =>
                  setSelectedSlug(e.target.value || undefined)
                }
                className="appearance-none rounded-lg border border-gray-700 bg-gray-800 py-2 pl-9 pr-8 text-sm text-gray-200 transition-colors hover:border-gray-600 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                <option value="">All channels</option>
                {channels.map((ch) => (
                  <option key={ch.id} value={ch.slug}>
                    #{ch.name}
                  </option>
                ))}
              </select>
            </div>
            {selectedSlug && (
              <button
                type="button"
                onClick={() => setSelectedSlug(undefined)}
                className="inline-flex items-center gap-1 rounded-lg border border-purple-500/40 bg-purple-500/10 px-2.5 py-2 text-xs font-medium text-purple-300 transition-colors hover:bg-purple-500/20"
              >
                <Hash className="h-3 w-3" />
                {activeChannel?.name ?? selectedSlug}
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Graph */}
      <div className="flex-1 min-h-0">
        <GraphView channelSlug={selectedSlug} />
      </div>
    </div>
  );
}
