alter table public.daily_watch_entries
  add column if not exists analysis_and_improvement text;

comment on column public.daily_watch_entries.analysis_and_improvement is
  'Synthèse libre regroupant les points importants de la source et les améliorations ou pistes d action proposées par Selen.';
