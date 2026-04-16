import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllPosts, getPostBySlug } from "@/lib/blog/posts";
import { Brain, ArrowLeft, Clock, Tag, Share2 } from "lucide-react";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return { title: "Not Found" };

  return {
    title: `${post.title} | PremiumMinds Blog`,
    description: post.description,
    openGraph: {
      title: post.title,
      description: post.description,
      type: "article",
      publishedTime: post.date,
      authors: [post.author],
      url: `https://premiumminds.io/blog/${post.slug}`,
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description,
    },
  };
}

/** Convert markdown-ish content string to simple HTML */
function renderContent(content: string): string {
  return content
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return "";

      // H2
      if (trimmed.startsWith("## ")) {
        const text = trimmed.slice(3);
        const id = text
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "");
        return `<h2 id="${id}" class="mt-14 mb-5 text-2xl font-semibold tracking-tight text-gray-50 lg:text-3xl">${text}</h2>`;
      }

      // H3
      if (trimmed.startsWith("### ")) {
        const text = trimmed.slice(4);
        return `<h3 class="mt-10 mb-4 text-xl font-semibold tracking-tight text-gray-100">${text}</h3>`;
      }

      // Unordered list items
      if (trimmed.startsWith("- ")) {
        const text = trimmed.slice(2).replace(/\*\*(.+?)\*\*/g, '<strong class="text-gray-200">$1</strong>');
        return `<li class="ml-6 pl-2 text-gray-400 leading-relaxed list-disc">${text}</li>`;
      }

      // Numbered list items
      if (/^\d+\.\s/.test(trimmed)) {
        const text = trimmed
          .replace(/^\d+\.\s/, "")
          .replace(/\*\*(.+?)\*\*/g, '<strong class="text-gray-200">$1</strong>');
        return `<li class="ml-6 pl-2 text-gray-400 leading-relaxed list-decimal">${text}</li>`;
      }

      // Bold-start paragraph (for definition-style paragraphs)
      if (trimmed.startsWith("**")) {
        const text = trimmed.replace(
          /\*\*(.+?)\*\*/g,
          '<strong class="text-gray-200">$1</strong>'
        );
        return `<p class="mt-4 leading-relaxed text-gray-400">${text}</p>`;
      }

      // Regular paragraph
      const text = trimmed.replace(
        /\*\*(.+?)\*\*/g,
        '<strong class="text-gray-200">$1</strong>'
      );
      return `<p class="mt-4 leading-relaxed text-gray-400">${text}</p>`;
    })
    .filter(Boolean)
    .join("\n");
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    notFound();
  }

  const html = renderContent(post.content);

  return (
    <div className="relative min-h-screen bg-gray-950 text-gray-100">
      {/* Background layers */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(147,51,234,0.12),transparent_60%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.025] [background-image:linear-gradient(rgba(255,255,255,0.6)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.6)_1px,transparent_1px)] [background-size:48px_48px]"
      />

      <div className="relative mx-auto max-w-3xl px-6 py-10 lg:py-16">
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
            href="/blog"
            className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-gray-400 transition-colors hover:text-purple-400"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All articles
          </Link>
        </header>

        {/* Article header */}
        <div className="mt-16 lg:mt-24">
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
            <span className="h-1 w-1 rounded-full bg-gray-700" />
            <span>{post.author}</span>
          </div>

          <h1 className="mt-6 text-3xl font-semibold tracking-tight text-gray-50 lg:text-4xl lg:leading-tight">
            {post.title}
          </h1>

          <p className="mt-5 text-lg leading-relaxed text-gray-400">
            {post.description}
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-1 rounded-full border border-gray-800 bg-gray-900/60 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-gray-500"
              >
                <Tag className="h-2.5 w-2.5" />
                {tag.replace(/-/g, " ")}
              </span>
            ))}
          </div>

          {/* Divider */}
          <div className="mt-10 h-px bg-gradient-to-r from-transparent via-gray-800 to-transparent" />
        </div>

        {/* Article body */}
        <article
          className="prose-custom mt-2"
          dangerouslySetInnerHTML={{ __html: html }}
        />

        {/* CTA */}
        <div className="mt-16 rounded-2xl border border-purple-500/20 bg-purple-500/5 p-8 text-center">
          <h3 className="text-xl font-semibold text-gray-100">
            Join the conversation
          </h3>
          <p className="mt-3 text-gray-400">
            PremiumMinds is where AI-native builders share knowledge through a
            living mind map. Agents and humans, same table, shared memory.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-purple-600 px-6 py-3 font-medium text-white shadow-lg shadow-purple-950/50 transition-all duration-300 hover:bg-purple-500 hover:shadow-xl hover:shadow-purple-900/40"
          >
            Request access
            <ArrowLeft className="h-4 w-4 rotate-180" />
          </Link>
        </div>

        {/* Back to blog */}
        <div className="mt-12 text-center">
          <Link
            href="/blog"
            className="inline-flex items-center gap-1.5 text-sm text-gray-400 transition-colors hover:text-purple-400"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to all articles
          </Link>
        </div>

        {/* Footer */}
        <footer className="mt-16 flex items-center justify-between border-t border-gray-900 pt-8 pb-6 text-[11px] text-gray-600">
          <span className="uppercase tracking-[0.18em]">premiumminds.io</span>
          <span className="uppercase tracking-[0.18em]">
            Collective intelligence for the AI-native generation
          </span>
        </footer>
      </div>
    </div>
  );
}
