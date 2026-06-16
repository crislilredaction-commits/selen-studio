create extension if not exists "pgcrypto";

create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique not null,
  category text not null,
  excerpt text,
  content text,
  cover_url text,
  cover_alt text,
  status text not null default 'draft',
  featured boolean not null default false,
  published_at timestamptz,
  scheduled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  reading_time_minutes integer,
  seo_title text,
  seo_description text,
  constraint articles_status_check check (
    status in ('draft', 'scheduled', 'published', 'archived')
  ),
  constraint articles_slug_not_blank check (length(trim(slug)) > 0),
  constraint articles_category_not_blank check (length(trim(category)) > 0),
  constraint articles_reading_time_positive check (
    reading_time_minutes is null or reading_time_minutes > 0
  )
);

comment on table public.articles is
  'Articles administres depuis Selen Studio. Les articles publies sont destines a etre lus par Selen Vitrine ; les brouillons restent internes.';
comment on column public.articles.status is
  'Statut editorial Studio : draft, scheduled, published, archived. La Vitrine devra lire uniquement published avec published_at <= now().';
comment on column public.articles.cover_url is
  'URL de couverture V1 : image ou GIF. TODO medias : upload Supabase Storage, choix image/GIF, miniatures.';

create index if not exists articles_status_published_at_idx
  on public.articles (status, published_at desc);

create index if not exists articles_updated_at_idx
  on public.articles (updated_at desc);

create or replace function public.set_articles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_articles_updated_at on public.articles;
create trigger set_articles_updated_at
before update on public.articles
for each row execute function public.set_articles_updated_at();

alter table public.articles enable row level security;

drop policy if exists "Studio staff can read articles" on public.articles;
create policy "Studio staff can read articles"
on public.articles
for select
to authenticated
using (
  exists (
    select 1
    from public.agent_profiles ap
    where ap.is_active = true
      and (
        ap.user_id = auth.uid()
        or lower(ap.email) = lower(auth.jwt() ->> 'email')
      )
  )
);

drop policy if exists "Studio admins can insert articles" on public.articles;
create policy "Studio admins can insert articles"
on public.articles
for insert
to authenticated
with check (
  exists (
    select 1
    from public.agent_profiles ap
    where ap.is_active = true
      and ap.role = 'admin'
      and (
        ap.user_id = auth.uid()
        or lower(ap.email) = lower(auth.jwt() ->> 'email')
      )
  )
);

drop policy if exists "Studio admins can update articles" on public.articles;
create policy "Studio admins can update articles"
on public.articles
for update
to authenticated
using (
  exists (
    select 1
    from public.agent_profiles ap
    where ap.is_active = true
      and ap.role = 'admin'
      and (
        ap.user_id = auth.uid()
        or lower(ap.email) = lower(auth.jwt() ->> 'email')
      )
  )
)
with check (
  exists (
    select 1
    from public.agent_profiles ap
    where ap.is_active = true
      and ap.role = 'admin'
      and (
        ap.user_id = auth.uid()
        or lower(ap.email) = lower(auth.jwt() ->> 'email')
      )
  )
);

drop policy if exists "Public can read published articles for Vitrine" on public.articles;
create policy "Public can read published articles for Vitrine"
on public.articles
for select
to anon
using (
  status = 'published'
  and published_at is not null
  and published_at <= now()
);

-- TODO Vitrine : le depot selen-vitrine devra lire uniquement les articles publies.
-- Source cible : Supabase articles where status = 'published' and published_at <= now().
