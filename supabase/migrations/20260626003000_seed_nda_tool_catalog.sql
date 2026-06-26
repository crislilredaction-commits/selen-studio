insert into public.selen_tools_catalog (
  id,
  slug,
  name,
  description,
  is_active,
  display_order,
  created_at
)
values (
  gen_random_uuid(),
  'nda',
  'NDA',
  'Accompagnement Numéro de Déclaration d’Activité',
  true,
  30,
  now()
)
on conflict (slug) do update
set
  name = excluded.name,
  description = excluded.description,
  is_active = true,
  display_order = coalesce(public.selen_tools_catalog.display_order, excluded.display_order);
