"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import Dagre from "@dagrejs/dagre";

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

const GROUP_COLORS: Record<string, string> = {
  channel: "#7c3aed",
  topic: "#2563eb",
  user: "#059669",
  agent: "#d946ef",
  default: "#6b7280",
};

function getLayoutedElements(
  rawNodes: GraphNode[],
  rawEdges: GraphEdge[]
): { nodes: Node[]; edges: Edge[] } {
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

  const nodes: Node[] = rawNodes.map((node) => {
    const graphNode = g.node(node.id);
    const color = GROUP_COLORS[node.group] || GROUP_COLORS.default;
    const w = Math.max(120, node.size * 20);
    const h = Math.max(50, node.size * 8);
    return {
      id: node.id,
      type: "default",
      position: {
        x: graphNode.x - w / 2,
        y: graphNode.y - h / 2,
      },
      data: { label: node.label },
      style: {
        background: `${color}22`,
        border: `1px solid ${color}88`,
        borderRadius: "12px",
        color: "#e5e7eb",
        fontSize: "13px",
        fontWeight: 600,
        padding: "8px 16px",
        width: w,
        height: h,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
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
    },
  }));

  return { nodes, edges };
}

export default function GraphView({
  channelSlug,
}: {
  channelSlug?: string;
}) {
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

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
    if (!graphData || graphData.nodes.length === 0) return;
    const { nodes: layoutNodes, edges: layoutEdges } = getLayoutedElements(
      graphData.nodes,
      graphData.edges
    );
    setNodes(layoutNodes);
    setEdges(layoutEdges);
  }, [graphData, setNodes, setEdges]);

  const proOptions = useMemo(() => ({ hideAttribution: true }), []);

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gray-950">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
          <span className="text-sm text-gray-500">Loading mind map...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gray-950">
        <div className="text-center">
          <p className="text-red-400">{error}</p>
          <button
            onClick={fetchGraph}
            className="mt-3 rounded-lg bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!graphData || graphData.nodes.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gray-950">
        <div className="text-center">
          <p className="text-gray-400 text-lg">No graph data yet</p>
          <p className="text-gray-600 text-sm mt-1">
            Start chatting to build the knowledge graph.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full" style={{ background: "#030712" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        proOptions={proOptions}
        style={{ background: "#030712" }}
      >
        <Background color="#1f2937" gap={24} size={1} />
        <Controls
          showInteractive={false}
          style={{ background: "#111827", border: "1px solid #374151", borderRadius: "8px" }}
        />
        <MiniMap
          nodeColor={() => "#7c3aed"}
          maskColor="rgba(3, 7, 18, 0.85)"
          style={{
            background: "#111827",
            border: "1px solid #374151",
            borderRadius: "8px",
          }}
        />
      </ReactFlow>
    </div>
  );
}
