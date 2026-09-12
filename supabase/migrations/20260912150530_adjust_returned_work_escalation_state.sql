drop index if exists public.daily_work_escalations_active_task_key_uq;
create unique index daily_work_escalations_active_task_key_uq on public.daily_work_escalations(task_key) where target_type='task' and status in ('open','in_progress');
drop index if exists public.daily_work_escalations_active_dossier_uq;
create unique index daily_work_escalations_active_dossier_uq on public.daily_work_escalations(session_id) where target_type='dossier' and status in ('open','in_progress');
