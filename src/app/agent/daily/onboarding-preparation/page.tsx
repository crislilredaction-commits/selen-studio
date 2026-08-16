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

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: 28 }}>
      <p style={{ fontSize: 12, fontWeight: 700 }}>SELEN DAILY</p>
      <h1 style={{ marginBottom: 4 }}>Préparation des mises en place accompagnées</h1>
      <p style={{ marginTop: 0, maxWidth: 820, color: "var(--selen-text2)", lineHeight: 1.55 }}>
        File Studio des clients qui ont choisi un accompagnement. Cette V1 sert à préparer le dossier avant rendez-vous : aucune réservation n’est ouverte automatiquement depuis cette page.
      </p>

      <SelenCard style={{ margin: "18px 0" }}>
        <SelenCardTitle>Garde-fou rendez-vous</SelenCardTitle>
        <p style={{ marginBottom: 0, color: "var(--selen-text2)", lineHeight: 1.5 }}>
          Le rendez-vous doit rester impossible avant réception des pièces utiles puis expiration d’un délai minimum de 24 h. Le schéma actuel ne conserve pas encore une date fiable de transmission complète : la V1 Studio affiche donc les pièces reçues sans prétendre calculer une éligibilité qui serait fausse.
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
          const relation = membership?.organisations;
          const organisation = Array.isArray(relation) ? relation[0] : relation;
          const name = organisation?.name || organisation?.legal_name || organisation?.company_name || row.organisation_name || "Organisme à identifier";
          const siret = organisation?.siret || row.siret;
          const nda = organisation?.nda_number || row.nda_number;
          const address = organisation?.administrative_address || organisation?.address || row.address;
          const contact = [row.platform_contact_first_name, row.platform_contact_last_name].filter(Boolean).join(" ")
            || [row.manager_first_name, row.manager_last_name].filter(Boolean).join(" ")
            || "Contact à confirmer";

          const docs = [
            { label: "Avis INSEE", url: row.insee_document_url, state: docState(row.insee_document_url, row.insee_document_pending) },
            { label: "NDA ou dernier BPF", url: row.nda_or_bpf_document_url, state: docState(row.nda_or_bpf_document_url, row.nda_or_bpf_document_pending) },
            { label: "Certificat Qualiopi", url: row.qualiopi_certificate_url, state: docState(row.qualiopi_certificate_url, row.qualiopi_certificate_pending) },
            { label: "Livret d’accueil", url: row.welcome_booklet_url, state: docState(row.welcome_booklet_url, row.welcome_booklet_pending) },
            { label: "Logo", url: row.organisation_logo_url, state: row.organisation_logo_url ? "reçu" : "facultatif / absent" },
          ];
          const received = docs.filter((doc) => doc.url).length;

          return (
            <SelenCard key={row.id}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
                <div>
                  <SelenCardTitle>{name}</SelenCardTitle>
                  <div style={{ fontSize: 12, color: "var(--selen-text2)" }}>
                    Étape {row.current_step ?? 1} · demande d’accompagnement {formatDate(row.video_requested_at)} · dernière mise à jour {formatDate(row.updated_at)}
                  </div>
                </div>
                <span style={{ padding: "6px 9px", borderRadius: 999, background: "rgba(180,140,60,.12)", fontSize: 12, fontWeight: 700 }}>
                  {received}/{docs.length} pièces ou éléments visibles
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 10, marginTop: 14, fontSize: 13 }}>
                <Info label="SIRET" value={siret || "À compléter"} />
                <Info label="NDA" value={nda || "À compléter / non applicable"} />
                <Info label="Adresse" value={address || "À compléter"} />
                <Info label="Contact" value={contact} />
                <Info label="Email" value={row.platform_contact_email || "À compléter"} />
                <Info label="Rendez-vous" value="Non éligible automatiquement tant que la date de transmission complète n’est pas tracée" />
              </div>

              <div style={{ marginTop: 14, display: "grid", gap: 6 }}>
                {docs.map((doc) => (
                  <div key={doc.label} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "7px 0", borderTop: "1px solid var(--selen-border)", fontSize: 13 }}>
                    <strong>{doc.label}</strong>
                    <span>
                      {doc.url ? <a href={doc.url} target="_blank" rel="noreferrer">Ouvrir</a> : null}
                      {doc.url ? " · " : ""}{doc.state}
                    </span>
                  </div>
                ))}
              </div>
            </SelenCard>
          );
        })}
      </div>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><strong>{label}</strong><div style={{ marginTop: 3, color: "var(--selen-text2)", lineHeight: 1.4 }}>{value}</div></div>;
}
