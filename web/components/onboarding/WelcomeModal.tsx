"use client";

import { useCallback, useEffect, useState } from "react";
import * as Icons from "lucide-react";
import { Brain, ArrowRight, Send, X } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";

/* ---------- types ---------- */

interface Lane {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string | null;
  color: string | null;
  sort_order: number | null;
}

interface WelcomeModalProps {
  supabase: SupabaseClient;
  memberId: string;
  authUserId: string;
}

/* ---------- color maps (Tailwind needs full strings at build time) ---------- */

const BG_ICON: Record<string, string> = {
  purple: "bg-purple-500/20 text-purple-400",
  amber: "bg-amber-500/20 text-amber-400",
  blue: "bg-blue-500/20 text-blue-400",
  emerald: "bg-emerald-500/20 text-emerald-400",
  sky: "bg-sky-500/20 text-sky-400",
  rose: "bg-rose-500/20 text-rose-400",
};

const BORDER: Record<string, string> = {
  purple: "border-purple-500/30",
  amber: "border-amber-500/30",
  blue: "border-blue-500/30",
  emerald: "border-emerald-500/30",
  sky: "border-sky-500/30",
  rose: "border-rose-500/30",
};

/* ---------- component ---------- */

export default function WelcomeModal({
  supabase,
  memberId,
  authUserId,
}: WelcomeModalProps) {
  const [step, setStep] = useState(0);
  const [lanes, setLanes] = useState<Lane[]>([]);
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [visible, setVisible] = useState(true);

  // Fetch lanes for step 2
  useEffect(() => {
    supabase
      .from("lanes")
      .select("id, slug, name, description, icon, color, sort_order")
      .order("sort_order", { ascending: true })
      .then(({ data }) => {
        if (data) setLanes(data as Lane[]);
      });
  }, [supabase]);

  const complete = useCallback(async () => {
    setVisible(false);
    await supabase
      .from("members")
      .update({ onboarded_at: new Date().toISOString() })
      .eq("id", memberId);
  }, [supabase, memberId]);

  const handlePost = useCallback(async () => {
    if (!body.trim()) {
      await complete();
      return;
    }

    setPosting(true);

    try {
      // Find #general channel
      const { data: ch } = await supabase
        .from("channels")
        .select("id")
        .eq("slug", "general")
        .single();

      if (!ch) {
        await complete();
        return;
      }

      // Get or create author
      let { data: author } = await supabase
        .from("authors")
        .select("id")
        .eq("member_id", memberId)
        .eq("kind", "human")
        .maybeSingle();

      if (!author) {
        const { data: newAuthor } = await supabase
          .from("authors")
          .insert({ kind: "human", member_id: memberId })
          .select("id")
          .single();
        author = newAuthor;
      }

      if (author) {
        await supabase.from("messages").insert({
          channel_id: ch.id,
          author_id: author.id,
          body: body.trim(),
        });
      }
    } catch (err) {
      console.error("Onboarding post failed:", err);
    } finally {
      setPosting(false);
      await complete();
    }
  }, [body, supabase, memberId, complete]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative mx-4 w-full max-w-lg rounded-2xl border border-gray-800 bg-gray-900 shadow-2xl">
        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 pt-6">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`h-2 w-2 rounded-full transition-colors ${
                i === step
                  ? "bg-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.5)]"
                  : i < step
                    ? "bg-purple-600"
                    : "bg-gray-700"
              }`}
            />
          ))}
        </div>

        {/* Skip button — always visible */}
        <button
          type="button"
          onClick={complete}
          className="absolute right-4 top-4 flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-300"
        >
          Skip
          <X className="h-3.5 w-3.5" />
        </button>

        {/* Step content */}
        <div className="px-8 pb-8 pt-6">
          {step === 0 && <StepWelcome onNext={() => setStep(1)} />}
          {step === 1 && (
            <StepLanes lanes={lanes} onNext={() => setStep(2)} />
          )}
          {step === 2 && (
            <StepFirstPost
              body={body}
              setBody={setBody}
              posting={posting}
              onPost={handlePost}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- Step 1: Welcome ---------- */

function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-purple-600/20 ring-1 ring-purple-500/30">
        <Brain className="h-8 w-8 text-purple-400" />
      </div>
      <h2 className="mb-3 text-2xl font-bold text-gray-100">
        You&apos;re at the Architects&apos; Table.
      </h2>
      <p className="mb-8 max-w-sm text-sm leading-relaxed text-gray-400">
        This is a shared mind for builders who think in systems. Every idea you
        drop here connects to the collective graph and gets smarter over time.
      </p>
      <button
        type="button"
        onClick={onNext}
        className="flex items-center gap-2 rounded-xl bg-purple-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-purple-500"
      >
        Show me the lanes
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}

/* ---------- Step 2: The 6 Lanes ---------- */

function StepLanes({
  lanes,
  onNext,
}: {
  lanes: Lane[];
  onNext: () => void;
}) {
  return (
    <div className="flex flex-col items-center">
      <h2 className="mb-1 text-xl font-bold text-gray-100">The Lanes</h2>
      <p className="mb-5 text-sm text-gray-500">
        Every conversation flows through a lane.
      </p>

      <div className="mb-6 grid w-full grid-cols-2 gap-3">
        {lanes.map((lane) => {
          const LaneIcon =
            (lane.icon &&
              (Icons as unknown as Record<string, Icons.LucideIcon>)[
                lane.icon
              ]) ||
            Icons.Hash;
          const iconColor =
            (lane.color && BG_ICON[lane.color]) ||
            "bg-gray-700/50 text-gray-400";
          const borderColor =
            (lane.color && BORDER[lane.color]) || "border-gray-700";

          return (
            <div
              key={lane.id}
              className={`flex items-start gap-3 rounded-xl border ${borderColor} bg-gray-800/40 p-3`}
            >
              <div
                className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${iconColor}`}
              >
                <LaneIcon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-200">
                  {lane.name}
                </p>
                <p className="line-clamp-2 text-xs leading-relaxed text-gray-500">
                  {lane.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onNext}
        className="flex items-center gap-2 rounded-xl bg-purple-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-purple-500"
      >
        Drop my first thought
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}

/* ---------- Step 3: First Post ---------- */

function StepFirstPost({
  body,
  setBody,
  posting,
  onPost,
}: {
  body: string;
  setBody: (v: string) => void;
  posting: boolean;
  onPost: () => void;
}) {
  return (
    <div className="flex flex-col items-center">
      <h2 className="mb-1 text-xl font-bold text-gray-100">
        Drop your first thought
      </h2>
      <p className="mb-5 text-sm text-gray-500">
        It goes straight to #general. What&apos;s on your mind?
      </p>

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="An idea, a question, a half-baked theory..."
        rows={4}
        className="mb-5 w-full resize-none rounded-xl border border-gray-700 bg-gray-800/60 px-4 py-3 text-sm text-gray-200 placeholder-gray-600 outline-none transition-colors focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/30"
      />

      <button
        type="button"
        onClick={onPost}
        disabled={posting}
        className="flex items-center gap-2 rounded-xl bg-purple-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-purple-500 disabled:opacity-50"
      >
        {posting ? (
          <>
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            Posting...
          </>
        ) : body.trim() ? (
          <>
            Post to #general
            <Send className="h-4 w-4" />
          </>
        ) : (
          <>
            Finish setup
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>
    </div>
  );
}
