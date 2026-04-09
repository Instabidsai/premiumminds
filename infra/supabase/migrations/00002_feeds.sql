-- =============================================================
-- GroupMind / PremiumMinds — feeds & verticals schema
-- =============================================================

-- ─── Verticals (the extraction lenses) ──────────────────────
create table if not exists public.verticals (
  id uuid primary key default uuid_generate_v4(),
  slug text unique not null,
  name text not null,
  description text not null,
  extraction_prompt text not null,
  schema_json jsonb not null,
  enabled boolean default true,
  created_by uuid references public.members(id),
  created_at timestamptz default now()
);

-- ─── Feeds (sources any member can add) ─────────────────────
create table if not exists public.feeds (
  id uuid primary key default uuid_generate_v4(),
  channel_id uuid references public.channels(id) on delete cascade not null,
  kind text not null check (kind in
    ('rss','arxiv','hn','github_releases','youtube','url_poll','reddit')),
  source_url text not null,
  config jsonb default '{}'::jsonb,
  label text not null,
  poll_interval_minutes int default 60,
  enabled boolean default true,
  last_polled_at timestamptz,
  last_error text,
  created_by uuid references public.members(id),
  created_at timestamptz default now()
);

create index if not exists feeds_enabled_idx on public.feeds (enabled, last_polled_at);

-- ─── Raw items the fetcher writes ───────────────────────────
create table if not exists public.feed_items (
  id uuid primary key default uuid_generate_v4(),
  feed_id uuid references public.feeds(id) on delete cascade not null,
  external_id text not null,
  title text,
  url text,
  author text,
  published_at timestamptz,
  raw_content text,
  metadata jsonb default '{}'::jsonb,
  processed_at timestamptz,
  posted_message_id uuid references public.messages(id),
  created_at timestamptz default now(),
  unique (feed_id, external_id)
);

create index if not exists feed_items_unprocessed_idx
  on public.feed_items (feed_id) where processed_at is null;

-- ─── Structured extractions (one row per item x vertical) ───
create table if not exists public.extractions (
  id uuid primary key default uuid_generate_v4(),
  feed_item_id uuid references public.feed_items(id) on delete cascade not null,
  vertical_id uuid references public.verticals(id) on delete cascade not null,
  payload jsonb not null,
  relevance_score real,
  created_at timestamptz default now(),
  unique (feed_item_id, vertical_id)
);

-- ─── RLS ────────────────────────────────────────────────────
alter table public.verticals  enable row level security;
alter table public.feeds       enable row level security;
alter table public.feed_items  enable row level security;
alter table public.extractions enable row level security;

create policy "verticals_select" on public.verticals for select
  using (auth.uid() is not null);
create policy "verticals_insert" on public.verticals for insert
  with check (auth.uid() is not null);

create policy "feeds_select" on public.feeds for select
  using (auth.uid() is not null);
create policy "feeds_insert" on public.feeds for insert
  with check (auth.uid() is not null);
create policy "feeds_update" on public.feeds for update
  using (auth.uid() is not null);

create policy "feed_items_select" on public.feed_items for select
  using (auth.uid() is not null);

create policy "extractions_select" on public.extractions for select
  using (auth.uid() is not null);

-- Realtime on feeds for UI updates
alter publication supabase_realtime add table public.feeds;

-- ─── Seed the default verticals ─────────────────────────────
insert into public.verticals (slug, name, description, extraction_prompt, schema_json)
values
 ('tools', 'Tools & Libraries',
  'New libraries, frameworks, MCP servers, SDKs, CLIs worth knowing about.',
  'Extract any new tools, libraries, frameworks, MCP servers, or SDKs mentioned. For each, give a name, a one-sentence description of what it does, the primary language/platform, and the link. Skip if the item is not about a tool.',
  '{"type":"object","properties":{"tools":{"type":"array","items":{"type":"object","properties":{"name":{"type":"string"},"description":{"type":"string"},"language":{"type":"string"},"link":{"type":"string"}},"required":["name","description"]}}},"required":["tools"]}'::jsonb),

 ('research', 'Research & Findings',
  'Papers, benchmarks, techniques, and empirical findings.',
  'Extract research claims. For each, give the core claim in one sentence, the evidence type (paper, benchmark, blog experiment), and the link. Skip if not research.',
  '{"type":"object","properties":{"findings":{"type":"array","items":{"type":"object","properties":{"claim":{"type":"string"},"evidence_type":{"type":"string"},"link":{"type":"string"}},"required":["claim"]}}},"required":["findings"]}'::jsonb),

 ('products', 'Products & Releases',
  'Product launches, model releases, pricing changes, major version bumps.',
  'Extract product and release news. For each, give the vendor, the product, what changed, and when. Skip if not a product/release.',
  '{"type":"object","properties":{"releases":{"type":"array","items":{"type":"object","properties":{"vendor":{"type":"string"},"product":{"type":"string"},"change":{"type":"string"},"when":{"type":"string"}},"required":["vendor","product","change"]}}},"required":["releases"]}'::jsonb),

 ('business', 'Business & Funding',
  'Funding rounds, acquisitions, partnerships, hiring signals.',
  'Extract business events: funding, M&A, partnerships, significant hires. Skip if none.',
  '{"type":"object","properties":{"events":{"type":"array","items":{"type":"object","properties":{"type":{"type":"string"},"companies":{"type":"array","items":{"type":"string"}},"summary":{"type":"string"},"amount":{"type":"string"}},"required":["type","summary"]}}},"required":["events"]}'::jsonb),

 ('tutorials', 'Tutorials & Guides',
  'How-to content, walkthroughs, example repos.',
  'Extract actionable tutorials. For each, give the topic, the format (blog/video/repo), the target skill level, and the link.',
  '{"type":"object","properties":{"tutorials":{"type":"array","items":{"type":"object","properties":{"topic":{"type":"string"},"format":{"type":"string"},"level":{"type":"string"},"link":{"type":"string"}},"required":["topic","link"]}}},"required":["tutorials"]}'::jsonb),

 ('signals', 'Signals Worth Watching',
  'Weak signals, emerging trends, things not yet obvious but worth tracking.',
  'Identify any weak signals or emerging trends. Be selective. Give the signal in one sentence and why it matters in one sentence.',
  '{"type":"object","properties":{"signals":{"type":"array","items":{"type":"object","properties":{"signal":{"type":"string"},"why_it_matters":{"type":"string"}},"required":["signal","why_it_matters"]}}},"required":["signals"]}'::jsonb)
on conflict (slug) do nothing;
