-- Daily: un dossier de session doit rester un dossier, pas dix messages.
-- Audit Live: les preuves apprenant portent explicitement formation + session + apprenant.

alter table public.daily_documents
  add column if not exists formation_id uuid references public.daily_formations(id) on delete set null,
  add column if not exists session_id uuid references public.daily_sessions(id) on delete set null,
  add column if not exists learner_id uuid references public.daily_learners(id) on delete set null,
  add column if not exists enrolment_id uuid references public.daily_session_enrolments(id) on delete set null;

create index if not exists daily_documents_formation_idx on public.daily_documents(formation_id) where formation_id is not null;
create index if not exists daily_documents_session_idx on public.daily_documents(session_id) where session_id is not null;
create index if not exists daily_documents_learner_idx on public.daily_documents(learner_id) where learner_id is not null;
create index if not exists daily_documents_evidence_triplet_idx
  on public.daily_documents(formation_id, session_id, learner_id, document_type)
  where session_id is not null and learner_id is not null;

-- Backfill des preuves déjà rattachées à une inscription.
update public.daily_documents d
set enrolment_id = e.id,
    session_id = e.session_id,
    learner_id = e.learner_id,
    formation_id = s.formation_id,
    metadata = coalesce(d.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'formation_id', s.formation_id,
        'session_id', e.session_id,
        'learner_id', e.learner_id,
        'enrolment_id', e.id
      )
from public.daily_session_enrolments e
join public.daily_sessions s on s.id = e.session_id
where d.linked_object_type = 'enrolment'
  and d.linked_object_id = e.id
  and (d.formation_id is null or d.session_id is null or d.learner_id is null or d.enrolment_id is null);

alter table public.daily_documents
  drop constraint if exists daily_documents_assessment_evidence_triplet_check;
alter table public.daily_documents
  add constraint daily_documents_assessment_evidence_triplet_check
  check (
    document_type not in ('learning_assessment_evidence', 'positioning_evidence')
    or (formation_id is not null and session_id is not null and learner_id is not null and enrolment_id is not null)
  );

-- Les items du dossier de session sont consultables dans le dossier Studio.
-- Ils ne doivent pas générer chacun un message indépendant.
drop trigger if exists daily_session_checklist_notification on public.daily_session_checklist_items;

update public.notifications
set dismissed_at = coalesce(dismissed_at, now()),
    read_at = coalesce(read_at, now())
where source_kind = 'daily_session_checklist'
  and dismissed_at is null;
