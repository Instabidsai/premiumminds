"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type NodeMouseHandler,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import Dagre from "@dagrejs/dagre";
import {
  Hash,
  Bot,
  User,
  Sparkles,
  Network,
  MessageSquarePlus,
  RefreshCw,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";

interface GraphNode {
  id: string;
  label: string;
  size: number;
  group: string;
}

interface GraphEdge {
  source: string;
  target: string;
  weight: number;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

type NodeData = {
  label: string;
  group: string;
  size: number;
};

const GROUP_COLORS: Record<string, string> = {
  channel: "#a855f7", // purple
  topic: "#38bdf8", // sky
  user: "#10b981", // emerald
  agent: "#f59e0b", // amber
  graph: "#f43f5e", // rose
  default: "#60a5fa", // blue fallback
};

const GROUP_LABELS: Record<string, string> = {
  channel: "Channel",
  topic: "Topic",
  user: "Human",
  agent: "Agent",
  graph: "Graph",
};

function colorFor(group: string): string {
  return GROUP_COLORS[group] ?? GROUP_COLORS.default;
}

function getLayoutedElements(
  rawNodes: GraphNode[],
  rawEdges: GraphEdge[]
): { nodes: Node<NodeData>[]; edges: Edge[] } {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 80, ranksep: 100, edgesep: 30 });

  rawNodes.forEach((node) => {
    const w = Math.max(120, node.size * 20);
    const h = Math.max(50, node.size * 8);
    g.setNode(node.id, { width: w, height: h });
  });

  rawEdges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  Dagre.layout(g);

  const nodes: Node<NodeData>[] = rawNodes.map((node) => {
    const graphNode = g.node(node.id);
    const color = colorFor(node.group);
    const w = Math.max(120, node.size * 20);
    const h = Math.max(50, node.size * 8);
    return {
      id: node.id,
      type: "default",
      position: {
        x: graphNode.x - w / 2,
        y: graphNode.y - h / 2,
      },
      data: { label: node.label, group: node.group, size: node.size },
      style: {
        background: `${color}1f`,
        border: `1px solid ${color}aa`,
        borderRadius: "12px",
        color: "#f3f4f6",
        fontSize: "13px",
        fontWeight: 600,
        padding: "8px 16px",
        width: w,
        height: h,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: `0 0 0 1px ${color}22, 0 4px 12px rgba(0,0,0,0.35)`,
      },
    };
  });

  const edges: Edge[] = rawEdges.map((edge, i) => ({
    id: `e-${edge.source}-${edge.target}-${i}`,
    source: edge.source,
    target: edge.target,
    animated: edge.weight > 0.7,
    style: {
      stroke: edge.weight > 0.7 ? "#a78bfa" : "#4b5563",
      strokeWidth: Math.max(1, edge.weight * 3),
      opacity: Math.max(0.35, edge.weight),
    },
  }));

  return { nodes, edges };
}

interface LegendItem {
  key: string;
  label: string;
  icon: LucideIcon;
}

const LEGEND: LegendItem[] = [
  { key: "channel", label: "Channels", icon: Hash },
  { key: "user", label: "Humans", icon: User },
  { key: "agent", label: "Agents", icon: Bot },
  { key: "topic", label: "Topics", icon: Sparkles },
];

function Legend({ counts }: { counts: Record<string, number> }) {
  return (
    <div className="pointer-events-auto absolute left-4 top-4 z-10 hidden rounded-lg border border-gray-800 bg-gray-900/90 p-3 shadow-xl backdrop-blur sm:block">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
        <Network className="h-3 w-3" />
        Legend
      </div>
      <ul className="space-y-1.5">
        {LEGEND.map((item) => {
          const Icon = item.icon;
          const color = colorFor(item.key);
          const count = counts[item.key] ?? 0;
          return (
            <li
              key={item.key}
              className="flex items-center gap-2 text-xs text-gray-300"
            >
              <span
                className="flex h-5 w-5 items-center justify-center rounded"
                style={{
                  background: `${color}22`,
                  border: `1px solid ${color}66`,
                }}
              >
                <Icon className="h-3 w-3" style={{ color }} />
              </span>
              <span className="flex-1">{item.label}</span>
              <span className="tabular-nums text-gray-500">{count}</span>
            </li>
          );
        })}
      </ul>
      <div className="mt-2 border-t border-gray-800 pt-2 text-[10px] text-gray-500">
        <span className="inline-block h-0.5 w-4 align-middle bg-purple-400" />{" "}
        strong link
        <span className="mx-1" />
        <span className="inline-block h-0.5 w-4 align-middle bg-gray-600" />{" "}
        weak
      </div>
    </div>
  );
}

interface HoverTooltip {
  x: number;
  y: number;
  label: string;
  group: string;
  size: number;
}

export default function GraphView({
  channelSlug,
}: {
  channelSlug?: string;
}) {
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<NodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [hover, setHover] = useState<HoverTooltip | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const fetchGraph = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = channelSlug
        ? `/api/graph?channel=${encodeURIComponent(channelSlug)}`
        : "/api/graph";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load graph data");
      const data: GraphData = await res.json();
      setGraphData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load graph");
    } finally {
      setLoading(false);
    }
  }, [channelSlug]);

  useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  useEffect(() => {
    if (!graphData || graphData.nodes.length === 0) {
      setNodes([]);
      setEdges([]);
      return;
    }
    const { nodes: layoutNodes, edges: layoutEdges } = getLayoutedElements(
      graphData.nodes,
      graphData.edges
    );
    setNodes(layoutNodes);
    setEdges(layoutEdges);
  }, [graphData, setNodes, setEdges]);

  const groupCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    if (graphData) {
      for (const n of graphData.nodes) {
        counts[n.group] = (counts[n.group] ?? 0) + 1;
      }
    }
    return counts;
  }, [graphData]);

  const proOptions = useMemo(() => ({ hideAttribution: true }), []);

  const handleNodeMouseEnter = useCallback<NodeMouseHandler<Node<NodeData>>>(
    (event, node) => {
      const rect = containerRef.current?.getBoundingClientRect();
      const x = rect ? event.clientX - rect.left : event.clientX;
      const y = rect ? event.clientY - rect.top : event.clientY;
      setHover({
        x,
        y,
        label: node.data.label,
        group: node.data.group,
        size: node.data.size,
      });
    },
    []
  );

  const handleNodeMouseLeave = useCallback(() => {
    setHover(null);
  }, []);

  // Loading — skeleton pulse
  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gray-950">
        <div className="relative flex flex-col items-center gap-4">
          <div className="relative h-16 w-16">
            <div className="absolute inset-0 animate-ping rounded-full border-2 border-purple-500/40" />
            <div className="absolute inset-2 animate-pulse rounded-full border-2 border-purple-400/60" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Network className="h-6 w-6 text-purple-300" />
            </div>
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-gray-300">
              Building mind map
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              Laying out nodes and connections...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gray-950 p-6">
        <div className="max-w-sm rounded-xl border border-red-900/50 bg-red-950/30 p-6 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-red-500/40 bg-red-500/10">
            <AlertTriangle className="h-5 w-5 text-red-400" />
          </div>
          <p className="mt-3 text-sm font-medium text-red-200">{error}</p>
          <button
            onClick={fetchGraph}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm text-gray-200 transition-colors hover:bg-gray-700"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Try again
          </button>
        </div>
      </div>
    );
  }

  // Empty
  if (!graphData || graphData.nodes.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gray-950 p-6">
        <div className="max-w-md text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-purple-500/30 bg-purple-500/10">
            <Network className="h-7 w-7 text-purple-300" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-gray-100">
            {channelSlug
              ? "This channel is quiet"
              : "Your mind map is empty"}
          </h3>
          <p className="mt-1.5 text-sm text-gray-400">
            {channelSlug
              ? "No messages, docs, or agent activity have been linked here yet. Drop in and say hi — the graph fills out as you chat."
              : "Start a conversation in any channel and the graph will grow from every message, doc, and agent reply."}
          </p>
          <div className="mt-5 flex items-center justify-center gap-2">
            <a
              href="/chat"
              className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-500"
            >
              <MessageSquarePlus className="h-4 w-4" />
              Start chatting
            </a>
            <button
              onClick={fetchGraph}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-sm text-gray-300 transition-colors hover:bg-gray-800"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full"
      style={{ background: "#030712" }}
    >
      <Legend counts={groupCounts} />

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeMouseEnter={handleNodeMouseEnter}
        onNodeMouseLeave={handleNodeMouseLeave}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={proOptions}
        style={{ background: "#030712" }}
      >
        <Background color="#1f2937" gap={24} size={1} />
        <Controls
          showInteractive={false}
          className="!border-gray-800 !bg-gray-900 [&_button]:!border-gray-800 [&_button]:!bg-gray-900 [&_button]:!text-gray-300 [&_button:hover]:!bg-gray-800 [&_button_svg]:!fill-gray-300"
        />
        <MiniMap
          pannable
          zoomable
          nodeColor={(n) => {
            const data = n.data as NodeData | undefined;
            return colorFor(data?.group ?? "default");
          }}
          nodeStrokeColor={(n) => {
            const data = n.data as NodeData | undefined;
            return colorFor(data?.group ?? "default");
          }}
          nodeBorderRadius={4}
          maskColor="rgba(3, 7, 18, 0.85)"
          style={{
            background: "#111827",
            border: "1px solid #1f2937",
            borderRadius: "8px",
          }}
        />
      </ReactFlow>

      {hover && (
        <div
          className="pointer-events-none absolute z-20 max-w-xs -translate-x-1/2 -translate-y-[calc(100%+12px)] rounded-lg border border-gray-800 bg-gray-900/95 px-3 py-2 shadow-xl backdrop-blur"
          style={{ left: hover.x, top: hover.y }}
        >
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: colorFor(hover.group) }}
            />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              {GROUP_LABELS[hover.group] ?? hover.group}
            </span>
          </div>
          <div className="mt-1 text-sm font-medium text-gray-100 break-words">
            {hover.label}
          </div>
          <div className="mt-1 text-[11px] text-gray-500">
            weight {hover.size}
          </div>
        </div>
      )}
    </div>
  );
}
