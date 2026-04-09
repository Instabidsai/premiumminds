-- =============================================================
-- GroupMind / PremiumMinds — initial schema
-- =============================================================

create extension if not exists "uuid-ossp";
create extension if not exists "vector";

-- ─── Members ────────────────────────────────────────────────
create table if not exists public.members (
  id uuid primary key default uuid_generate_v4(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  handle text unique not null,
  display_name text,
  bio text,
  avatar_url text,
  created_at timestamptz default now()
);

-- ─── Channels (map to graphiti group_ids) ───────────────────
create table if not exists public.channels (
  id uuid primary key default uuid_generate_v4(),
  slug text unique not null,
  name text not null,
  description text,
  is_private boolean default false,
  created_by uuid references public.members(id),
  created_at timestamptz default now()
);

create table if not exists public.channel_members (
  channel_id uuid references public.channels(id) on delete cascade,
  member_id uuid references public.members(id) on delete cascade,
  role text default 'member',
  primary key (channel_id, member_id)
);

-- ─── Authors: humans AND agents are first-class ─────────────
create table if not exists public.authors (
  id uuid primary key default uuid_generate_v4(),
  kind text not null check (kind in ('human','agent')),
  member_id uuid references public.members(id) on delete cascade,
  agent_name text,
  agent_owner uuid references public.members(id),
  created_at timestamptz default now()
);

-- ─── Messages ───────────────────────────────────────────────
create table if not exists public.messages (
  id uuid primary key default uuid_generate_v4(),
  channel_id uuid references public.channels(id) on delete cascade not null,
  author_id uuid references public.authors(id) not null,
  parent_id uuid references public.messages(id),
  body text not null,
  metadata jsonb default '{}'::jsonb,
  embedding vector(1536),
  ingested_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists messages_channel_created_idx
  on public.messages (channel_id, created_at desc);

-- ─── Documents ──────────────────────────────────────────────
create table if not exists public.documents (
  id uuid primary key default uuid_generate_v4(),
  channel_id uuid references public.channels(id) on delete cascade,
  uploaded_by uuid references public.authors(id),
  title text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  extracted_text text,
  ingested_at timestamptz,
  created_at timestamptz default now()
);

-- ─── Events log (for worker tailing) ────────────────────────
create table if not exists public.events (
  id bigserial primary key,
  kind text not null,
  payload jsonb not null,
  created_at timestamptz default now()
);

-- ─── Triggers ───────────────────────────────────────────────
create or replace function public.emit_message_event()
returns trigger language plpgsql as $$
begin
  insert into public.events(kind, payload)
  values ('message.created',
          jsonb_build_object(
            'message_id', new.id,
            'channel_id', new.channel_id,
            'author_id', new.author_id,
            'body', new.body
          ));
  return new;
end $$;

drop trigger if exists trg_message_event on public.messages;
create trigger trg_message_event
  after insert on public.messages
  for each row execute function public.emit_message_event();

create or replace function public.emit_doc_event()
returns trigger language plpgsql as $$
begin
  insert into public.events(kind, payload)
  values ('doc.created',
          jsonb_build_object(
            'doc_id', new.id,
            'channel_id', new.channel_id,
            'title', new.title,
            'storage_path', new.storage_path
          ));
  return new;
end $$;

drop trigger if exists trg_doc_event on public.documents;
create trigger trg_doc_event
  after insert on public.documents
  for each row execute function public.emit_doc_event();

-- ─── RLS ────────────────────────────────────────────────────
alter table public.members         enable row level security;
alter table public.channels        enable row level security;
alter table public.channel_members enable row level security;
alter table public.authors         enable row level security;
alter table public.messages        enable row level security;
alter table public.documents       enable row level security;

-- Members visible to signed-in users
create policy "members_select" on public.members for select
  using (auth.uid() is not null);

-- Members can update their own row
create policy "members_update_own" on public.members for update
  using (auth_user_id = auth.uid());

-- Members can insert their own row (on signup)
create policy "members_insert_own" on public.members for insert
  with check (auth_user_id = auth.uid());

-- Channels: see public channels or channels you belong to
create policy "channels_select" on public.channels for select
  using (
    not is_private
    or exists (
      select 1 from public.channel_members cm
      join public.members m on m.id = cm.member_id
      where cm.channel_id = channels.id and m.auth_user_id = auth.uid()
    )
  );

-- Anyone signed in can create channels
create policy "channels_insert" on public.channels for insert
  with check (auth.uid() is not null);

-- Channel members: visible if you're in the channel
create policy "channel_members_select" on public.channel_members for select
  using (
    exists (
      select 1 from public.channel_members cm
      join public.members m on m.id = cm.member_id
      where cm.channel_id = channel_members.channel_id and m.auth_user_id = auth.uid()
    )
  );

-- Channel members: can join channels
create policy "channel_members_insert" on public.channel_members for insert
  with check (auth.uid() is not null);

-- Authors: visible to signed-in users
create policy "authors_select" on public.authors for select
  using (auth.uid() is not null);

-- Authors: can create own author entries
create policy "authors_insert" on public.authors for insert
  with check (auth.uid() is not null);

-- Messages: read if you can see the channel
create policy "messages_select" on public.messages for select
  using (
    exists (
      select 1 from public.channels c
      where c.id = messages.channel_id
      and (
        not c.is_private
        or exists (
          select 1 from public.channel_members cm
          join public.members m on m.id = cm.member_id
          where cm.channel_id = c.id and m.auth_user_id = auth.uid()
        )
      )
    )
  );

-- Messages: insert as yourself
create policy "messages_insert" on public.messages for insert
  with check (auth.uid() is not null);

-- Documents: same as messages
create policy "documents_select" on public.documents for select
  using (
    exists (
      select 1 from public.channels c
      where c.id = documents.channel_id
      and (
        not c.is_private
        or exists (
          select 1 from public.channel_members cm
          join public.members m on m.id = cm.member_id
          where cm.channel_id = c.id and m.auth_user_id = auth.uid()
        )
      )
    )
  );

create policy "documents_insert" on public.documents for insert
  with check (auth.uid() is not null);

-- Service role bypass for workers (cartographer, reader, etc.)
-- Workers use SUPABASE_SERVICE_KEY which bypasses RLS automatically.

-- ─── Realtime ───────────────────────────────────────────────
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.documents;
alter publication supabase_realtime add table public.events;

-- ─── Seed default channels ─────────────────────────────────
insert into public.channels (slug, name, description) values
  ('general', 'General', 'Main community discussion'),
  ('show-and-tell', 'Show & Tell', 'Share what you''re building'),
  ('agents', 'Agents', 'Agent development discussion'),
  ('research', 'Research', 'Papers, findings, and techniques'),
  ('feed-research', 'Feed: Research', 'Auto-populated from research feeds'),
  ('feed-tools', 'Feed: Tools', 'Auto-populated from tools/library feeds'),
  ('feed-news', 'Feed: News', 'Auto-populated from HN, blogs, etc.')
on conflict (slug) do nothing;

-- ─── Storage bucket for docs ────────────────────────────────
insert into storage.buckets (id, name, public)
values ('docs', 'docs', true)
on conflict (id) do nothing;

-- Storage policy: authenticated users can upload
create policy "docs_upload" on storage.objects for insert
  with check (bucket_id = 'docs' and auth.uid() is not null);

create policy "docs_read" on storage.objects for select
  using (bucket_id = 'docs');
