alter table public.lil_invoice_settings
  add column if not exists legal_form text,
  add column if not exists postal_code text,
  add column if not exists city text,
  add column if not exists legal_mentions text;

update public.lil_invoice_settings
set
  business_name = coalesce(nullif(business_name, ''), 'Pascale Barthaux'),
  legal_form = coalesce(nullif(legal_form, ''), 'Entreprise Individuelle (EI)'),
  address = coalesce(nullif(address, ''), '2 Voie de Troyes'),
  postal_code = coalesce(nullif(postal_code, ''), '10700'),
  city = coalesce(nullif(city, ''), 'Torcy-le-Petit'),
  siren_siret = coalesce(nullif(siren_siret, ''), '81772377800038'),
  iban = coalesce(nullif(iban, ''), 'FR76 4061 8805 1100 0405 1327 975'),
  vat_status = coalesce(nullif(vat_status, ''), 'TVA non applicable, art. 293 B du CGI.'),
  payment_terms = coalesce(nullif(payment_terms, ''), 'Paiement a reception de facture'),
  late_penalty_rate = coalesce(nullif(late_penalty_rate, ''), 'Taux legal en vigueur'),
  recovery_fee_cents = coalesce(recovery_fee_cents, 4000),
  legal_mentions = coalesce(
    nullif(legal_mentions, ''),
    'Dispense d''immatriculation au Registre du Commerce et des Societes (RCS) ainsi qu''au Registre National des Entreprises (RNE), conformement a l''article L.123-1-1 du Code de commerce.'
  )
where id = true;

alter table public.lil_billing_profiles
  add column if not exists legal_form text,
  add column if not exists postal_code text,
  add column if not exists city text,
  add column if not exists vat_number text;

create index if not exists lil_billing_profiles_siren_siret_idx
  on public.lil_billing_profiles (siren_siret);
