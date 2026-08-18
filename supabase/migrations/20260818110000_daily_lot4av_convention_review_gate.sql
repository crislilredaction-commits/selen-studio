-- Daily Lot 4AV — convention generation gate after Selen review
-- Additive business guard. No existing convention rows are modified.

create or replace function public.daily_guard_convention_after_registration_review()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_registration_status text;
  v_prerequisites text;
  v_review public.daily_registration_reviews%rowtype;
  v_signed_application_exists boolean;
begin
  select
    s.registration_status,
    f.prerequisites
  into
    v_registration_status,
    v_prerequisites
  from public.daily_sessions s
  left join public.daily_formations f on f.id = s.formation_id
  where s.id = new.session_id;

  if not found then
    raise exception 'Daily convention blocked: session not found.';
  end if;

  if coalesce(v_registration_status, '') <> 'summary_validated' then
    raise exception 'Daily convention blocked: the registration summary must be validated by Selen first.';
  end if;

  select *
  into v_review
  from public.daily_registration_reviews
  where session_id = new.session_id;

  if not found or v_review.validated_at is null then
    raise exception 'Daily convention blocked: the Selen registration review must be completed first.';
  end if;

  if coalesce(v_review.decision, '') not in ('maintained', 'adapted') then
    raise exception 'Daily convention blocked: the registration review decision must allow the training.';
  end if;

  if nullif(btrim(coalesce(v_prerequisites, '')), '') is not null
     and v_review.prerequisites_validated is distinct from true then
    raise exception 'Daily convention blocked: prerequisites must be manually validated by Selen.';
  end if;

  select exists (
    select 1
    from public.daily_registration_responses r
    where r.session_id = new.session_id
      and r.status = 'submitted'
      and r.signature_signed_at is not null
      and (
        (
          nullif(btrim(coalesce(new.recipient_email, '')), '') is not null
          and lower(btrim(r.respondent_email)) = lower(btrim(new.recipient_email))
        )
        or (
          new.recipient_type = 'company'
          and nullif(btrim(coalesce(new.company_name, '')), '') is not null
          and lower(btrim(r.company_name)) = lower(btrim(new.company_name))
        )
      )
  ) into v_signed_application_exists;

  if not v_signed_application_exists then
    raise exception 'Daily convention blocked: a signed registration file is required for this recipient.';
  end if;

  return new;
end;
$$;

comment on function public.daily_guard_convention_after_registration_review() is
  'Blocks Daily convention creation until Selen has reviewed the registration, manually checked prerequisites when applicable, and a signed application exists for the recipient.';

drop trigger if exists daily_conventions_require_registration_review on public.daily_conventions;
create trigger daily_conventions_require_registration_review
before insert on public.daily_conventions
for each row
execute function public.daily_guard_convention_after_registration_review();
