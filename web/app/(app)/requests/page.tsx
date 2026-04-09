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

const STATUS_META: Record<
  RequestStatus,
  { label: string; className: string }
> = {
  new: {
    label: "New",
    className: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  },
  considering: {
    label: "Considering",
    className: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  },
  accepted: {
    label: "Accepted",
    className: "bg-green-500/15 text-green-300 border-green-500/30",
  },
  building: {
    label: "Building",
    className: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  },
  shipped: {
    label: "Shipped",
    className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  },
  rejected: {
    label: "Rejected",
    className: "bg-gray-600/20 text-gray-400 border-gray-600/40",
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

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + "...";
}

export default function RequestsPage() {
  const supabase = createBrowserClient();

  const [requests, setRequests] = useState<FeatureRequest[]>([]);
  const [lanes, setLanes] = useState<LaneRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upvoting, setUpvoting] = useState<string | null>(null);

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
          status: row.status as RequestStatus,
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
    setUpvoting(id);
    const { error: updErr } = await supabase
      .from("feature_requests")
      .update({ upvotes: current + 1 })
      .eq("id", id);
    if (!updErr) {
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
    }
    setUpvoting(null);
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-950">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Lightbulb className="h-6 w-6 text-amber-400" />
            <h1 className="text-2xl font-bold text-gray-100">
              Feature Requests
            </h1>
          </div>
          <button
            type="button"
            onClick={() => {
              setShowForm((v) => !v);
              if (showForm) resetForm();
            }}
            className="flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-500"
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

        <p className="mb-6 text-sm text-gray-400">
          Ideas from the group. Upvote the ones that matter.
        </p>

        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="mb-8 rounded-xl border border-gray-800 bg-gray-900 p-6"
          >
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Title *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  placeholder="Short, specific ask"
                  className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:border-purple-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Body * <span className="text-gray-600">(markdown OK)</span>
                </label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  required
                  rows={5}
                  placeholder="What should this do, and why?"
                  className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:border-purple-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Lane (optional)
                </label>
                <select
                  value={laneId}
                  onChange={(e) => setLaneId(e.target.value)}
                  className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-gray-100 focus:border-purple-500 focus:outline-none"
                >
                  <option value="">— no lane —</option>
                  {lanes.map((lane) => (
                    <option key={lane.id} value={lane.id}>
                      {lane.name}
                    </option>
                  ))}
                </select>
              </div>

              {error && (
                <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  {submitting ? "Submitting..." : "Submit Request"}
                </button>
              </div>
            </div>
          </form>
        )}

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
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-gray-800 py-20 text-gray-400">
            <Inbox className="h-10 w-10 text-gray-600" />
            <p className="text-sm">No feature requests yet.</p>
            <p className="text-xs text-gray-600">
              Be the first to ask for something.
            </p>
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
              return (
                <article
                  key={req.id}
                  className="rounded-xl border border-gray-800 bg-gray-900 p-5 transition-colors hover:border-gray-700"
                >
                  <div className="flex gap-4">
                    <button
                      type="button"
                      onClick={() => handleUpvote(req.id, req.upvotes)}
                      disabled={upvoting === req.id}
                      className="flex h-14 w-12 flex-shrink-0 flex-col items-center justify-center rounded-lg border border-gray-800 bg-gray-950 text-gray-400 transition-colors hover:border-purple-500/50 hover:text-purple-300 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <ChevronUp className="h-4 w-4" />
                      <span className="text-sm font-semibold">
                        {req.upvotes}
                      </span>
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${statusMeta.className}`}
                        >
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

                      <h3 className="text-base font-semibold text-gray-100">
                        {req.title}
                      </h3>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-gray-400">
                        {truncate(req.body, 200)}
                      </p>

                      <div className="mt-3 flex items-center gap-3 text-xs text-gray-500">
                        <span>by @{requester}</span>
                        <span>{formatDate(req.created_at)}</span>
                      </div>

                      {req.response && (
                        <div className="mt-4 rounded-lg border border-purple-500/30 bg-purple-500/5 p-3">
                          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-purple-300">
                            <MessageCircle className="h-3 w-3" />
                            Response
                          </div>
                          <p className="whitespace-pre-wrap text-sm text-gray-300">
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
