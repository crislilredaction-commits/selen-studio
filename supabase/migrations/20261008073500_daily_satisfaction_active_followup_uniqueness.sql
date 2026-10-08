create unique index if not exists daily_quality_actions_active_satisfaction_phone_unique
  on public.daily_quality_actions (source_type, source_id)
  where source_type = 'satisfaction_phone_followup'
    and source_id is not null
    and status in ('open', 'planned');

comment on index public.daily_quality_actions_active_satisfaction_phone_unique is
  'Garantit une seule relance telephonique satisfaction active par inscription, y compris lors de retries concurrents.';
