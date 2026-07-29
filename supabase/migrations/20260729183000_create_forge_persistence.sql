create extension if not exists "pgcrypto";

create table if not exists public.forge_missions (
  id uuid primary key default gen_random_uuid(),
  agent_key text not null default 'cody',
  title text not null,
  project_key text,
  description text,
  objective text,
  scope text,
  expected_result text,
  priority text not null default 'normal',
  status text not null default 'draft',
  progress integer,
  git_branch text,
  preview_url text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deployed_at timestamptz,
  validated_at timestamptz,
  constraint forge_missions_status_check check (
    status in (
      'draft', 'ready', 'in_progress', 'deployed', 'to_review',
      'changes_requested', 'validated', 'blocked'
    )
  ),
  constraint forge_missions_priority_check check (
    priority in ('low', 'normal', 'high', 'urgent')
  ),
  constraint forge_missions_progress_check check (
    progress is null or progress between 0 and 100
  ),
  constraint forge_missions_agent_key_not_blank check (
    length(trim(agent_key)) > 0
  )
);

create table if not exists public.forge_activity_logs (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.forge_missions(id) on delete cascade,
  event_type text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint forge_activity_logs_event_type_check check (
    event_type in (
      'mission_received', 'analysis', 'development', 'test', 'error',
      'correction', 'build', 'deployment', 'blocked', 'completed',
      'user_validation'
    )
  )
);

create table if not exists public.forge_validation_items (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.forge_missions(id) on delete cascade,
  label text not null,
  position integer not null default 0,
  checked boolean not null default false,
  result text,
  note text,
  checked_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint forge_validation_items_result_check check (
    result is null or result in ('compliant', 'issue', 'not_applicable')
  ),
  constraint forge_validation_items_position_check check (position >= 0)
);

create table if not exists public.forge_corrections (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.forge_missions(id) on delete cascade,
  content text not null,
  status text not null default 'open',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint forge_corrections_status_check check (status in ('open', 'resolved')),
  constraint forge_corrections_content_not_blank check (length(trim(content)) > 0)
);

create index if not exists forge_missions_agent_key_idx
  on public.forge_missions(agent_key);
create index if not exists forge_missions_status_idx
  on public.forge_missions(status);
create index if not exists forge_missions_created_at_idx
  on public.forge_missions(created_at desc);
create index if not exists forge_activity_logs_mission_created_idx
  on public.forge_activity_logs(mission_id, created_at desc);
create index if not exists forge_validation_items_mission_position_idx
  on public.forge_validation_items(mission_id, position);
create index if not exists forge_corrections_mission_created_idx
  on public.forge_corrections(mission_id, created_at desc);
create index if not exists forge_corrections_status_idx
  on public.forge_corrections(status);

create or replace function public.set_forge_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists forge_missions_set_updated_at on public.forge_missions;
create trigger forge_missions_set_updated_at
before update on public.forge_missions
for each row execute function public.set_forge_updated_at();

drop trigger if exists forge_validation_items_set_updated_at on public.forge_validation_items;
create trigger forge_validation_items_set_updated_at
before update on public.forge_validation_items
for each row execute function public.set_forge_updated_at();

alter table public.forge_missions enable row level security;
alter table public.forge_activity_logs enable row level security;
alter table public.forge_validation_items enable row level security;
alter table public.forge_corrections enable row level security;

revoke all on table public.forge_missions from anon;
revoke all on table public.forge_activity_logs from anon;
revoke all on table public.forge_validation_items from anon;
revoke all on table public.forge_corrections from anon;

grant select, insert, update, delete on table public.forge_missions to authenticated;
grant select, insert, update, delete on table public.forge_activity_logs to authenticated;
grant select, insert, update, delete on table public.forge_validation_items to authenticated;
grant select, insert, update, delete on table public.forge_corrections to authenticated;

drop policy if exists "Studio staff can manage Forge missions" on public.forge_missions;
create policy "Studio staff can manage Forge missions"
on public.forge_missions
for all
to authenticated
using (
  exists (
    select 1
    from public.agent_profiles ap
    where ap.is_active = true
      and ap.role in ('agent', 'admin')
      and (
        ap.user_id = (select auth.uid())
        or lower(ap.email) = lower((select auth.jwt()) ->> 'email')
      )
  )
)
with check (
  exists (
    select 1
    from public.agent_profiles ap
    where ap.is_active = true
      and ap.role in ('agent', 'admin')
      and (
        ap.user_id = (select auth.uid())
        or lower(ap.email) = lower((select auth.jwt()) ->> 'email')
      )
  )
);

drop policy if exists "Studio staff can manage Forge activity logs" on public.forge_activity_logs;
create policy "Studio staff can manage Forge activity logs"
on public.forge_activity_logs
for all
to authenticated
using (
  exists (
    select 1
    from public.agent_profiles ap
    where ap.is_active = true
      and ap.role in ('agent', 'admin')
      and (
        ap.user_id = (select auth.uid())
        or lower(ap.email) = lower((select auth.jwt()) ->> 'email')
      )
  )
)
with check (
  exists (
    select 1
    from public.agent_profiles ap
    where ap.is_active = true
      and ap.role in ('agent', 'admin')
      and (
        ap.user_id = (select auth.uid())
        or lower(ap.email) = lower((select auth.jwt()) ->> 'email')
      )
  )
);

drop policy if exists "Studio staff can manage Forge validation items" on public.forge_validation_items;
create policy "Studio staff can manage Forge validation items"
on public.forge_validation_items
for all
to authenticated
using (
  exists (
    select 1
    from public.agent_profiles ap
    where ap.is_active = true
      and ap.role in ('agent', 'admin')
      and (
        ap.user_id = (select auth.uid())
        or lower(ap.email) = lower((select auth.jwt()) ->> 'email')
      )
  )
)
with check (
  exists (
    select 1
    from public.agent_profiles ap
    where ap.is_active = true
      and ap.role in ('agent', 'admin')
      and (
        ap.user_id = (select auth.uid())
        or lower(ap.email) = lower((select auth.jwt()) ->> 'email')
      )
  )
);

drop policy if exists "Studio staff can manage Forge corrections" on public.forge_corrections;
create policy "Studio staff can manage Forge corrections"
on public.forge_corrections
for all
to authenticated
using (
  exists (
    select 1
    from public.agent_profiles ap
    where ap.is_active = true
      and ap.role in ('agent', 'admin')
      and (
        ap.user_id = (select auth.uid())
        or lower(ap.email) = lower((select auth.jwt()) ->> 'email')
      )
  )
)
with check (
  exists (
    select 1
    from public.agent_profiles ap
    where ap.is_active = true
      and ap.role in ('agent', 'admin')
      and (
        ap.user_id = (select auth.uid())
        or lower(ap.email) = lower((select auth.jwt()) ->> 'email')
      )
  )
);

create or replace function public.forge_add_correction(
  p_mission_id uuid,
  p_content text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  correction_id uuid;
begin
  if length(trim(p_content)) = 0 then
    raise exception 'Correction content cannot be empty';
  end if;

  insert into public.forge_corrections(mission_id, content, created_by)
  values (p_mission_id, trim(p_content), (select auth.uid()))
  returning id into correction_id;

  update public.forge_missions
  set status = 'changes_requested'
  where id = p_mission_id;

  if not found then
    raise exception 'Mission not found or inaccessible';
  end if;

  insert into public.forge_activity_logs(mission_id, event_type, message, metadata)
  values (
    p_mission_id,
    'correction',
    'Correction demandée : ' || trim(p_content),
    jsonb_build_object('correction_id', correction_id, 'status', 'changes_requested')
  );

  return correction_id;
end;
$$;

create or replace function public.forge_validate_mission(p_mission_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.forge_missions
  set status = 'validated',
      progress = 100,
      validated_at = now()
  where id = p_mission_id;

  if not found then
    raise exception 'Mission not found or inaccessible';
  end if;

  insert into public.forge_activity_logs(mission_id, event_type, message, metadata)
  values (
    p_mission_id,
    'user_validation',
    'Mission validée par l’utilisateur',
    jsonb_build_object('status', 'validated')
  );
end;
$$;

revoke all on function public.forge_add_correction(uuid, text) from public, anon;
revoke all on function public.forge_validate_mission(uuid) from public, anon;
grant execute on function public.forge_add_correction(uuid, text) to authenticated;
grant execute on function public.forge_validate_mission(uuid) to authenticated;

-- Données de démonstration Forge V1. Les UUID fixes rendent ce seed idempotent.
insert into public.forge_missions (
  id, agent_key, title, project_key, description, objective, scope,
  expected_result, priority, status, progress, git_branch, preview_url, created_at
)
values
(
  '10000000-0000-4000-8000-000000000001', 'cody',
  'Créer la vue hebdomadaire', 'Selen Studio · Planning',
  'Rassembler les rendez-vous et échéances dans une vue claire.',
  'Donner à Lil une lecture immédiate de la semaine et des actions à venir.',
  '["Vue des sept prochains jours","Cartes rendez-vous et échéances","Adaptation mobile et desktop"]',
  'La vue est construite, le build est valide et une vérification utilisateur est attendue.',
  'high', 'to_review', 100, 'feature/weekly-planning',
  'https://example.com/preview/weekly-planning', '2026-07-27T09:20:00+02:00'
),
(
  '10000000-0000-4000-8000-000000000002', 'cody',
  'Installer l’espace de Cody', 'Selen Studio · La Forge',
  'Créer le centre de suivi manuel des missions du premier agent.',
  'Poser les fondations visuelles et fonctionnelles de La Forge.',
  '["Accueil de La Forge","Espace Cody","Suivi persistant des validations"]',
  'La Forge est disponible avec une persistance Supabase.',
  'urgent', 'in_progress', 68, 'feature/forge-cody-supabase',
  null, '2026-07-29T10:00:00+02:00'
),
(
  '10000000-0000-4000-8000-000000000003', 'cody',
  'Affiner la fiche client', 'Selen Studio · Clients',
  'Clarifier les informations et actions principales d’un client.',
  'Rendre la fiche client plus rapide à parcourir.',
  '["Hiérarchie des informations","Actions principales"]',
  'Mission vérifiée et validée par Lil.',
  'normal', 'validated', 100, null, null, '2026-07-22T08:30:00+02:00'
)
on conflict (id) do nothing;

insert into public.forge_validation_items (
  id, mission_id, label, position, checked, result, checked_at
)
select
  (
    substr(md5(mission.id::text || ':' || item.position::text), 1, 8) || '-' ||
    substr(md5(mission.id::text || ':' || item.position::text), 9, 4) || '-4' ||
    substr(md5(mission.id::text || ':' || item.position::text), 14, 3) || '-8' ||
    substr(md5(mission.id::text || ':' || item.position::text), 18, 3) || '-' ||
    substr(md5(mission.id::text || ':' || item.position::text), 21, 12)
  )::uuid,
  mission.id,
  item.label,
  item.position,
  item.position <= mission.checked_count,
  case when item.position <= mission.checked_count then 'compliant' else null end,
  case when item.position <= mission.checked_count then mission.checked_at else null end
from (
  values
    ('10000000-0000-4000-8000-000000000001'::uuid, 4, '2026-07-28T16:45:00+02:00'::timestamptz),
    ('10000000-0000-4000-8000-000000000002'::uuid, 2, '2026-07-29T14:10:00+02:00'::timestamptz),
    ('10000000-0000-4000-8000-000000000003'::uuid, 9, '2026-07-24T15:30:00+02:00'::timestamptz)
) as mission(id, checked_count, checked_at)
cross join (
  values
    (1, 'La page s’ouvre correctement'),
    (2, 'L’affichage mobile est correct'),
    (3, 'L’affichage desktop est correct'),
    (4, 'La création fonctionne'),
    (5, 'La modification fonctionne'),
    (6, 'La suppression fonctionne'),
    (7, 'Le style correspond à Selen'),
    (8, 'Le fonctionnement respecte le cahier des charges'),
    (9, 'Aucun parcours existant ne semble cassé')
) as item(position, label)
on conflict (id) do nothing;

insert into public.forge_activity_logs (
  id, mission_id, event_type, message, metadata, created_at
)
values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'mission_received', 'Mission lancée : création de la vue hebdomadaire', '{}', '2026-07-27T09:20:00+02:00'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'analysis', 'Analyse de la structure existante terminée', '{}', '2026-07-27T10:05:00+02:00'),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'development', 'Composants principaux créés', '{}', '2026-07-27T14:30:00+02:00'),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'build', 'Build terminé avec succès', '{}', '2026-07-28T11:10:00+02:00'),
  ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', 'test', 'En attente de vérification utilisateur', '{"status":"to_review"}', '2026-07-28T11:30:00+02:00'),
  ('20000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000002', 'mission_received', 'Mission reçue et cadrée', '{}', '2026-07-29T10:00:00+02:00'),
  ('20000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000002', 'analysis', 'Conventions Supabase de Selen Studio analysées', '{}', '2026-07-29T11:15:00+02:00'),
  ('20000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000002', 'development', 'Connexion de La Forge à Supabase', '{}', '2026-07-29T14:10:00+02:00'),
  ('20000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000003', 'completed', 'Mission terminée et validée', '{"status":"validated"}', '2026-07-24T15:30:00+02:00')
on conflict (id) do nothing;
