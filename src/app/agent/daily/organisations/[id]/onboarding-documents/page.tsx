import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { isDailyOrganisationInAgentScope } from "@/lib/server/dailyOrganisationScope";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";

type PageProps = { params: Promise<{ id: string }> };

type Piece = { key: string; label: string; url: string | null; pending: boolean };

function storageObjectPath(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    const marker = "/storage/v1/object/";
    const index = url.pathname.indexOf(marker);
    if (index < 0) return null;
    const tail = url.pathname.slice(index + marker.length).replace(/^public\//, "").replace(/^sign\//, "");
    const [bucket, ...parts] = tail.split("/");
    if (bucket !== "documents" || parts.length === 0) return null;
    return decodeURIComponent(parts.join("/"));
  } catch { return null; }
}

async function signedDocumentUrl(admin: ReturnType<typeof createSupabaseAdminClient>, value: unknown) {
  const path = storageObjectPath(value);
  if (!path) return null;
  const { data, error } = await admin.storage.from("documents").createSignedUrl(path, 300);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export default async function OnboardingDocumentsPage({ params }: PageProps) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={{ padding: 28 }}><p>{auth.error}</p></main>;
  const { id } = await params;
  if (!(await isDailyOrganisationInAgentScope(auth.email, id))) {
    return <main style={{ padding: 28 }}><p>Organisme hors de votre périmètre Daily.</p></main>;
  }

  const admin = createSupabaseAdminClient();
  const { data: organisation, error: organisationError } = await admin
    .from("organisations")
    .select("id,name,email")
    .eq("id", id)
    .maybeSingle();
  if (organisationError || !organisation) return <main style={{ padding: 28 }}><p>Organisme introuvable.</p></main>;

  const { data: onboarding, error } = await admin
    .from("daily_onboarding")
    .select("organisation_name,insee_document_url,insee_document_pending,qualiopi_certificate_url,qualiopi_certificate_pending,nda_or_bpf_document_url,nda_or_bpf_document_pending")
    .eq("organisation_name", organisation.name)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return <main style={{ padding: 28 }}><p>Chargement des pièces impossible.</p></main>;

  const pieces: Piece[] = onboarding ? [
    { key: "insee", label: "Avis de situation INSEE / justificatif d’immatriculation", url: await signedDocumentUrl(admin, onboarding.insee_document_url), pending: Boolean(onboarding.insee_document_pending) },
    { key: "qualiopi", label: "Certificat Qualiopi", url: await signedDocumentUrl(admin, onboarding.qualiopi_certificate_url), pending: Boolean(onboarding.qualiopi_certificate_pending) },
    { key: "nda_bpf", label: "NDA / BPF", url: await signedDocumentUrl(admin, onboarding.nda_or_bpf_document_url), pending: Boolean(onboarding.nda_or_bpf_document_pending) },
  ] : [];

  return <main style={{ maxWidth: 1000, margin: "0 auto", padding: 28 }}>
    <p style={{ fontSize: 12, fontWeight: 700, color: "var(--selen-text2)" }}>SELEN DAILY · PIÈCES CLIENT</p>
    <h1>Pièces permanentes · {organisation.name}</h1>
    <p style={{ color: "var(--selen-text2)", maxWidth: 760, lineHeight: 1.6 }}>Consultez ici les pièces réellement déposées lors du paramétrage Daily avant toute décision métier. Studio ouvre la pièce d’origine via un accès temporaire sécurisé : aucune copie documentaire parallèle n’est créée.</p>
    <section style={{ display: "grid", gap: 12, marginTop: 20 }}>
      {pieces.length === 0 ? <SelenCard><SelenCardTitle>Aucun paramétrage Daily trouvé</SelenCardTitle></SelenCard> : pieces.map((piece) => <SelenCard key={piece.key}>
        <SelenCardTitle>{piece.label}</SelenCardTitle>
        <p style={{ margin: "8px 0 12px", color: "var(--selen-text2)", fontSize: 13 }}>{piece.url ? "Pièce déposée" : piece.pending ? "Pièce annoncée comme à fournir" : "Aucune pièce déposée"}</p>
        {piece.url ? <a href={piece.url} target="_blank" rel="noreferrer noopener" style={{ fontWeight: 700 }}>Ouvrir la pièce dans Studio</a> : null}
      </SelenCard>)}
    </section>
  </main>;
}
