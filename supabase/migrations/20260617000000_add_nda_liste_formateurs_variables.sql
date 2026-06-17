alter table public.nda_variables
  add column if not exists liste_formateurs_internes jsonb,
  add column if not exists liste_formateurs_soustraitants jsonb,
  add column if not exists liste_formateurs_dirigeant_resume text,
  add column if not exists liste_formateurs_fait_a text,
  add column if not exists liste_formateurs_date_signature text,
  add column if not exists liste_formateurs_nom_signataire text,
  add column if not exists liste_formateurs_qualite_signataire text;
