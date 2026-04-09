"""
Feed Fetcher — polls enabled feeds from Supabase on a heartbeat loop,
fetches new items via source-specific adapters, and writes to feed_items
with dedup on (feed_id, external_id).

Supported adapters: rss, arxiv, hn, github_releases, url_poll.

Required tables (create via migration):
  feeds(id uuid PK, name text, kind text, url text, enabled bool, poll_interval_min int,
        channel_id uuid FK, last_polled_at timestamptz, created_at timestamptz)
  feed_items(id uuid PK, feed_id uuid FK, external_id text, title text, url text,
             body text, author text, published_at timestamptz, processed_at timestamptz,
             created_at timestamptz, UNIQUE(feed_id, external_id))
"""
from __future__ import annotations

import asyncio
import hashlib
import os
import re
from datetime import datetime, timezone
from typing import Any, Protocol
from xml.etree import ElementTree

import httpx
from supabase import acreate_client, AsyncClient

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
POLL_HEARTBEAT_SECONDS = int(os.environ.get("POLL_HEARTBEAT_SECONDS", "120"))


# ── Adapter Protocol ────────────────────────────────────────────

class FeedAdapter(Protocol):
    async def fetch(self, http: httpx.AsyncClient, feed: dict) -> list[dict]:
        """Return a list of dicts with keys: external_id, title, url, body, author, published_at."""
        ...


# ── RSS / Atom Adapter ──────────────────────────────────────────

class RssAdapter:
    async def fetch(self, http: httpx.AsyncClient, feed: dict) -> list[dict]:
        r = await http.get(feed["url"], timeout=30, follow_redirects=True)
        r.raise_for_status()
        root = ElementTree.fromstring(r.text)

        items: list[dict] = []

        # RSS 2.0
        for item in root.iter("item"):
            title = _text(item, "title")
            link = _text(item, "link")
            desc = _text(item, "description") or ""
            author = _text(item, "author") or _text(item, "{http://purl.org/dc/elements/1.1/}creator") or ""
            pub_date = _text(item, "pubDate") or ""
            guid = _text(item, "guid") or link or ""
            items.append({
                "external_id": guid,
                "title": title or "",
                "url": link or "",
                "body": _strip_html(desc),
                "author": author,
                "published_at": _parse_date(pub_date),
            })

        # Atom
        for entry in root.iter("{http://www.w3.org/2005/Atom}entry"):
            title = _text(entry, "{http://www.w3.org/2005/Atom}title")
            link_el = entry.find("{http://www.w3.org/2005/Atom}link")
            link = link_el.get("href", "") if link_el is not None else ""
            summary = _text(entry, "{http://www.w3.org/2005/Atom}summary") or _text(entry, "{http://www.w3.org/2005/Atom}content") or ""
            author_el = entry.find("{http://www.w3.org/2005/Atom}author")
            author = ""
            if author_el is not None:
                author = _text(author_el, "{http://www.w3.org/2005/Atom}name") or ""
            atom_id = _text(entry, "{http://www.w3.org/2005/Atom}id") or link
            updated = _text(entry, "{http://www.w3.org/2005/Atom}updated") or _text(entry, "{http://www.w3.org/2005/Atom}published") or ""
            items.append({
                "external_id": atom_id,
                "title": title or "",
                "url": link,
                "body": _strip_html(summary),
                "author": author,
                "published_at": _parse_date(updated),
            })

        return items


# ── ArXiv Adapter ───────────────────────────────────────────────

class ArxivAdapter:
    """Fetches from the arXiv Atom API.
    Feed URL should be like: http://export.arxiv.org/api/query?search_query=cat:cs.AI&sortBy=submittedDate&sortOrder=descending&max_results=25
    """
    async def fetch(self, http: httpx.AsyncClient, feed: dict) -> list[dict]:
        r = await http.get(feed["url"], timeout=30, follow_redirects=True)
        r.raise_for_status()
        root = ElementTree.fromstring(r.text)

        ns = {"a": "http://www.w3.org/2005/Atom", "arxiv": "http://arxiv.org/schemas/atom"}
        items: list[dict] = []
        for entry in root.findall("a:entry", ns):
            arxiv_id = _text(entry, "a:id", ns)
            title = _text(entry, "a:title", ns) or ""
            summary = _text(entry, "a:summary", ns) or ""
            published = _text(entry, "a:published", ns) or ""
            authors = [_text(a, "a:name", ns) or "" for a in entry.findall("a:author", ns)]

            link_el = entry.find("a:link[@title='pdf']", ns)
            pdf_url = link_el.get("href", "") if link_el is not None else ""
            alt_link = entry.find("a:link[@rel='alternate']", ns)
            html_url = alt_link.get("href", "") if alt_link is not None else ""

            items.append({
                "external_id": arxiv_id or "",
                "title": " ".join(title.split()),
                "url": html_url or pdf_url,
                "body": " ".join(summary.split()),
                "author": ", ".join(authors),
                "published_at": _parse_date(published),
            })

        return items


# ── Hacker News Adapter ────────────────────────────────────────

class HnAdapter:
    """Polls HN top/new/best stories. Feed URL should be one of:
    https://hacker-news.firebaseio.com/v0/topstories.json
    https://hacker-news.firebaseio.com/v0/newstories.json
    """
    MAX_ITEMS = 30

    async def fetch(self, http: httpx.AsyncClient, feed: dict) -> list[dict]:
        r = await http.get(feed["url"], timeout=15)
        r.raise_for_status()
        story_ids: list[int] = r.json()[: self.MAX_ITEMS]

        items: list[dict] = []

        async def fetch_story(sid: int) -> dict | None:
            try:
                sr = await http.get(
                    f"https://hacker-news.firebaseio.com/v0/item/{sid}.json", timeout=10
                )
                sr.raise_for_status()
                s = sr.json()
                if not s or s.get("type") != "story":
                    return None
                return {
                    "external_id": str(s["id"]),
                    "title": s.get("title", ""),
                    "url": s.get("url", f"https://news.ycombinator.com/item?id={s['id']}"),
                    "body": s.get("text", "") or f"Score: {s.get('score', 0)} | Comments: {s.get('descendants', 0)}",
                    "author": s.get("by", ""),
                    "published_at": datetime.fromtimestamp(s.get("time", 0), tz=timezone.utc).isoformat() if s.get("time") else None,
                }
            except Exception:
                return None

        tasks = [fetch_story(sid) for sid in story_ids]
        results = await asyncio.gather(*tasks)
        for item in results:
            if item:
                items.append(item)

        return items


# ── GitHub Releases Adapter ─────────────────────────────────────

class GithubReleasesAdapter:
    """Polls GitHub releases for a repo.
    Feed URL: https://api.github.com/repos/{owner}/{repo}/releases?per_page=10
    """
    async def fetch(self, http: httpx.AsyncClient, feed: dict) -> list[dict]:
        headers = {"Accept": "application/vnd.github+json"}
        gh_token = os.environ.get("GITHUB_TOKEN")
        if gh_token:
            headers["Authorization"] = f"Bearer {gh_token}"

        r = await http.get(feed["url"], headers=headers, timeout=15, follow_redirects=True)
        r.raise_for_status()
        releases: list[dict] = r.json()

        items: list[dict] = []
        for rel in releases:
            items.append({
                "external_id": str(rel.get("id", "")),
                "title": rel.get("name") or rel.get("tag_name", ""),
                "url": rel.get("html_url", ""),
                "body": rel.get("body", "") or "",
                "author": rel.get("author", {}).get("login", ""),
                "published_at": rel.get("published_at"),
            })

        return items


# ── URL Poll Adapter ────────────────────────────────────────────

class UrlPollAdapter:
    """Generic URL poller — fetches the page and creates a single item
    with a content hash as external_id. Only creates a new item when
    the content changes.
    """
    async def fetch(self, http: httpx.AsyncClient, feed: dict) -> list[dict]:
        r = await http.get(feed["url"], timeout=30, follow_redirects=True)
        r.raise_for_status()
        content = r.text
        content_hash = hashlib.sha256(content.encode()).hexdigest()[:16]

        return [
            {
                "external_id": f"poll:{content_hash}",
                "title": feed.get("name", feed["url"]),
                "url": feed["url"],
                "body": content[:10000],  # Truncate very long pages
                "author": "",
                "published_at": datetime.now(timezone.utc).isoformat(),
            }
        ]


# ── Adapter Registry ────────────────────────────────────────────

ADAPTERS: dict[str, FeedAdapter] = {
    "rss": RssAdapter(),
    "arxiv": ArxivAdapter(),
    "hn": HnAdapter(),
    "github_releases": GithubReleasesAdapter(),
    "url_poll": UrlPollAdapter(),
}


# ── Helpers ─────────────────────────────────────────────────────

def _text(el: ElementTree.Element, tag: str, ns: dict | None = None) -> str | None:
    child = el.find(tag, ns) if ns else el.find(tag)
    return child.text.strip() if child is not None and child.text else None


def _strip_html(text: str) -> str:
    """Crude HTML tag removal."""
    return re.sub(r"<[^>]+>", "", text).strip()


def _parse_date(date_str: str) -> str | None:
    """Best-effort date parsing to ISO format."""
    if not date_str:
        return None
    # Try common formats
    for fmt in (
        "%a, %d %b %Y %H:%M:%S %z",   # RFC 2822
        "%a, %d %b %Y %H:%M:%S %Z",
        "%Y-%m-%dT%H:%M:%SZ",          # ISO 8601
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%dT%H:%M:%S.%f%z",
        "%Y-%m-%d",
    ):
        try:
            return datetime.strptime(date_str.strip(), fmt).isoformat()
        except ValueError:
            continue
    return date_str  # Return as-is if we can't parse


# ── Main Loop ───────────────────────────────────────────────────

async def poll_feeds(sb: AsyncClient, http: httpx.AsyncClient) -> None:
    """One polling cycle: fetch all enabled feeds due for refresh."""
    feeds_result = await sb.table("feeds").select("*").eq("enabled", True).execute()
    feeds = feeds_result.data
    if not feeds:
        return

    now = datetime.now(timezone.utc)

    for feed in feeds:
        # Check if enough time has elapsed since last poll
        last_polled = feed.get("last_polled_at")
        interval_min = feed.get("poll_interval_min", 15)
        if last_polled:
            try:
                last_dt = datetime.fromisoformat(last_polled.replace("Z", "+00:00"))
                elapsed_min = (now - last_dt).total_seconds() / 60
                if elapsed_min < interval_min:
                    continue
            except (ValueError, TypeError):
                pass

        kind = feed.get("kind", "rss")
        adapter = ADAPTERS.get(kind)
        if not adapter:
            print(f"[fetcher] unknown feed kind: {kind} for feed {feed['id']}", flush=True)
            continue

        try:
            items = await adapter.fetch(http, feed)
        except Exception as e:
            print(f"[fetcher] error fetching feed {feed['id']} ({kind}): {e}", flush=True)
            continue

        inserted = 0
        for item in items:
            if not item.get("external_id"):
                continue
            row = {
                "feed_id": feed["id"],
                "external_id": item["external_id"],
                "title": item.get("title", ""),
                "url": item.get("url", ""),
                "body": item.get("body", ""),
                "author": item.get("author", ""),
                "published_at": item.get("published_at"),
            }
            try:
                await sb.table("feed_items").upsert(
                    row, on_conflict="feed_id,external_id", ignore_duplicates=True
                ).execute()
                inserted += 1
            except Exception as e:
                # Dedup constraint — skip silently
                if "duplicate" in str(e).lower() or "conflict" in str(e).lower():
                    continue
                print(f"[fetcher] insert error: {e}", flush=True)

        # Update last_polled_at
        await sb.table("feeds").update({"last_polled_at": now.isoformat()}).eq("id", feed["id"]).execute()

        if inserted:
            print(f"[fetcher] feed {feed['name']}: {inserted} new items", flush=True)


async def main() -> None:
    sb = await acreate_client(SUPABASE_URL, SUPABASE_KEY)
    async with httpx.AsyncClient() as http:
        print(f"[fetcher] starting heartbeat loop (every {POLL_HEARTBEAT_SECONDS}s)", flush=True)
        while True:
            try:
                await poll_feeds(sb, http)
            except Exception as e:
                print(f"[fetcher] poll cycle error: {e}", flush=True)
            await asyncio.sleep(POLL_HEARTBEAT_SECONDS)


if __name__ == "__main__":
    asyncio.run(main())
