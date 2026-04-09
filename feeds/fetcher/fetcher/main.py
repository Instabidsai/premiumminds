"""
Feed Fetcher — polls enabled feeds from Supabase on a heartbeat loop,
fetches new items via source-specific adapters, writes to feed_items,
AND posts each new item as a message to the feed's target channel.

The Cartographer then picks up the message and forwards it to Graphiti.

Uses REST API directly (no supabase-py) to match cartographer's pattern.

Supported adapters: rss, arxiv, hn, github_releases, url_poll.
"""
from __future__ import annotations

import asyncio
import hashlib
import os
import re
import sys
import traceback
from datetime import datetime, timezone
from typing import Protocol
from xml.etree import ElementTree

import httpx

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
HEARTBEAT_SECONDS = int(os.environ.get("FETCHER_HEARTBEAT_SECONDS", "300"))

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}


async def sb_get(http: httpx.AsyncClient, path: str, params: dict) -> list:
    r = await http.get(f"{SUPABASE_URL}/rest/v1/{path}", params=params, headers=HEADERS, timeout=30)
    r.raise_for_status()
    return r.json()


async def sb_post(http: httpx.AsyncClient, path: str, body: dict | list, prefer: str = "return=minimal") -> list:
    headers = {**HEADERS, "Prefer": prefer}
    r = await http.post(f"{SUPABASE_URL}/rest/v1/{path}", headers=headers, json=body, timeout=30)
    if r.status_code >= 400:
        if "duplicate" in r.text.lower() or "conflict" in r.text.lower():
            return []
        raise Exception(f"POST {path} -> {r.status_code}: {r.text[:200]}")
    return r.json() if r.text else []


async def sb_patch(http: httpx.AsyncClient, path: str, params: dict, body: dict) -> None:
    r = await http.patch(
        f"{SUPABASE_URL}/rest/v1/{path}", params=params, headers=HEADERS, json=body, timeout=30
    )
    r.raise_for_status()


# ── Adapter Protocol ────────────────────────────────────────────

class FeedAdapter(Protocol):
    async def fetch(self, http: httpx.AsyncClient, feed: dict) -> list[dict]: ...


class RssAdapter:
    async def fetch(self, http: httpx.AsyncClient, feed: dict) -> list[dict]:
        r = await http.get(feed["source_url"], timeout=30, follow_redirects=True,
                          headers={"User-Agent": "PremiumMinds/1.0"})
        r.raise_for_status()
        root = ElementTree.fromstring(r.text)
        items: list[dict] = []

        for item in root.iter("item"):
            title = _text(item, "title")
            link = _text(item, "link")
            desc = _text(item, "description") or ""
            author = _text(item, "author") or _text(item, "{http://purl.org/dc/elements/1.1/}creator") or ""
            pub_date = _text(item, "pubDate") or ""
            guid = _text(item, "guid") or link or ""
            items.append({
                "external_id": guid, "title": title or "", "url": link or "",
                "raw_content": _strip_html(desc), "author": author,
                "published_at": _parse_date(pub_date),
            })

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
                "external_id": atom_id, "title": title or "", "url": link,
                "raw_content": _strip_html(summary), "author": author,
                "published_at": _parse_date(updated),
            })
        return items


class ArxivAdapter:
    async def fetch(self, http: httpx.AsyncClient, feed: dict) -> list[dict]:
        r = await http.get(feed["source_url"], timeout=30, follow_redirects=True)
        r.raise_for_status()
        root = ElementTree.fromstring(r.text)
        ns = {"a": "http://www.w3.org/2005/Atom"}
        items: list[dict] = []
        for entry in root.findall("a:entry", ns):
            arxiv_id = _text(entry, "a:id", ns)
            title = _text(entry, "a:title", ns) or ""
            summary = _text(entry, "a:summary", ns) or ""
            published = _text(entry, "a:published", ns) or ""
            authors = [_text(a, "a:name", ns) or "" for a in entry.findall("a:author", ns)]
            alt_link = entry.find("a:link[@rel='alternate']", ns)
            html_url = alt_link.get("href", "") if alt_link is not None else ""
            items.append({
                "external_id": arxiv_id or "",
                "title": " ".join(title.split()),
                "url": html_url,
                "raw_content": " ".join(summary.split()),
                "author": ", ".join(authors),
                "published_at": _parse_date(published),
            })
        return items


class HnAdapter:
    MAX_ITEMS = 20

    async def fetch(self, http: httpx.AsyncClient, feed: dict) -> list[dict]:
        r = await http.get(feed["source_url"], timeout=15)
        r.raise_for_status()
        story_ids: list[int] = r.json()[: self.MAX_ITEMS]
        items: list[dict] = []

        async def fetch_story(sid: int) -> dict | None:
            try:
                sr = await http.get(f"https://hacker-news.firebaseio.com/v0/item/{sid}.json", timeout=10)
                sr.raise_for_status()
                s = sr.json()
                if not s or s.get("type") != "story":
                    return None
                return {
                    "external_id": str(s["id"]),
                    "title": s.get("title", ""),
                    "url": s.get("url", f"https://news.ycombinator.com/item?id={s['id']}"),
                    "raw_content": s.get("text", "") or f"Score: {s.get('score', 0)} | Comments: {s.get('descendants', 0)}",
                    "author": s.get("by", ""),
                    "published_at": datetime.fromtimestamp(s.get("time", 0), tz=timezone.utc).isoformat() if s.get("time") else None,
                }
            except Exception:
                return None

        results = await asyncio.gather(*[fetch_story(sid) for sid in story_ids])
        for item in results:
            if item:
                items.append(item)
        return items


class GithubReleasesAdapter:
    async def fetch(self, http: httpx.AsyncClient, feed: dict) -> list[dict]:
        headers = {"Accept": "application/vnd.github+json"}
        if token := os.environ.get("GITHUB_TOKEN"):
            headers["Authorization"] = f"Bearer {token}"
        # source_url is either full API URL or "owner/repo"
        url = feed["source_url"]
        if not url.startswith("http"):
            url = f"https://api.github.com/repos/{url}/releases?per_page=10"
        r = await http.get(url, headers=headers, timeout=15, follow_redirects=True)
        r.raise_for_status()
        releases: list[dict] = r.json()
        items: list[dict] = []
        for rel in releases:
            items.append({
                "external_id": str(rel.get("id", "")),
                "title": rel.get("name") or rel.get("tag_name", ""),
                "url": rel.get("html_url", ""),
                "raw_content": rel.get("body", "") or "",
                "author": (rel.get("author") or {}).get("login", ""),
                "published_at": rel.get("published_at"),
            })
        return items


class UrlPollAdapter:
    async def fetch(self, http: httpx.AsyncClient, feed: dict) -> list[dict]:
        r = await http.get(feed["source_url"], timeout=30, follow_redirects=True)
        r.raise_for_status()
        content_hash = hashlib.sha256(r.text.encode()).hexdigest()[:16]
        return [{
            "external_id": f"poll:{content_hash}",
            "title": feed.get("label", feed["source_url"]),
            "url": feed["source_url"],
            "raw_content": r.text[:10000],
            "author": "",
            "published_at": datetime.now(timezone.utc).isoformat(),
        }]


ADAPTERS: dict[str, FeedAdapter] = {
    "rss": RssAdapter(),
    "arxiv": ArxivAdapter(),
    "hn": HnAdapter(),
    "github_releases": GithubReleasesAdapter(),
    "url_poll": UrlPollAdapter(),
}


# ── Helpers ─────────────────────────────────────────────────────

def _text(el, tag, ns=None):
    child = el.find(tag, ns) if ns else el.find(tag)
    return child.text.strip() if child is not None and child.text else None


def _strip_html(text: str) -> str:
    return re.sub(r"<[^>]+>", "", text).strip()


def _parse_date(date_str: str) -> str | None:
    if not date_str:
        return None
    for fmt in (
        "%a, %d %b %Y %H:%M:%S %z",
        "%a, %d %b %Y %H:%M:%S %Z",
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%dT%H:%M:%S.%f%z",
        "%Y-%m-%d",
    ):
        try:
            return datetime.strptime(date_str.strip(), fmt).isoformat()
        except ValueError:
            continue
    return date_str


# ── Channel posting ─────────────────────────────────────────────

_fetcher_author_id: str | None = None


async def ensure_fetcher_author(http: httpx.AsyncClient) -> str:
    """Get or create the groupmind.fetcher agent author."""
    global _fetcher_author_id
    if _fetcher_author_id:
        return _fetcher_author_id

    existing = await sb_get(
        http, "authors",
        {"agent_name": "eq.groupmind.fetcher", "select": "id", "limit": "1"}
    )
    if existing:
        _fetcher_author_id = existing[0]["id"]
        return _fetcher_author_id

    # Need to create — find system member first
    sys_member = await sb_get(http, "members", {"handle": "eq.system", "select": "id", "limit": "1"})
    if not sys_member:
        raise Exception("system member does not exist; cannot create fetcher author")
    created = await sb_post(
        http, "authors",
        {"kind": "agent", "agent_name": "groupmind.fetcher", "agent_owner": sys_member[0]["id"]},
        prefer="return=representation",
    )
    _fetcher_author_id = created[0]["id"]
    return _fetcher_author_id


def format_item_message(feed: dict, item: dict) -> str:
    """Format a feed item as a chat message body."""
    lines = [f"**{item.get('title') or '(untitled)'}**"]
    if item.get("url"):
        lines.append(item["url"])
    lines.append("")
    if item.get("author"):
        lines.append(f"_by {item['author']}_")
    if item.get("raw_content"):
        snippet = item["raw_content"][:500]
        if len(item["raw_content"]) > 500:
            snippet += "..."
        lines.append(snippet)
    lines.append("")
    lines.append(f"_via {feed.get('label', feed.get('kind', 'feed'))}_")
    return "\n".join(lines)


async def post_item_to_channel(
    http: httpx.AsyncClient,
    feed: dict,
    item: dict,
    feed_item_id: str,
    author_id: str,
) -> None:
    """Post a feed item as a message to the feed's target channel."""
    body = format_item_message(feed, item)
    msg_rows = await sb_post(
        http, "messages",
        {
            "channel_id": feed["channel_id"],
            "author_id": author_id,
            "body": body,
            "metadata": {"source": "feed", "feed_id": feed["id"], "feed_item_id": feed_item_id, "url": item.get("url")},
        },
        prefer="return=representation",
    )
    if msg_rows:
        # Link the message back to the feed_item
        await sb_patch(
            http, "feed_items",
            {"id": f"eq.{feed_item_id}"},
            {"posted_message_id": msg_rows[0]["id"], "processed_at": "now()"},
        )


# ── Main Loop ───────────────────────────────────────────────────

async def poll_feeds(http: httpx.AsyncClient) -> None:
    feeds = await sb_get(http, "feeds", {"enabled": "eq.true", "select": "*"})
    if not feeds:
        return

    author_id = await ensure_fetcher_author(http)
    now = datetime.now(timezone.utc)

    for feed in feeds:
        last_polled = feed.get("last_polled_at")
        interval_min = feed.get("poll_interval_minutes", 60)
        if last_polled:
            try:
                last_dt = datetime.fromisoformat(last_polled.replace("Z", "+00:00"))
                if (now - last_dt).total_seconds() / 60 < interval_min:
                    continue
            except (ValueError, TypeError):
                pass

        kind = feed.get("kind", "rss")
        adapter = ADAPTERS.get(kind)
        if not adapter:
            print(f"[fetcher] unknown kind: {kind}", flush=True)
            continue

        try:
            items = await adapter.fetch(http, feed)
        except Exception as e:
            print(f"[fetcher] fetch error {feed.get('label')}: {e}", flush=True)
            await sb_patch(
                http, "feeds", {"id": f"eq.{feed['id']}"},
                {"last_polled_at": now.isoformat(), "last_error": str(e)[:500]},
            )
            continue

        new_count = 0
        for item in items:
            if not item.get("external_id"):
                continue
            row = {
                "feed_id": feed["id"],
                "external_id": item["external_id"],
                "title": item.get("title", ""),
                "url": item.get("url", ""),
                "raw_content": item.get("raw_content", ""),
                "author": item.get("author", ""),
                "published_at": item.get("published_at"),
            }
            try:
                inserted = await sb_post(
                    http, "feed_items", row, prefer="return=representation",
                )
                if inserted:
                    await post_item_to_channel(http, feed, item, inserted[0]["id"], author_id)
                    new_count += 1
            except Exception as e:
                if "duplicate" in str(e).lower() or "conflict" in str(e).lower():
                    continue
                print(f"[fetcher] insert error: {e}", flush=True)

        await sb_patch(
            http, "feeds", {"id": f"eq.{feed['id']}"},
            {"last_polled_at": now.isoformat(), "last_error": None},
        )

        if new_count:
            print(f"[fetcher] {feed.get('label')}: {new_count} new items posted", flush=True)


async def main() -> None:
    print(f"[fetcher] starting heartbeat loop (every {HEARTBEAT_SECONDS}s)", flush=True)
    print(f"[fetcher] supabase={SUPABASE_URL}", flush=True)
    async with httpx.AsyncClient() as http:
        while True:
            try:
                await poll_feeds(http)
            except Exception as e:
                print(f"[fetcher] cycle error: {e}", flush=True)
                traceback.print_exc(file=sys.stdout)
            await asyncio.sleep(HEARTBEAT_SECONDS)


if __name__ == "__main__":
    asyncio.run(main())
