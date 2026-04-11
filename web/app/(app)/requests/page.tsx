"use client";

import { useEffect, useState, useCallback } from "react";
import { createBrowserClient } from "@/lib/supabase";
import {
  Lightbulb,
  Plus,
  X,
  ChevronUp,
  Loader2,
  Inbox,
  MessageCircle,
  User,
  Clock,
} from "lucide-react";

type RequestStatus =
  | "new"
  | "considering"
  | "accepted"
  | "building"
  | "shipped"
  | "rejected";

interface LaneRef {
  id: string;
  slug: string;
  name: string;
  color: string | null;
}

interface MemberRef {
  id: string;
  handle: string;
  display_name: string | null;
}

interface FeatureRequest {
  id: string;
  title: string;
  body: string;
  status: RequestStatus;
  upvotes: number;
  response: string | null;
  created_at: string;
  lane: LaneRef | null;
  requester: MemberRef | null;
}

interface StatusMeta {
  label: string;
  badge: string;
  accent: string;
  dot: string;
}

const STATUS_META: Record<RequestStatus, StatusMeta> = {
  new: {
    label: "New",
    badge: "bg-blue-500/15 text-blue-300 border-blue-500/40",
    accent: "border-l-blue-500",
    dot: "bg-blue-400",
  },
  considering: {
    label: "Considering",
    badge: "bg-amber-500/15 text-amber-300 border-amber-500/40",
    accent: "border-l-amber-500",
    dot: "bg-amber-400",
  },
  accepted: {
    label: "Accepted",
    badge: "bg-green-500/15 text-green-300 border-green-500/40",
    accent: "border-l-green-500",
    dot: "bg-green-400",
  },
  building: {
    label: "Building",
    badge: "bg-purple-500/15 text-purple-300 border-purple-500/40",
    accent: "border-l-purple-500",
    dot: "bg-purple-400",
  },
  shipped: {
    label: "Shipped",
    badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
    accent: "border-l-emerald-500",
    dot: "bg-emerald-400",
  },
  rejected: {
    label: "Rejected",
    badge: "bg-gray-600/20 text-gray-400 border-gray-600/40",
    accent: "border-l-gray-600",
    dot: "bg-gray-500",
  },
};

const LANE_CHIP: Record<string, string> = {
  purple: "bg-purple-500/10 text-purple-300 border-purple-500/20",
  amber: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  blue: "bg-blue-500/10 text-blue-300 border-blue-500/20",
  emerald: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  sky: "bg-sky-500/10 text-sky-300 border-sky-500/20",
  rose: "bg-rose-500/10 text-rose-300 border-rose-500/20",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const BODY_PREVIEW_LEN = 240;

export default function RequestsPage() {
  const supabase = createBrowserClient();

  const [requests, setRequests] = useState<FeatureRequest[]>([]);
  const [lanes, setLanes] = useState<LaneRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upvoting, setUpvoting] = useState<string | null>(null);
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Form state
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [laneId, setLaneId] = useState("");

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [lanesRes, requestsRes] = await Promise.all([
      supabase
        .from("lanes")
        .select("id, slug, name, color")
        .order("sort_order", { ascending: true }),
      supabase
        .from("feature_requests")
        .select(
          `
          id,
          title,
          body,
          status,
          upvotes,
          response,
          created_at,
          lane:lanes!feature_requests_lane_id_fkey (
            id, slug, name, color
          ),
          requester:members!feature_requests_requested_by_fkey (
            id, handle, display_name
          )
        `
        )
        .order("upvotes", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);

    if (lanesRes.data) setLanes(lanesRes.data as LaneRef[]);

    if (requestsRes.error) {
      setError(requestsRes.error.message);
      setLoading(false);
      return;
    }

    const normalized: FeatureRequest[] = (requestsRes.data || []).map(
      (row) => {
        const rawLane = Array.isArray(row.lane) ? row.lane[0] : row.lane;
        const rawReq = Array.isArray(row.requester)
          ? row.requester[0]
          : row.requester;
        return {
          id: row.id,
          title: row.title,
          body: row.body,
          status: (row.status as RequestStatus) ?? "new",
          upvotes: row.upvotes ?? 0,
          response: row.response,
          created_at: row.created_at,
          lane: rawLane
            ? {
                id: rawLane.id,
                slug: rawLane.slug,
                name: rawLane.name,
                color: rawLane.color ?? null,
              }
            : null,
          requester: rawReq
            ? {
                id: rawReq.id,
                handle: rawReq.handle,
                display_name: rawReq.display_name,
              }
            : null,
        };
      }
    );

    setRequests(normalized);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function resolveCurrentMemberId(): Promise<string | null> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: member } = await supabase
      .from("members")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (member) return member.id;

    const fallbackHandle =
      (user.email?.split("@")[0] || `user-${user.id.slice(0, 8)}`).replace(
        /[^a-z0-9_-]/gi,
        "_"
      );
    const { data: newMember } = await supabase
      .from("members")
      .insert({
        auth_user_id: user.id,
        handle: fallbackHandle,
        display_name: user.email?.split("@")[0] || fallbackHandle,
      })
      .select("id")
      .single();
    return newMember?.id ?? null;
  }

  function resetForm() {
    setTitle("");
    setBody("");
    setLaneId("");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      setError("Title and body are required.");
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const memberId = await resolveCurrentMemberId();
      if (!memberId) {
        setError("Could not resolve your member record. Are you signed in?");
        setSubmitting(false);
        return;
      }

      const { error: insertErr } = await supabase
        .from("feature_requests")
        .insert({
          requested_by: memberId,
          title: title.trim(),
          body: body.trim(),
          lane_id: laneId || null,
          status: "new",
          upvotes: 0,
        });

      if (insertErr) {
        setError(insertErr.message);
        setSubmitting(false);
        return;
      }

      resetForm();
      setShowForm(false);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpvote(id: string, current: number) {
    if (votedIds.has(id) || upvoting === id) return;

    // Optimistic update
    setUpvoting(id);
    setVotedIds((prev) => new Set(prev).add(id));
    setRequests((prev) =>
      prev
        .map((r) => (r.id === id ? { ...r, upvotes: r.upvotes + 1 } : r))
        .sort((a, b) => {
          if (b.upvotes !== a.upvotes) return b.upvotes - a.upvotes;
          return (
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime()
          );
        })
    );

    const { error: updErr } = await supabase
      .from("feature_requests")
      .update({ upvotes: current + 1 })
      .eq("id", id);

    if (updErr) {
      // Rollback
      setVotedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setRequests((prev) =>
        prev.map((r) => (r.id === id ? { ...r, upvotes: r.upvotes - 1 } : r))
      );
    }
    setUpvoting(null);
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedLanePreview = lanes.find((l) => l.id === laneId) || null;

  return (
    <div className="h-full overflow-y-auto bg-gray-950">
      <div className="mx-auto max-w-4xl px-6 py-10">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10">
              <Lightbulb className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-100">
                Feature Requests
              </h1>
              <p className="mt-1 text-sm text-gray-400">
                Ideas from the group. Upvote the ones that matter.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setShowForm((v) => !v);
              if (showForm) resetForm();
            }}
            className="flex flex-shrink-0 items-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white shadow-sm shadow-purple-900/50 transition-colors hover:bg-purple-500"
          >
            {showForm ? (
              <>
                <X className="h-4 w-4" /> Cancel
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" /> New Request
              </>
            )}
          </button>
        </div>

        {/* Form */}
        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="mb-8 overflow-hidden rounded-xl border border-gray-800 bg-gray-900 shadow-lg"
          >
            <div className="border-b border-gray-800 bg-gray-900/50 px-6 py-4">
              <h2 className="text-sm font-semibold text-gray-200">
                New request
              </h2>
              <p className="mt-0.5 text-xs text-gray-500">
                Short title, clear body. Tell us what you want and why.
              </p>
            </div>

            <div className="space-y-5 p-6">
              {/* Title */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Title <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  placeholder="Short, specific ask"
                  maxLength={120}
                  className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500/20"
                />
                <div className="mt-1 flex justify-between text-[11px] text-gray-600">
                  <span>One sentence. Actionable.</span>
                  <span>{title.length}/120</span>
                </div>
              </div>

              {/* Body */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Body <span className="text-red-400">*</span>{" "}
                  <span className="ml-1 font-normal text-gray-600">
                    (markdown OK)
                  </span>
                </label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  required
                  rows={6}
                  placeholder="What should this do, and why? What's the outcome?"
                  className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500/20"
                />
                <p className="mt-1 text-[11px] text-gray-600">
                  Include the use case. Agents and humans will read this.
                </p>
              </div>

              {/* Lane */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Lane{" "}
                  <span className="ml-1 font-normal text-gray-600">
                    (optional)
                  </span>
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={laneId}
                    onChange={(e) => setLaneId(e.target.value)}
                    className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-gray-100 focus:border-purple-500 focus:outline-none"
                  >
                    <option value="">— no lane —</option>
                    {lanes.map((lane) => (
                      <option key={lane.id} value={lane.id}>
                        {lane.name}
                      </option>
                    ))}
                  </select>
                  {selectedLanePreview && (
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] ${
                        (selectedLanePreview.color &&
                          LANE_CHIP[selectedLanePreview.color]) ||
                        "bg-gray-800 text-gray-300 border-gray-700"
                      }`}
                    >
                      {selectedLanePreview.name}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[11px] text-gray-600">
                  Which workstream does this belong to?
                </p>
              </div>

              {error && (
                <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-2 border-t border-gray-800 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    resetForm();
                  }}
                  className="rounded-lg border border-gray-800 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:border-gray-700 hover:text-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {submitting ? "Submitting..." : "Submit request"}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Count row */}
        {!loading && requests.length > 0 && (
          <div className="mb-4 flex items-center justify-between text-xs text-gray-500">
            <span>
              {requests.length}{" "}
              {requests.length === 1 ? "request" : "requests"} · sorted by
              votes
            </span>
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
              <span className="text-sm text-gray-400">
                Loading requests...
              </span>
            </div>
          </div>
        ) : requests.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-gray-800 bg-gray-900/30 py-20 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-gray-800 bg-gray-900">
              <Inbox className="h-6 w-6 text-gray-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-300">
                No feature requests yet
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Be the first to ask for something. The group will upvote the
                ideas that land.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-xs font-medium text-purple-300 transition-colors hover:border-purple-500/50 hover:bg-purple-500/20"
            >
              <Plus className="h-3.5 w-3.5" /> Post the first request
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map((req) => {
              const statusMeta = STATUS_META[req.status];
              const laneChip =
                (req.lane?.color && LANE_CHIP[req.lane.color]) ||
                "bg-gray-800 text-gray-300 border-gray-700";
              const requester =
                req.requester?.display_name ||
                req.requester?.handle ||
                "unknown";
              const voted = votedIds.has(req.id);
              const isExpanded = expanded.has(req.id);
              const needsTruncate = req.body.length > BODY_PREVIEW_LEN;
              const displayBody =
                needsTruncate && !isExpanded
                  ? req.body.slice(0, BODY_PREVIEW_LEN).trimEnd() + "..."
                  : req.body;

              return (
                <article
                  key={req.id}
                  className={`overflow-hidden rounded-xl border border-l-4 border-gray-800 bg-gray-900 shadow-sm transition-all hover:border-gray-700 ${statusMeta.accent}`}
                >
                  <div className="flex gap-4 p-5">
                    {/* Upvote button — left rail */}
                    <button
                      type="button"
                      onClick={() => handleUpvote(req.id, req.upvotes)}
                      disabled={upvoting === req.id || voted}
                      aria-label={
                        voted
                          ? `Voted (${req.upvotes})`
                          : `Upvote (${req.upvotes})`
                      }
                      className={`group flex h-16 w-14 flex-shrink-0 flex-col items-center justify-center rounded-lg border transition-all active:scale-95 ${
                        voted
                          ? "border-purple-500/50 bg-purple-500/15 text-purple-300"
                          : "border-gray-800 bg-gray-950 text-gray-400 hover:-translate-y-0.5 hover:border-purple-500/50 hover:bg-purple-500/5 hover:text-purple-300"
                      } disabled:cursor-not-allowed disabled:opacity-80`}
                    >
                      {upvoting === req.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ChevronUp
                          className={`h-4 w-4 transition-transform ${
                            voted ? "" : "group-hover:-translate-y-0.5"
                          }`}
                        />
                      )}
                      <span className="mt-0.5 text-sm font-bold tabular-nums">
                        {req.upvotes}
                      </span>
                    </button>

                    {/* Body */}
                    <div className="min-w-0 flex-1">
                      {/* Status + lane badges */}
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${statusMeta.badge}`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${statusMeta.dot}`}
                          />
                          {statusMeta.label}
                        </span>
                        {req.lane && (
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[11px] ${laneChip}`}
                          >
                            {req.lane.name}
                          </span>
                        )}
                      </div>

                      {/* Title */}
                      <h3 className="text-base font-semibold leading-snug text-gray-100">
                        {req.title}
                      </h3>

                      {/* Body */}
                      <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-gray-400">
                        {displayBody}
                      </p>
                      {needsTruncate && (
                        <button
                          type="button"
                          onClick={() => toggleExpanded(req.id)}
                          className="mt-1 text-[11px] font-medium text-purple-400 hover:text-purple-300"
                        >
                          {isExpanded ? "Show less" : "Show more"}
                        </button>
                      )}

                      {/* Meta row */}
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-gray-500">
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />@{requester}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(req.created_at)}
                        </span>
                      </div>

                      {/* Response */}
                      {req.response && (
                        <div className="mt-4 rounded-lg border border-purple-500/30 bg-purple-500/5 p-3">
                          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-purple-300">
                            <MessageCircle className="h-3 w-3" />
                            Response from the team
                          </div>
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-300">
                            {req.response}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
