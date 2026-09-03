import Link from "next/link";
import type { CSSProperties } from "react";

import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import SelenBadge from "@/components/ui/SelenBadge";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";

type PageProps = {
  params: Promise<{ id: string }>;
};

type CurrentProof = {
  id: string;
  linked_object_id: string | null;
  logical_name: string;
  bucket: string;
  storage_path: string;
  mime_type: string | null;
};

export default async function TrainerCertificationProofsPage({ params }: PageProps) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={styles.page}><p style={styles.error}>{auth.error}</p></main>;

  const { id: organisationId } = await params;
  const admin = createSupabaseAdminClient();

  const [organisationRes, trainersRes, certificationsRes, documentsRes] = await Promise.all([
    admin.from("organisations").select("id,name,legal_name").eq("id", organisationId).maybeSingle(),
    admin.from("daily_trainer_profiles").select("id,display_name,professional_email,active,status").eq("organisation_id", organisationId).order("display_name"),
    admin.from("daily_trainer_certifications").select("id,trainer_profile_id,title,issuer,reference,obtained_on,validity_mode,valid_until,note").order("obtained_on", { ascending: false, nullsFirst: false }),
    admin.from("daily_documents").select("id,linked_object_id,logical_name,bucket,storage_path,mime_type").eq("organisation_id", organisationId).eq("linked_object_type", "trainer_certification").eq("document_type", "trainer_qualification_proof").eq("is_current", true),
  ]);

  if (organisationRes.error || !organisationRes.data) {
    return <main style={styles.page}><p style={styles.error}>Organisme introuvable.</p></main>;
  }
  if (trainersRes.error || certificationsRes.error || documentsRes.error) {
    const message = trainersRes.error?.message || certificationsRes.error?.message || documentsRes.error?.message || "Chargement impossible.";
    return <main style={styles.page}><p style={styles.error}>{message}</p></main>;
  }

  const trainers = trainersRes.data ?? [];
  const trainerIds = new Set(trainers.map((trainer) => trainer.id));
  const certifications = (certificationsRes.data ?? []).filter((certification) => trainerIds.has(certification.trainer_profile_id));
  const documents = documentsRes.data as CurrentProof[];
  const proofByCertification = new Map<string, { name: string; mimeType: string | null; url: string | null }>();

  for (const document of documents) {
    if (!document.linked_object_id) continue;
    const { data: signed } = await admin.storage.from(document.bucket).createSignedUrl(document.storage_path, 15 * 60);
    proofByCertification.set(document.linked_object_id, {
      name: document.logical_name,
      mimeType: document.mime_type,
      url: signed?.signedUrl ?? null,
    });
  }

  const organisation = organisationRes.data;

  return (
    <main style={styles.page}>
      <Link href={`/agent/daily/organisations/${organisationId}?tab=trainers`} style={styles.back}>← Formateurs de l’organisme</Link>
      <header style={styles.header}>
        <div>
          <p style={styles.eyebrow}>Daily · Consultation agent</p>
          <h1 style={styles.title}>Justificatifs de certifications formateurs</h1>
          <p style={styles.subtitle}>{organisation.legal_name || organisation.name}</p>
        </div>
        <SelenBadge variant="info">Lecture seule</SelenBadge>
      </header>

      <SelenCard>
        <p style={styles.notice}>
          Les certifications et leurs justificatifs sont gérés par les formateurs depuis leur espace Daily. Studio les consulte uniquement et ne propose aucune modification ni suppression.
        </p>
      </SelenCard>

      <div style={styles.stack}>
        {trainers.length === 0 ? <SelenCard><p style={styles.muted}>Aucun formateur enregistré.</p></SelenCard> : trainers.map((trainer) => {
          const trainerCerts = certifications.filter((certification) => certification.trainer_profile_id === trainer.id);
          return (
            <SelenCard key={trainer.id}>
              <div style={styles.row}>
                <div>
                  <SelenCardTitle>{trainer.display_name || trainer.professional_email || "Formateur"}</SelenCardTitle>
                  <p style={styles.muted}>{trainer.professional_email || "Email non renseigné"}</p>
                </div>
                <SelenBadge variant={trainer.active ? "success" : "neutral"}>{trainer.active ? "Actif" : "Inactif"}</SelenBadge>
              </div>

              {trainerCerts.length === 0 ? <p style={styles.muted}>Aucune certification renseignée.</p> : (
                <div style={styles.certList}>
                  {trainerCerts.map((certification) => {
                    const proof = proofByCertification.get(certification.id);
                    return (
                      <article key={certification.id} style={styles.certCard}>
                        <div style={styles.row}>
                          <div>
                            <strong>{certification.title}</strong>
                            <p style={styles.muted}>{[certification.issuer, certification.reference, certification.obtained_on ? `obtenue le ${certification.obtained_on}` : null].filter(Boolean).join(" · ") || "Détails non renseignés"}</p>
                          </div>
                          <SelenBadge variant={certification.validity_mode === "limited" && certification.valid_until ? "info" : "neutral"}>
                            {certification.validity_mode === "lifetime" ? "À vie" : certification.validity_mode === "limited" ? `Jusqu’au ${certification.valid_until || "?"}` : "Validité inconnue"}
                          </SelenBadge>
                        </div>
                        {certification.note ? <p style={styles.note}>{certification.note}</p> : null}
                        {proof?.url ? (
                          <a href={proof.url} target="_blank" rel="noreferrer" style={styles.proofLink}>
                            Ouvrir le justificatif actuel{proof.name ? ` · ${proof.name}` : ""}
                          </a>
                        ) : (
                          <p style={styles.muted}>Aucun justificatif actuel disponible.</p>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </SelenCard>
          );
        })}
      </div>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { padding: "24px 28px 50px", maxWidth: 1100, margin: "0 auto", color: "var(--selen-text)" },
  back: { color: "var(--selen-text3)", fontSize: 12, textDecoration: "none" },
  header: { display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-start", margin: "16px 0", flexWrap: "wrap" },
  eyebrow: { margin: 0, color: "var(--selen-gold)", fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em" },
  title: { margin: "6px 0 0", fontSize: 28 },
  subtitle: { margin: "6px 0 0", color: "var(--selen-text2)" },
  notice: { margin: 0, color: "var(--selen-text2)", lineHeight: 1.6, fontSize: 14 },
  stack: { display: "grid", gap: 14, marginTop: 14 },
  row: { display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", flexWrap: "wrap" },
  certList: { display: "grid", gap: 10, marginTop: 12 },
  certCard: { border: "1px solid var(--selen-border)", borderRadius: 12, padding: 14, background: "var(--selen-surface2)" },
  muted: { margin: "5px 0 0", color: "var(--selen-text3)", fontSize: 13, lineHeight: 1.5 },
  note: { margin: "10px 0 0", color: "var(--selen-text2)", fontSize: 13, lineHeight: 1.5 },
  proofLink: { display: "inline-block", marginTop: 12, color: "var(--selen-info)", fontWeight: 800, textDecoration: "none" },
  error: { padding: 16, color: "var(--selen-danger)" },
};
