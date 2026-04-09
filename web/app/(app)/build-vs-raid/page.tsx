"use client";

import { useEffect, useState, useCallback } from "react";
import { createBrowserClient } from "@/lib/supabase";
import {
  Scale,
  Plus,
  X,
  ExternalLink,
  Loader2,
  Inbox,
} from "lucide-react";

type Verdict = "raid" | "build" | "hybrid" | "watch" | "undecided";

interface AuthorInfo {
  id: string;
  agent_name: string | null;
  member: {
    handle: string;
    display_name: string | null;
  } | null;
}

interface BuildVsRaidRow {
  id: string;
  problem: string;
  raid_candidate: string | null;
  raid_candidate_url: string | null;
  current_approach: string | null;
  unique_wins: string | null;
  verdict: Verdict;
  beliefs_touched: string[] | null;
  created_at: string;
  author: AuthorInfo | null;
}

const VERDICT_META: Record<
  Verdict,
  { label: string; className: string }
> = {
  raid: {
    label: "Raid",
    className: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  },
  build: {
    label: "Build",
    className: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  },
  hybrid: {
    label: "Hybrid",
    className: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  },
  watch: {
    label: "Watch",
    className: "bg-gray-600/20 text-gray-300 border-gray-600/40",
  },
  undecided: {
    label: "Undecided",
    className: "bg-gray-800 text-gray-400 border-gray-700",
  },
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function authorLabel(author: AuthorInfo | null): string {
  if (!author) return "unknown";
  if (author.agent_name) return author.agent_name;
  if (author.member)
    return author.member.display_name || author.member.handle;
  return "unknown";
}

export default function BuildVsRaidPage() {
  const supabase = createBrowserClient();

  const [entries, setEntries] = useState<BuildVsRaidRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [problem, setProblem] = useState("");
  const [raidCandidate, setRaidCandidate] = useState("");
  const [raidCandidateUrl, setRaidCandidateUrl] = useState("");
  const [currentApproach, setCurrentApproach] = useState("");
  const [uniqueWins, setUniqueWins] = useState("");
  const [verdict, setVerdict] = useState<Verdict>("undecided");
  const [beliefsInput, setBeliefsInput] = useState("");

  const loadEntries = useCallback(async () => {
    setLoading(true);
    const { data, error: loadErr } = await supabase
      .from("build_vs_raid")
      .select(
        `
        id,
        problem,
        raid_candidate,
        raid_candidate_url,
        current_approach,
        unique_wins,
        verdict,
        beliefs_touched,
        created_at,
        author:authors!build_vs_raid_posted_by_fkey (
          id,
          agent_name,
          member:members!authors_member_id_fkey (
            handle,
            display_name
          )
        )
      `
      )
      .order("created_at", { ascending: false });

    if (loadErr) {
      setError(loadErr.message);
      setLoading(false);
      return;
    }

    const normalized: BuildVsRaidRow[] = (data || []).map((row) => {
      const rawAuthor = Array.isArray(row.author) ? row.author[0] : row.author;
      let author: AuthorInfo | null = null;
      if (rawAuthor) {
        const rawMember = Array.isArray(rawAuthor.member)
          ? rawAuthor.member[0]
          : rawAuthor.member;
        author = {
          id: rawAuthor.id,
          agent_name: rawAuthor.agent_name ?? null,
          member: rawMember
            ? {
                handle: rawMember.handle,
                display_name: rawMember.display_name,
              }
            : null,
        };
      }
      return {
        id: row.id,
        problem: row.problem,
        raid_candidate: row.raid_candidate,
        raid_candidate_url: row.raid_candidate_url,
        current_approach: row.current_approach,
        unique_wins: row.unique_wins,
        verdict: row.verdict as Verdict,
        beliefs_touched: row.beliefs_touched,
        created_at: row.created_at,
        author,
      };
    });

    setEntries(normalized);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  function resetForm() {
    setProblem("");
    setRaidCandidate("");
    setRaidCandidateUrl("");
    setCurrentApproach("");
    setUniqueWins("");
    setVerdict("undecided");
    setBeliefsInput("");
    setError(null);
  }

  async function resolveCurrentAuthorId(): Promise<string | null> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    // Find the member row for this auth user
    const { data: member } = await supabase
      .from("members")
      .select("id, handle, display_name")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (!member) {
      // Create a member row
      const fallbackHandle =
        (user.email?.split("@")[0] || `user-${user.id.slice(0, 8)}`).replace(
          /[^a-z0-9_-]/gi,
          "_"
        );
      const { data: newMember, error: memberErr } = await supabase
        .from("members")
        .insert({
          auth_user_id: user.id,
          handle: fallbackHandle,
          display_name: user.email?.split("@")[0] || fallbackHandle,
        })
        .select("id")
        .single();
      if (memberErr || !newMember) return null;

      const { data: newAuthor } = await supabase
        .from("authors")
        .insert({ kind: "human", member_id: newMember.id })
        .select("id")
        .single();
      return newAuthor?.id ?? null;
    }

    // Find or create an author for this member
    const { data: existingAuthor } = await supabase
      .from("authors")
      .select("id")
      .eq("member_id", member.id)
      .eq("kind", "human")
      .maybeSingle();

    if (existingAuthor) return existingAuthor.id;

    const { data: newAuthor } = await supabase
      .from("authors")
      .insert({ kind: "human", member_id: member.id })
      .select("id")
      .single();
    return newAuthor?.id ?? null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!problem.trim()) {
      setError("Problem is required.");
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const authorId = await resolveCurrentAuthorId();
      if (!authorId) {
        setError("Could not resolve your author record. Are you signed in?");
        setSubmitting(false);
        return;
      }

      // Look up the build-vs-raid channel
      const { data: channel } = await supabase
        .from("channels")
        .select("id")
        .eq("slug", "build-vs-raid")
        .maybeSingle();

      if (!channel) {
        setError("The #build-vs-raid channel does not exist.");
        setSubmitting(false);
        return;
      }

      const beliefs = beliefsInput
        .split(",")
        .map((b) => b.trim())
        .filter((b) => b.length > 0);

      // Build the companion markdown message
      const lines: string[] = [];
      lines.push(`**Build vs Raid — ${VERDICT_META[verdict].label}**`);
      lines.push("");
      lines.push(`**Problem:** ${problem.trim()}`);
      if (raidCandidate.trim()) {
        const candidateText = raidCandidateUrl.trim()
          ? `[${raidCandidate.trim()}](${raidCandidateUrl.trim()})`
          : raidCandidate.trim();
        lines.push(`**Raid candidate:** ${candidateText}`);
      }
      if (currentApproach.trim()) {
        lines.push(`**Current approach:** ${currentApproach.trim()}`);
      }
      if (uniqueWins.trim()) {
        lines.push(`**Unique wins:** ${uniqueWins.trim()}`);
      }
      if (beliefs.length > 0) {
        lines.push(`**Beliefs touched:** ${beliefs.join(", ")}`);
      }
      const body = lines.join("\n");

      // Insert the companion message first so we can reference its id.
      const { data: msg, error: msgErr } = await supabase
        .from("messages")
        .insert({
          channel_id: channel.id,
          author_id: authorId,
          body,
        })
        .select("id")
        .single();

      if (msgErr || !msg) {
        setError(msgErr?.message || "Failed to post companion message.");
        setSubmitting(false);
        return;
      }

      // Insert the structured row
      const { error: insertErr } = await supabase.from("build_vs_raid").insert({
        message_id: msg.id,
        posted_by: authorId,
        channel_id: channel.id,
        problem: problem.trim(),
        raid_candidate: raidCandidate.trim() || null,
        raid_candidate_url: raidCandidateUrl.trim() || null,
        current_approach: currentApproach.trim() || null,
        unique_wins: uniqueWins.trim() || null,
        verdict,
        beliefs_touched: beliefs.length > 0 ? beliefs : null,
      });

      if (insertErr) {
        setError(insertErr.message);
        setSubmitting(false);
        return;
      }

      resetForm();
      setShowForm(false);
      await loadEntries();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-950">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Scale className="h-6 w-6 text-amber-400" />
            <h1 className="text-2xl font-bold text-gray-100">Build vs Raid</h1>
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
                <Plus className="h-4 w-4" /> New Entry
              </>
            )}
          </button>
        </div>

        <p className="mb-6 text-sm text-gray-400">
          Custom stack vs best-in-class. Every audit lives here.
        </p>

        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="mb-8 rounded-xl border border-gray-800 bg-gray-900 p-6"
          >
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Problem *
                </label>
                <textarea
                  value={problem}
                  onChange={(e) => setProblem(e.target.value)}
                  rows={2}
                  required
                  placeholder="What are we trying to solve?"
                  className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:border-purple-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Raid candidate
                  </label>
                  <input
                    type="text"
                    value={raidCandidate}
                    onChange={(e) => setRaidCandidate(e.target.value)}
                    placeholder="e.g. Linear, Supabase, Clerk"
                    className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:border-purple-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Raid candidate URL
                  </label>
                  <input
                    type="url"
                    value={raidCandidateUrl}
                    onChange={(e) => setRaidCandidateUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:border-purple-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Current approach
                </label>
                <textarea
                  value={currentApproach}
                  onChange={(e) => setCurrentApproach(e.target.value)}
                  rows={2}
                  placeholder="How are we solving this today?"
                  className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:border-purple-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Unique wins
                </label>
                <textarea
                  value={uniqueWins}
                  onChange={(e) => setUniqueWins(e.target.value)}
                  rows={2}
                  placeholder="What does the raid candidate do better?"
                  className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:border-purple-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Verdict
                  </label>
                  <select
                    value={verdict}
                    onChange={(e) => setVerdict(e.target.value as Verdict)}
                    className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-gray-100 focus:border-purple-500 focus:outline-none"
                  >
                    <option value="undecided">Undecided</option>
                    <option value="raid">Raid</option>
                    <option value="build">Build</option>
                    <option value="hybrid">Hybrid</option>
                    <option value="watch">Watch</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Beliefs touched
                  </label>
                  <input
                    type="text"
                    value={beliefsInput}
                    onChange={(e) => setBeliefsInput(e.target.value)}
                    placeholder="comma, separated, list"
                    className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:border-purple-500 focus:outline-none"
                  />
                </div>
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
                  {submitting ? "Posting..." : "Post Entry"}
                </button>
              </div>
            </div>
          </form>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
              <span className="text-sm text-gray-400">Loading entries...</span>
            </div>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-gray-800 py-20 text-gray-400">
            <Inbox className="h-10 w-10 text-gray-600" />
            <p className="text-sm">No build-vs-raid entries yet.</p>
            <p className="text-xs text-gray-600">
              Start by posting the first audit.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {entries.map((entry) => {
              const meta = VERDICT_META[entry.verdict];
              return (
                <article
                  key={entry.id}
                  className="rounded-xl border border-gray-800 bg-gray-900 p-5 transition-colors hover:border-gray-700"
                >
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider ${meta.className}`}
                      >
                        {meta.label}
                      </span>
                      <span className="text-xs text-gray-500">
                        by {authorLabel(entry.author)}
                      </span>
                    </div>
                    <span className="text-xs text-gray-500">
                      {formatDate(entry.created_at)}
                    </span>
                  </div>

                  <h3 className="mb-3 text-base font-semibold text-gray-100">
                    {entry.problem}
                  </h3>

                  {entry.raid_candidate && (
                    <div className="mb-2 flex items-center gap-2 text-sm">
                      <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                        Raid:
                      </span>
                      {entry.raid_candidate_url ? (
                        <a
                          href={entry.raid_candidate_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300"
                        >
                          {entry.raid_candidate}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-gray-300">
                          {entry.raid_candidate}
                        </span>
                      )}
                    </div>
                  )}

                  {entry.current_approach && (
                    <div className="mb-2 text-sm">
                      <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                        Current:
                      </span>{" "}
                      <span className="text-gray-300">
                        {entry.current_approach}
                      </span>
                    </div>
                  )}

                  {entry.unique_wins && (
                    <div className="mb-3 text-sm">
                      <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                        Unique wins:
                      </span>{" "}
                      <span className="text-gray-300">{entry.unique_wins}</span>
                    </div>
                  )}

                  {entry.beliefs_touched && entry.beliefs_touched.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {entry.beliefs_touched.map((belief) => (
                        <span
                          key={belief}
                          className="rounded-full border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[11px] text-purple-300"
                        >
                          {belief}
                        </span>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
