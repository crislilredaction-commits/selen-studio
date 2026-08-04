-- Droits minimaux pour que les triggers security-invoker matérialisent
-- et résolvent les alertes lors d'une action Studio administratrice.

grant insert on table public.forge_alerts to authenticated;

create policy "Studio admins can create Forge alerts"
on public.forge_alerts for insert to authenticated
with check (public.forge_current_access_level() = 'admin');

grant execute on function public.forge_emit_alert(
  text, text, text, text, text, text, uuid, text,
  uuid, uuid, uuid, jsonb, boolean
) to authenticated;
grant execute on function public.forge_resolve_source_alerts(text)
  to authenticated;

