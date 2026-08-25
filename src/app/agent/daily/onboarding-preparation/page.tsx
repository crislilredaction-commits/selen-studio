import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function docState(url?: string | null, pending?: boolean | null) {
  if (url) return "reçu";
  if (pending) return "annoncé plus tard";
  return "manquant";
}

export default async function DailyOnboardingPreparationPage() {
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={{ padding: 28 }}>Accès refusé.</main>;

  const admin = createSupabaseAdminClient();
  const { data: onboardingRows, error } = await admin
    .from("daily_onboarding")
    .select("id,user_id,status,current_step,setup_choice,video_requested_at,organisation_name,siret,nda_number,address,manager_first_name,manager_last_name,platform_contact_first_name,platform_contact_last_name,platform_contact_email,organisation_logo_url,insee_document_url,insee_document_pending,nda_or_bpf_document_url,nda_or_bpf_document_pending,qualiopi_certificate_url,qualiopi_certificate_pending,welcome_booklet_url,welcome_booklet_pending,updated_at,created_at")
    .eq("setup_choice", "video")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);

  const userIds = (onboardingRows ?? []).map((row) => row.user_id).filter(Boolean);
  const { data: memberships, error: membershipError } = userIds.length
    ? await admin
        .from("organisation_memberships")
        .select("user_id,organisation_id,status,organisations(id,name,legal_name,company_name,siret,nda_number,address,administrative_address)")
        .in("user_id", userIds)
        .eq("status", "active")
    : { data: [], error: null };
  if (membershipError) throw new Error(membershipError.message);

  const membershipByUser = new Map((memberships ?? []).map((membership) => [membership.user_id, membership]));
  const organisationIds = Array.from(new Set((memberships ?? []).map((membership) => membership.organisation_id).filter(Boolean)));

  const { data: formations, error: formationError } = organisationIds.length
    ? await admin
        .from("daily_formations")
        .select("id,organisation_id,title,status,version,archived_at")
        .in("organisation_id", organisationIds)
        .neq("status", "archived")
        .order("updated_at", { ascending: false })
    : { data: [], error: null };
  if (formationError) throw new Error(formationError.message);

  const { data: trainers, error: trainerError } = organisationIds.length
    ? await admin
        .from("daily_trainer_profiles")
        .select("id,organisation_id,display_name,status")
        .in("organisation_id", organisationIds)
        .neq("status", "archived")
        .order("display_name", { ascending: true })
    : { data: [], error: null };
  if (trainerError) throw new Error(trainerError.message);

  const trainerIds = (trainers ?? []).map((trainer) => trainer.id);
  const { data: trainerDocuments, error: trainerDocumentError } = trainerIds.length
    ? await admin
        .from("daily_trainer_profile_documents")
        .select("trainer_profile_id,document_purpose,daily_documents!inner(id,is_current,status)")
        .in("trainer_profile_id", trainerIds)
        .eq("document_purpose", "cv")
    : { data: [], error: null };
  if (trainerDocumentError) throw new Error(trainerDocumentError.message);

  const formationsByOrganisation = new Map<string, typeof formations>();
  for (const formation of formations ?? []) {
    const list = formationsByOrganisation.get(formation.organisation_id) ?? [];
    list.push(formation);
    formationsByOrganisation.set(formation.organisation_id, list);
  }

  const trainersByOrganisation = new Map<string, typeof trainers>();
  for (const trainer of trainers ?? []) {
    const list = trainersByOrganisation.get(trainer.organisation_id) ?? [];
    list.push(trainer);
    trainersByOrganisation.set(trainer.organisation_id, list);
  }

  const trainersWithCurrentCv = new Set<string>();
  for (const link of trainerDocuments ?? []) {
    const relation = link.daily_documents;
    const documents = Array.isArray(relation) ? relation : relation ? [relation] : [];
    if (documents.some((document) => document.is_current && document.status === "active")) {
      trainersWithCurrentCv.add(link.trainer_profile_id);
    }
  }

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: 28 }}>
      <p style={{ fontSize: 12, fontWeight: 700 }}>SELEN DAILY</p>
      <h1 style={{ marginBottom: 4 }}>Préparation des mises en place accompagnées</h1>
      <p style={{ marginTop: 0, maxWidth: 840, color: "var(--selen-text2)", lineHeight: 1.55 }}>
        File Studio des clients qui ont choisi un accompagnement. L’objectif est de préremplir au maximum l’organisme, ses programmes et ses formateurs avant le rendez-vous, sans faire ressaisir au client ce que Selen peut déjà retrouver.
      </p>

      <SelenCard style={{ margin: "18px 0" }}>
        <SelenCardTitle>Garde-fou rendez-vous</SelenCardTitle>
        <p style={{ marginBottom: 0, color: "var(--selen-text2)", lineHeight: 1.5 }}>
          Le rendez-vous doit rester impossible avant réception des éléments nécessaires puis expiration d’un délai minimum de 24 h. Le schéma actuel ne conserve pas encore une date fiable de transmission complète : cette vue indique donc la préparation réelle sans calculer artificiellement une éligibilité.
        </p>
      </SelenCard>

      <div style={{ display: "grid", gap: 12 }}>
        {(onboardingRows ?? []).length === 0 ? (
          <SelenCard>
            <SelenCardTitle>Aucune mise en place accompagnée en attente</SelenCardTitle>
            <p style={{ marginBottom: 0, color: "var(--selen-text2)" }}>Les demandes apparaîtront ici dès qu’un client choisira l’accompagnement.</p>
          </SelenCard>
        ) : (onboardingRows ?? []).map((row) => {
          const membership = membershipByUser.get(row.user_id);
          const organisationId = membership?.organisation_id;
          const relation = membership?.organisations;
          const organisation = Array.isArray(relation) ? relation[0] : relation;
          const name = organisation?.name || organisation?.legal_name || organisation?.company_name || row.organisation_name || "Organisme à identifier";
          const siret = organisation?.siret || row.siret;
          const nda = organisation?.nda_number || row.nda_number;
          const address = organisation?.administrative_address || organisation?.address || row.address;
          const contact = [row.platform_contact_first_name, row.platform_contact_last_name].filter(Boolean).join(" ")
            || [row.manager_first_name, row.manager_last_name].filter(Boolean).join(" ")
            || "Contact à confirmer";

          const organisationFormations = organisationId ? formationsByOrganisation.get(organisationId) ?? [] : [];
          const organisationTrainers = organisationId ? trainersByOrganisation.get(organisationId) ?? [] : [];
          const trainersWithCv = organisationTrainers.filter((trainer) => trainersWithCurrentCv.has(trainer.id));
          const missingTrainerCv = organisationTrainers.filter((trainer) => !trainersWithCurrentCv.has(trainer.id));

          const requiredItems = [
            { label: "Avis INSEE", state: docState(row.insee_document_url, row.insee_document_pending), ready: Boolean(row.insee_document_url), url: row.insee_document_url },
            {
              label: "Programme(s) de formation",
              state: organisationFormations.length > 0
                ? `${organisationFormations.length} programme${organisationFormations.length > 1 ? "s" : ""} enregistré${organisationFormations.length > 1 ? "s" : ""}`
                : "aucun programme enregistré",
              ready: organisationFormations.length > 0,
              url: null,
            },
            {
              label: "CV du ou des formateurs",
              state: organisationTrainers.length === 0
                ? "aucun formateur / CV enregistré"
                : missingTrainerCv.length === 0
                  ? `${trainersWithCv.length}/${organisationTrainers.length} CV reçu${organisationTrainers.length > 1 ? "s" : ""}`
                  : `${trainersWithCv.length}/${organisationTrainers.length} CV reçu${trainersWithCv.length > 1 ? "s" : ""} · ${missingTrainerCv.length} manquant${missingTrainerCv.length > 1 ? "s" : ""}`,
              ready: organisationTrainers.length > 0 && missingTrainerCv.length === 0,
              url: null,
            },
          ];
          const readyRequired = requiredItems.filter((item) => item.ready).length;

          const optionalItems = [
            { label: "NDA ou dernier BPF", url: row.nda_or_bpf_document_url, state: row.nda_or_bpf_document_url ? "reçu" : "facultatif si non disponible" },
            { label: "Logo", url: row.organisation_logo_url, state: row.organisation_logo_url ? "reçu" : "facultatif / absent" },
          ];
          const legacyExtras = [
            { label: "Certificat Qualiopi", url: row.qualiopi_certificate_url },
            { label: "Livret d’accueil", url: row.welcome_booklet_url },
          ].filter((item) => item.url);

          return (
            <SelenCard key={row.id}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
                <div>
                  <SelenCardTitle>{name}</SelenCardTitle>
                  <div style={{ fontSize: 12, color: "var(--selen-text2)" }}>
                    Étape {row.current_step ?? 1} · demande d’accompagnement {formatDate(row.video_requested_at)} · dernière mise à jour {formatDate(row.updated_at)}
                  </div>
                </div>
                <span style={{ padding: "6px 9px", borderRadius: 999, background: readyRequired === requiredItems.length ? "rgba(60,140,90,.12)" : "rgba(180,140,60,.12)", fontSize: 12, fontWeight: 700 }}>
                  {readyRequired}/{requiredItems.length} éléments indispensables prêts
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 10, marginTop: 14, fontSize: 13 }}>
                <Info label="SIRET" value={siret || "À compléter"} />
                <Info label="NDA" value={nda || "À compléter si applicable"} />
                <Info label="Adresse" value={address || "À compléter"} />
                <Info label="Contact" value={contact} />
                <Info label="Email" value={row.platform_contact_email || "À compléter"} />
                <Info label="Rendez-vous" value="Pas d’éligibilité automatique tant que la date de transmission complète n’est pas tracée" />
              </div>

              <section style={{ marginTop: 16 }}>
                <strong style={{ fontSize: 13 }}>Éléments indispensables à la préparation</strong>
                <div style={{ marginTop: 6, display: "grid", gap: 6 }}>
                  {requiredItems.map((item) => (
                    <PreparationRow key={item.label} label={item.label} state={item.state} url={item.url} ready={item.ready} />
                  ))}
                </div>
              </section>

              <section style={{ marginTop: 16 }}>
                <strong style={{ fontSize: 13 }}>Éléments facultatifs selon la situation</strong>
                <div style={{ marginTop: 6, display: "grid", gap: 6 }}>
                  {optionalItems.map((item) => (
                    <PreparationRow key={item.label} label={item.label} state={item.state} url={item.url} ready={Boolean(item.url)} />
                  ))}
                </div>
              </section>

              {organisationFormations.length > 0 ? (
                <section style={{ marginTop: 16 }}>
                  <strong style={{ fontSize: 13 }}>Programmes déjà exploitables</strong>
                  <div style={{ marginTop: 6, color: "var(--selen-text2)", fontSize: 13, lineHeight: 1.55 }}>
                    {organisationFormations.map((formation) => (
                      <div key={formation.id}>{formation.title} · version {formation.version} · {formation.status}</div>
                    ))}
                  </div>
                </section>
              ) : null}

              {organisationTrainers.length > 0 ? (
                <section style={{ marginTop: 16 }}>
                  <strong style={{ fontSize: 13 }}>Formateurs à préparer</strong>
                  <div style={{ marginTop: 6, color: "var(--selen-text2)", fontSize: 13, lineHeight: 1.55 }}>
                    {organisationTrainers.map((trainer) => (
                      <div key={trainer.id}>{trainer.display_name} · CV {trainersWithCurrentCv.has(trainer.id) ? "reçu" : "manquant"}</div>
                    ))}
                  </div>
                </section>
              ) : null}

              {legacyExtras.length > 0 ? (
                <section style={{ marginTop: 16 }}>
                  <strong style={{ fontSize: 13 }}>Autres pièces déjà présentes</strong>
                  <div style={{ marginTop: 6, display: "grid", gap: 6 }}>
                    {legacyExtras.map((item) => (
                      <PreparationRow key={item.label} label={item.label} state="déjà reçu" url={item.url} ready />
                    ))}
                  </div>
                </section>
              ) : null}
            </SelenCard>
          );
        })}
      </div>
    </main>
  );
}

function PreparationRow({ label, state, url, ready }: { label: string; state: string; url?: string | null; ready: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "7px 0", borderTop: "1px solid var(--selen-border)", fontSize: 13 }}>
      <strong>{label}</strong>
      <span style={{ color: ready ? "var(--selen-text)" : "var(--selen-text2)" }}>
        {url ? <a href={url} target="_blank" rel="noreferrer">Ouvrir</a> : null}
        {url ? " · " : ""}{state}
      </span>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><strong>{label}</strong><div style={{ marginTop: 3, color: "var(--selen-text2)", lineHeight: 1.4 }}>{value}</div></div>;
}
