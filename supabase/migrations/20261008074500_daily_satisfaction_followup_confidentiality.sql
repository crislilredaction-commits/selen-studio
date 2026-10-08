update public.daily_session_followup_entries
set
  summary = 'Satisfaction apprenant — retour confidentiel',
  description = 'Consulter la réponse canonique dans l''écran Satisfaction réservé aux personnes autorisées.',
  status = 'resolved',
  action_taken = coalesce(action_taken, 'Verbatim conservé uniquement dans la réponse de satisfaction canonique.'),
  resolved_at = coalesce(resolved_at, now()),
  updated_at = now()
where author_role = 'Apprenant'
  and summary like 'Satisfaction apprenant — %';
