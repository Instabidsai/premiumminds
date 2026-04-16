import type { Metadata } from "next";
import Link from "next/link";
import { getAllPosts } from "@/lib/blog/posts";
import { Brain, ArrowRight, Clock, Tag } from "lucide-react";

export const metadata: Metadata = {
  title: "Blog | PremiumMinds - AI Agent Communities & Builder Intelligence",
  description:
    "Deep-dive articles on AI agent communities, Claude Code workflows, multi-session orchestration, and building AI-native business automation. Written by and for agent operators.",
  openGraph: {
    title: "PremiumMinds Blog",
    description:
      "Deep-dive articles on AI agent communities, Claude Code workflows, and AI-native automation for builders and operators.",
    type: "website",
    url: "https://premiumminds.io/blog",
  },
};

export default function BlogIndex() {
  const posts = getAllPosts();

  return (
    <div className="relative min-h-screen bg-gray-950 text-gray-100">
      {/* Background layers */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(147,51,234,0.18),transparent_60%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.025] [background-image:linear-gradient(rgba(255,255,255,0.6)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.6)_1px,transparent_1px)] [background-size:48px_48px]"
      />

      <div className="relative mx-auto max-w-4xl px-6 py-10 lg:py-16">
        {/* Header */}
        <header className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-600/15 ring-1 ring-purple-500/30 shadow-lg shadow-purple-950/20 transition-all duration-300 group-hover:bg-purple-600/25 group-hover:ring-purple-500/50">
              <Brain className="h-5 w-5 text-purple-400" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-gray-500">
                premiumminds.io
              </span>
              <span className="mt-1 text-lg font-semibold tracking-tight">
                <span className="text-purple-400">Premium</span>
                <span className="text-gray-100">Minds</span>
              </span>
            </div>
          </Link>
          <Link
            href="/"
            className="text-[11px] font-medium uppercase tracking-[0.18em] text-gray-400 transition-colors hover:text-purple-400"
          >
            Home
          </Link>
        </header>

        {/* Page title */}
        <div className="mt-16 lg:mt-24">
          <div className="inline-flex items-center gap-2 rounded-full border border-purple-500/20 bg-purple-500/5 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-purple-300">
            <span className="h-1 w-1 rounded-full bg-purple-400" />
            Builder Intelligence
          </div>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-gray-50 lg:text-5xl">
            Blog
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-gray-400">
            Deep-dive articles on AI agent communities, multi-session
            orchestration, and building AI-native business automation. Written by
            and for agent operators.
          </p>
        </div>

        {/* Posts */}
        <div className="mt-16 space-y-8">
          {posts.map((post) => (
            <article key={post.slug}>
              <Link
                href={`/blog/${post.slug}`}
                className="group block rounded-2xl border border-gray-800/80 bg-gray-900/40 p-8 backdrop-blur-sm transition-all duration-300 hover:border-purple-500/30 hover:bg-gray-900/70 hover:shadow-xl hover:shadow-purple-950/20"
              >
                <div className="flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-[0.15em] text-gray-500">
                  <time dateTime={post.date}>
                    {new Date(post.date).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </time>
                  <span className="h-1 w-1 rounded-full bg-gray-700" />
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {post.readTime}
                  </span>
                </div>

                <h2 className="mt-4 text-xl font-semibold tracking-tight text-gray-100 transition-colors duration-300 group-hover:text-purple-300 lg:text-2xl">
                  {post.title}
                </h2>

                <p className="mt-3 leading-relaxed text-gray-400">
                  {post.description}
                </p>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex flex-wrap gap-2">
                    {post.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="flex items-center gap-1 rounded-full border border-gray-800 bg-gray-900/60 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-gray-500"
                      >
                        <Tag className="h-2.5 w-2.5" />
                        {tag.replace(/-/g, " ")}
                      </span>
                    ))}
                  </div>
                  <span className="flex items-center gap-1.5 text-sm font-medium text-purple-400 transition-all duration-300 group-hover:gap-2.5">
                    Read article
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </div>
              </Link>
            </article>
          ))}
        </div>

        {/* Footer */}
        <footer className="mt-24 flex items-center justify-between border-t border-gray-900 pt-8 pb-6 text-[11px] text-gray-600">
          <span className="uppercase tracking-[0.18em]">premiumminds.io</span>
          <span className="uppercase tracking-[0.18em]">
            Collective intelligence for the AI-native generation
          </span>
        </footer>
      </div>
    </div>
  );
}
