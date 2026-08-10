-- Selen Daily Lot 2D - keep learner and adaptation writes behind controlled server APIs.
revoke all on public.daily_learners,public.daily_session_enrolments,public.daily_enrolment_support_needs from anon;
revoke insert,update,delete on public.daily_learners,public.daily_session_enrolments,public.daily_enrolment_support_needs from authenticated;
grant select on public.daily_learners,public.daily_session_enrolments,public.daily_enrolment_support_needs to authenticated;
grant all on public.daily_learners,public.daily_session_enrolments,public.daily_enrolment_support_needs to service_role;
