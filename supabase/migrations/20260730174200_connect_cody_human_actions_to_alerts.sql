-- Relie chaque attente humaine d'une mission Cody au centre d'alertes Forge.

create or replace function public.forge_sync_mission_alerts()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target text := '/agent/forge/cody?mission=' || new.id::text;
  current_plan_id uuid;
  blocking_count integer := 0;
begin
  if new.status = 'needs_clarification'
    and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    select p.id, jsonb_array_length(p.blocking_questions)
    into current_plan_id, blocking_count
    from public.forge_mission_plans p
    where p.mission_id = new.id and p.is_current = true
    order by p.version desc
    limit 1;

    perform public.forge_emit_alert(
      'human_decision_required',
      'important',
      'J’ai besoin de tes précisions',
      case
        when blocking_count = 1
          then 'Lil, une précision me manque pour continuer cette mission. Ouvre-la pour répondre à la question bloquante.'
        else 'Lil, plusieurs précisions me manquent pour continuer cette mission. Ouvre-la pour répondre aux questions bloquantes.'
      end,
      'action_required',
      'mission-clarification:' || new.id::text,
      new.id,
      target,
      p_plan_id => current_plan_id,
      p_technical_details => jsonb_build_object(
        'mission_status', new.status,
        'blocking_question_count', blocking_count
      )
    );
  elsif tg_op = 'UPDATE'
    and old.status = 'needs_clarification'
    and new.status <> 'needs_clarification' then
    perform public.forge_resolve_source_alerts(
      'mission-clarification:' || new.id::text
    );
  end if;

  if new.status = 'blocked'
    and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform public.forge_emit_alert(
      'mission_blocked', 'important', 'J’ai mis cette mission en pause',
      'Lil, je me suis arrêté pour protéger la mission. Ouvre-la pour voir ce qui me bloque et l’action dont j’ai besoin.',
      'action_required', 'mission-blocked:' || new.id::text, new.id, target,
      p_technical_details => jsonb_build_object('mission_status', new.status),
      p_external_channel_eligible => true
    );
  elsif tg_op = 'UPDATE' and old.status = 'blocked' and new.status <> 'blocked' then
    perform public.forge_resolve_source_alerts('mission-blocked:' || new.id::text);
    update public.forge_alerts
    set status = 'resolved',
        resolved_at = coalesce(resolved_at, now()),
        updated_at = now()
    where mission_id = new.id
      and alert_type = 'mission_ready_to_resume'
      and status not in ('resolved', 'archived');
  end if;

  if new.status = 'failed'
    and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform public.forge_emit_alert(
      'mission_failed', 'critical', 'Je n’ai pas pu terminer cette mission',
      'Lil, la mission a échoué malgré les tentatives prévues. J’ai besoin que tu regardes le contexte avant que je poursuive.',
      'action_required', 'mission-failed:' || new.id::text || ':' || new.updated_at::text,
      new.id, target, p_external_channel_eligible => true
    );
  end if;

  if new.status = 'validated'
    and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform public.forge_emit_alert(
      'mission_completed', 'information', 'La mission est terminée',
      'Lil, j’ai terminé cette mission. Tu peux ouvrir son contexte pour retrouver les résultats et les vérifications.',
      'unread', 'mission-completed:' || new.id::text, new.id, target
    );
  end if;
  return new;
end;
$$;

create or replace function public.forge_sync_plan_alerts()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  validation_key text := 'plan-validation:' || new.id::text;
  clarification_key text := 'mission-clarification:' || new.mission_id::text;
  target text := '/agent/forge/cody?mission=' || new.mission_id::text;
  blocking_count integer := jsonb_array_length(new.blocking_questions);
begin
  if new.is_current and new.status = 'needs_clarification' then
    perform public.forge_emit_alert(
      'human_decision_required',
      'important',
      'J’ai besoin de tes précisions',
      case
        when blocking_count = 1
          then 'Lil, une précision me manque pour continuer cette mission. Ouvre-la pour répondre à la question bloquante.'
        else 'Lil, plusieurs précisions me manquent pour continuer cette mission. Ouvre-la pour répondre aux questions bloquantes.'
      end,
      'action_required',
      clarification_key,
      new.mission_id,
      target,
      p_plan_id => new.id,
      p_technical_details => jsonb_build_object(
        'plan_version', new.version,
        'blocking_question_count', blocking_count
      )
    );
  elsif not exists (
    select 1
    from public.forge_mission_plans p
    where p.mission_id = new.mission_id
      and p.is_current = true
      and p.status = 'needs_clarification'
  ) then
    perform public.forge_resolve_source_alerts(clarification_key);
  end if;

  if new.is_current and new.status = 'plan_ready' then
    perform public.forge_emit_alert(
      'plan_validation_required', 'important', 'J’ai besoin de ta validation',
      'Lil, le plan de cette mission est prêt. Valide-le, demande une modification ou refuse-le avant que je continue.',
      'action_required', validation_key, new.mission_id, target,
      p_plan_id => new.id,
      p_technical_details => jsonb_build_object('plan_version', new.version),
      p_external_channel_eligible => true
    );
  else
    perform public.forge_resolve_source_alerts(validation_key);
  end if;
  return new;
end;
$$;

create or replace function public.forge_sync_incident_alerts()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  key text := 'incident:' || new.id::text;
  target text := '/agent/forge/cody?mission=' || new.mission_id::text;
begin
  if new.resolution_status not in ('resolved', 'ignored_with_justification')
    and (
      new.resolution_status = 'blocked'
      or new.category in ('critical_error', 'human_decision_required')
    ) then
    perform public.forge_emit_alert(
      case
        when new.category = 'critical_error' then 'critical_incident'
        when new.category = 'human_decision_required' then 'human_decision_required'
        else 'mission_blocked'
      end,
      case when new.category = 'critical_error' then 'critical' else 'important' end,
      case
        when new.category = 'critical_error' then 'J’ai détecté un risque important'
        when new.category = 'human_decision_required' then 'J’ai besoin de ta décision'
        else 'J’ai besoin de ton aide pour débloquer la mission'
      end,
      case
        when new.category = 'critical_error'
          then 'Lil, j’ai détecté un risque pour la mission et je me suis arrêté sans aller plus loin.'
        when new.category = 'human_decision_required'
          then 'Lil, j’ai besoin que tu choisisses la suite avant que je puisse continuer cette mission.'
        else 'Lil, un incident bloque cette mission. Ouvre-la pour consulter le contexte et décider de la suite.'
      end,
      'action_required', key, new.mission_id, target, new.id, new.checkpoint_id,
      p_technical_details => jsonb_build_object(
        'code', new.code,
        'category', new.category,
        'resolution_status', new.resolution_status
      ),
      p_external_channel_eligible => true
    );
  else
    perform public.forge_resolve_source_alerts(key);
    if tg_op = 'UPDATE'
      and old.resolution_status not in ('resolved', 'ignored_with_justification')
      and new.resolution_status in ('resolved', 'ignored_with_justification')
      and not exists (
        select 1 from public.forge_mission_incidents i
        where i.mission_id = new.mission_id and i.id <> new.id
          and i.resolution_status in ('detected', 'retrying', 'blocked', 'failed')
      ) then
      perform public.forge_emit_alert(
        'mission_ready_to_resume', 'attention', 'La mission peut reprendre',
        'Lil, le blocage est levé. J’ai besoin de ta décision pour reprendre la mission depuis son dernier checkpoint valide.',
        'action_required',
        'mission-ready:' || new.mission_id::text || ':' || new.id::text,
        new.mission_id, target, new.id, new.checkpoint_id
      );
    end if;
  end if;
  return new;
end;
$$;

-- Rattrapage idempotent des missions déjà en attente de précisions.
select public.forge_emit_alert(
  'human_decision_required',
  'important',
  'J’ai besoin de tes précisions',
  case
    when jsonb_array_length(p.blocking_questions) = 1
      then 'Lil, une précision me manque pour continuer cette mission. Ouvre-la pour répondre à la question bloquante.'
    else 'Lil, plusieurs précisions me manquent pour continuer cette mission. Ouvre-la pour répondre aux questions bloquantes.'
  end,
  'action_required',
  'mission-clarification:' || m.id::text,
  m.id,
  '/agent/forge/cody?mission=' || m.id::text,
  p_plan_id => p.id,
  p_technical_details => jsonb_build_object(
    'mission_status', m.status,
    'plan_version', p.version,
    'blocking_question_count', jsonb_array_length(p.blocking_questions)
  )
)
from public.forge_missions m
join public.forge_mission_plans p
  on p.mission_id = m.id and p.is_current = true
where m.agent_key = 'cody'
  and m.status = 'needs_clarification'
  and p.status = 'needs_clarification';

revoke all on function public.forge_sync_mission_alerts()
  from public, anon, authenticated;
revoke all on function public.forge_sync_plan_alerts()
  from public, anon, authenticated;
revoke all on function public.forge_sync_incident_alerts()
  from public, anon, authenticated;
