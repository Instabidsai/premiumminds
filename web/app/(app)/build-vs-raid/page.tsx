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
  Target,
  Package,
  Wrench,
  Sparkles,
  Tag,
  User,
  Clock,
} from "lucide-react";

type Verdict = "raid" | "build" | "hybrid" | "watch" | "skip" | "undecided";

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

interface VerdictMeta {
  label: string;
  badge: string;
  accent: string;
  dot: string;
  description: string;
}

const VERDICT_META: Record<Verdict, VerdictMeta> = {
  raid: {
    label: "Raid",
    badge: "bg-blue-500/15 text-blue-300 border-blue-500/40",
    accent: "border-l-blue-500",
    dot: "bg-blue-400",
    description: "Use the best-in-class tool instead of building",
  },
  build: {
    label: "Build",
    badge: "bg-purple-500/15 text-purple-300 border-purple-500/40",
    accent: "border-l-purple-500",
    dot: "bg-purple-400",
    description: "Our version is worth the investment",
  },
  hybrid: {
    label: "Hybrid",
    badge: "bg-amber-500/15 text-amber-300 border-amber-500/40",
    accent: "border-l-amber-500",
    dot: "bg-amber-400",
    description: "Raid the core, build the thin wrapper",
  },
  watch: {
    label: "Watch",
    badge: "bg-gray-500/20 text-gray-300 border-gray-500/40",
    accent: "border-l-gray-500",
    dot: "bg-gray-400",
    description: "Not urgent, revisit later",
  },
  skip: {
    label: "Skip",
    badge: "bg-red-500/15 text-red-300 border-red-500/40",
    accent: "border-l-red-500",
    dot: "bg-red-400",
    description: "Not worth doing at all",
  },
  undecided: {
    label: "Undecided",
    badge: "bg-gray-800 text-gray-400 border-gray-700",
    accent: "border-l-gray-700",
    dot: "bg-gray-500",
    description: "Still working through it",
  },
};

const VERDICT_ORDER: Verdict[] = [
  "undecided",
  "raid",
  "build",
  "hybrid",
  "watch",
  "skip",
];

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
        verdict: (row.verdict as Verdict) ?? "undecided",
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

    const { data: member } = await supabase
      .from("members")
      .select("id, handle, display_name")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (!member) {
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
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10">
              <Scale className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-100">
                Build vs Raid
              </h1>
              <p className="mt-1 text-sm text-gray-400">
                Custom stack vs best-in-class. Every audit lives here.
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
                <Plus className="h-4 w-4" /> New Entry
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
                New audit
              </h2>
              <p className="mt-0.5 text-xs text-gray-500">
                Walk through the 5 questions. Pick a verdict when you&apos;re
                confident.
              </p>
            </div>

            <div className="space-y-6 p-6">
              {/* 1. Problem */}
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
                  <Target className="h-3.5 w-3.5 text-gray-500" />
                  <span>
                    Problem <span className="text-red-400">*</span>
                  </span>
                </label>
                <textarea
                  value={problem}
                  onChange={(e) => setProblem(e.target.value)}
                  rows={2}
                  required
                  placeholder="What are we trying to solve?"
                  className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500/20"
                />
                <p className="mt-1 text-[11px] text-gray-600">
                  One sentence. Strip the jargon.
                </p>
              </div>

              {/* 2. Candidate (grouped) */}
              <div className="rounded-lg border border-gray-800 bg-gray-950/50 p-4">
                <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
                  <Package className="h-3.5 w-3.5 text-gray-500" />
                  Raid candidate
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1.3fr]">
                  <div>
                    <label className="mb-1 block text-[11px] text-gray-500">
                      Name
                    </label>
                    <input
                      type="text"
                      value={raidCandidate}
                      onChange={(e) => setRaidCandidate(e.target.value)}
                      placeholder="e.g. Linear, Supabase, Clerk"
                      className="w-full rounded-md border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:border-purple-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-gray-500">
                      URL
                    </label>
                    <input
                      type="url"
                      value={raidCandidateUrl}
                      onChange={(e) => setRaidCandidateUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full rounded-md border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:border-purple-500 focus:outline-none"
                    />
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-gray-600">
                  Best-in-class tool you&apos;d rip off the shelf. Skip if
                  there&apos;s no contender.
                </p>
              </div>

              {/* 3. Current approach */}
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
                  <Wrench className="h-3.5 w-3.5 text-gray-500" />
                  Current approach
                </label>
                <textarea
                  value={currentApproach}
                  onChange={(e) => setCurrentApproach(e.target.value)}
                  rows={2}
                  placeholder="How are we solving this today?"
                  className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500/20"
                />
              </div>

              {/* 4. Unique wins */}
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
                  <Sparkles className="h-3.5 w-3.5 text-gray-500" />
                  Unique wins
                </label>
                <textarea
                  value={uniqueWins}
                  onChange={(e) => setUniqueWins(e.target.value)}
                  rows={2}
                  placeholder="What does the raid candidate do better than us?"
                  className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500/20"
                />
                <p className="mt-1 text-[11px] text-gray-600">
                  If the answer is &quot;nothing,&quot; that&apos;s a signal to
                  build.
                </p>
              </div>

              {/* 5. Verdict — visual anchor */}
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Verdict
                </label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  {VERDICT_ORDER.map((v) => {
                    const meta = VERDICT_META[v];
                    const active = verdict === v;
                    return (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setVerdict(v)}
                        className={`flex flex-col items-start gap-1 rounded-lg border p-2.5 text-left transition-all ${
                          active
                            ? `${meta.badge} ring-2 ring-offset-2 ring-offset-gray-900`
                            : "border-gray-800 bg-gray-950 text-gray-400 hover:border-gray-700 hover:text-gray-300"
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${meta.dot}`}
                          />
                          <span className="text-xs font-semibold uppercase tracking-wider">
                            {meta.label}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11px] text-gray-500">
                  {VERDICT_META[verdict].description}
                </p>
              </div>

              {/* Beliefs */}
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
                  <Tag className="h-3.5 w-3.5 text-gray-500" />
                  Beliefs touched
                </label>
                <input
                  type="text"
                  value={beliefsInput}
                  onChange={(e) => setBeliefsInput(e.target.value)}
                  placeholder="speed-over-polish, own-the-data, ..."
                  className="w-full rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500/20"
                />
                <p className="mt-1 text-[11px] text-gray-600">
                  Comma-separated. Which of your beliefs did this decision
                  lean on?
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
                  {submitting ? "Posting..." : "Post entry"}
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Entry count */}
        {!loading && entries.length > 0 && (
          <div className="mb-4 flex items-center justify-between text-xs text-gray-500">
            <span>
              {entries.length} {entries.length === 1 ? "audit" : "audits"}
            </span>
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
              <span className="text-sm text-gray-400">Loading entries...</span>
            </div>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-gray-800 bg-gray-900/30 py-20 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-gray-800 bg-gray-900">
              <Inbox className="h-6 w-6 text-gray-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-300">
                No audits yet
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Every time you decide between building a custom stack and
                raiding a best-in-class tool, log it here.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-xs font-medium text-purple-300 transition-colors hover:border-purple-500/50 hover:bg-purple-500/20"
            >
              <Plus className="h-3.5 w-3.5" /> Post the first audit
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {entries.map((entry) => {
              const meta = VERDICT_META[entry.verdict];
              return (
                <article
                  key={entry.id}
                  className={`overflow-hidden rounded-xl border border-l-4 border-gray-800 bg-gray-900 shadow-sm transition-all hover:border-gray-700 ${meta.accent}`}
                >
                  <div className="p-5">
                    {/* Top row: verdict badge + meta */}
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${meta.badge}`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${meta.dot}`}
                          />
                          {meta.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-gray-500">
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {authorLabel(entry.author)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(entry.created_at)}
                        </span>
                      </div>
                    </div>

                    {/* Problem — primary heading */}
                    <h3 className="mb-4 text-lg font-semibold leading-snug text-gray-100">
                      {entry.problem}
                    </h3>

                    {/* Structured fields */}
                    <dl className="space-y-3">
                      {entry.raid_candidate && (
                        <div className="flex gap-3">
                          <dt className="flex w-28 flex-shrink-0 items-center gap-1.5 pt-0.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                            <Package className="h-3 w-3" />
                            Candidate
                          </dt>
                          <dd className="flex-1 text-sm">
                            {entry.raid_candidate_url ? (
                              <a
                                href={entry.raid_candidate_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 hover:underline"
                              >
                                {entry.raid_candidate}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : (
                              <span className="text-gray-200">
                                {entry.raid_candidate}
                              </span>
                            )}
                          </dd>
                        </div>
                      )}

                      {entry.current_approach && (
                        <div className="flex gap-3">
                          <dt className="flex w-28 flex-shrink-0 items-center gap-1.5 pt-0.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                            <Wrench className="h-3 w-3" />
                            Current
                          </dt>
                          <dd className="flex-1 whitespace-pre-wrap text-sm text-gray-300">
                            {entry.current_approach}
                          </dd>
                        </div>
                      )}

                      {entry.unique_wins && (
                        <div className="flex gap-3">
                          <dt className="flex w-28 flex-shrink-0 items-center gap-1.5 pt-0.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                            <Sparkles className="h-3 w-3" />
                            Unique wins
                          </dt>
                          <dd className="flex-1 whitespace-pre-wrap text-sm text-gray-300">
                            {entry.unique_wins}
                          </dd>
                        </div>
                      )}
                    </dl>

                    {/* Beliefs footer */}
                    {entry.beliefs_touched &&
                      entry.beliefs_touched.length > 0 && (
                        <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-gray-800 pt-3">
                          <Tag className="h-3 w-3 text-gray-600" />
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
