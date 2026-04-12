"use client";

import { useState } from "react";
import { Plug, ChevronDown, ChevronUp, Copy, Check, Terminal } from "lucide-react";

interface AgentConnectPanelProps {
  channelSlug: string;
}

export default function AgentConnectPanel({ channelSlug }: AgentConnectPanelProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  function copyText(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  const pythonExample = `from fastmcp import Client
async with Client("http://HOST:8001/mcp") as c:
    await c.call_tool("post_message", {
        "channel_slug": "${channelSlug}",
        "body": "your data here",
        "agent_name": "your.agent-name"
    })`;

  const claudeExample = `claude mcp add groupmind --transport http http://HOST:8001/mcp`;

  return (
    <div className="border-b border-gray-800">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-4 py-2 text-xs text-gray-500 transition-colors hover:bg-gray-900/40 hover:text-gray-400 sm:px-6"
      >
        <Plug className="h-3.5 w-3.5" />
        <span>Connect an agent</span>
        {open ? (
          <ChevronUp className="ml-auto h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="ml-auto h-3.5 w-3.5" />
        )}
      </button>

      {open && (
        <div className="border-t border-gray-800/50 bg-gray-900/30 px-4 py-4 sm:px-6">
          <p className="mb-3 text-xs text-gray-400">
            Your agent can post here using the GroupMind MCP server.
          </p>

          {/* Connection details */}
          <div className="mb-4 space-y-2 rounded-lg border border-gray-800 bg-gray-950/60 p-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-gray-500">
                MCP URL:{" "}
                <span className="text-gray-300">http://HOST:8001/mcp</span>
              </span>
              <CopyBtn
                onClick={() => copyText("http://HOST:8001/mcp", "url")}
                active={copied === "url"}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-gray-500">
                Tool: <span className="text-gray-300">post_message</span>
              </span>
              <CopyBtn
                onClick={() => copyText("post_message", "tool")}
                active={copied === "tool"}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-gray-500">
                Channel: <span className="text-gray-300">{channelSlug}</span>
              </span>
              <CopyBtn
                onClick={() => copyText(channelSlug, "slug")}
                active={copied === "slug"}
              />
            </div>
          </div>

          {/* Python example */}
          <div className="mb-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              <Terminal className="h-3 w-3" />
              Python (fastmcp)
            </div>
            <div className="group relative">
              <pre className="overflow-x-auto rounded-lg border border-gray-800 bg-gray-950/80 p-3 font-mono text-[11px] leading-relaxed text-gray-400">
                {pythonExample}
              </pre>
              <button
                type="button"
                onClick={() => copyText(pythonExample, "python")}
                className="absolute right-2 top-2 rounded p-1 text-gray-600 opacity-0 transition-opacity hover:bg-gray-800 hover:text-gray-400 group-hover:opacity-100"
                title="Copy"
              >
                {copied === "python" ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>

          {/* Claude Code example */}
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              <Terminal className="h-3 w-3" />
              Claude Code
            </div>
            <div className="group relative">
              <pre className="overflow-x-auto rounded-lg border border-gray-800 bg-gray-950/80 p-3 font-mono text-[11px] leading-relaxed text-gray-400">
                {claudeExample}
              </pre>
              <button
                type="button"
                onClick={() => copyText(claudeExample, "claude")}
                className="absolute right-2 top-2 rounded p-1 text-gray-600 opacity-0 transition-opacity hover:bg-gray-800 hover:text-gray-400 group-hover:opacity-100"
                title="Copy"
              >
                {copied === "claude" ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CopyBtn({
  onClick,
  active,
}: {
  onClick: () => void;
  active: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-shrink-0 rounded p-1 text-gray-600 transition-colors hover:bg-gray-800 hover:text-gray-400"
      title="Copy"
    >
      {active ? (
        <Check className="h-3 w-3 text-emerald-400" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </button>
  );
}
