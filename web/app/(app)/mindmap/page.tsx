"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase";
import GraphView from "@/components/mindmap/GraphView";
import { Brain } from "lucide-react";

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

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800 bg-gray-900/50 px-6 py-3">
        <div className="flex items-center gap-3">
          <Brain className="h-5 w-5 text-purple-400" />
          <h1 className="text-lg font-semibold text-gray-100">Mind Map</h1>
        </div>
        <select
          value={selectedSlug ?? ""}
          onChange={(e) =>
            setSelectedSlug(e.target.value || undefined)
          }
          className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-200 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
        >
          <option value="">All channels</option>
          {channels.map((ch) => (
            <option key={ch.id} value={ch.slug}>
              #{ch.name}
            </option>
          ))}
        </select>
      </div>

      {/* Graph */}
      <div className="flex-1">
        <GraphView channelSlug={selectedSlug} />
      </div>
    </div>
  );
}
