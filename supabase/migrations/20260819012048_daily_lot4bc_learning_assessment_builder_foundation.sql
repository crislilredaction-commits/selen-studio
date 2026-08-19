alter table public.daily_formations
  add column if not exists learning_assessment_mode text not null default 'external',
  add column if not exists learning_assessment_instructions text,
  add column if not exists learning_assessment_questions jsonb not null default '[]'::jsonb;

alter table public.daily_formations
  drop constraint if exists daily_formations_learning_assessment_mode_check;

alter table public.daily_formations
  add constraint daily_formations_learning_assessment_mode_check
  check (learning_assessment_mode in ('external', 'selen_quiz'));

alter table public.daily_formations
  drop constraint if exists daily_formations_learning_assessment_questions_array_check;

alter table public.daily_formations
  add constraint daily_formations_learning_assessment_questions_array_check
  check (jsonb_typeof(learning_assessment_questions) = 'array');

comment on column public.daily_formations.learning_assessment_mode is
  'V1 learning assessment delivery: external evidence or Selen-built quiz.';

comment on column public.daily_formations.learning_assessment_instructions is
  'Optional instructions shown with the Selen learning assessment.';

comment on column public.daily_formations.learning_assessment_questions is
  'Versioned-with-formation JSON array defining the Selen learning assessment questionnaire.';
