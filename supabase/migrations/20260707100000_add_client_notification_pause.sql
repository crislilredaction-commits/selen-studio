alter table public.organisations
  add column if not exists client_notifications_paused boolean not null default false;

create index if not exists organisations_client_notifications_paused_idx
  on public.organisations (client_notifications_paused);
