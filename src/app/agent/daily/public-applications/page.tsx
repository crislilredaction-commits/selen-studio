import Link from "next/link";

import SelenBadge from "@/components/ui/SelenBadge";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import SelenButton from "@/components/ui/SelenButton";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

type PublicApplication = {
  id: string;
  response_type: "beneficiary" | "company";
  respondent_first_name: string | null;
  respondent_last_name: string | null;
  respondent_email: string | null;
  company_name: string | null;
  adaptation_needed: boolean | null;
  attached_session_id: string | null;
  submitted_at: string | null;
  daily_formations: { title: string | null } | null;
};

function applicantName(row: PublicApplication) {
  if (row.response_type === "company" && row.company_name?.trim()) return row.company_name.trim();
  const name = [row.respondent_first_name, row.respondent_last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  return name || row.respondent_email || "Candidat";
}

function formatDate(value: string | null) {
  if (!value) return "Date non renseignée";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default async function PublicApplicationsPage() {
  const auth = await requireSupportAgent();
  if (!auth.ok) {
    return (
      <main style={styles.page}>
        <p style={styles.error}>{auth.error}</p>
      </main>
    );
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("daily_formation_registration_requests")
    .select(
      "id,response_type,respondent_first_name,respondent_last_name,respondent_email,company_name,adaptation_needed,attached_session_id,submitted_at,daily_formations(title)",
    )
    .eq("status", "to_attach")
    .order("submitted_at", { ascending: true, nullsFirst: false })
    .limit(100);

  if (error) {
    return (
      <main style={styles.page}>
        <p style={styles.error}>Impossible de charger les candidatures publiques : {error.message}</p>
      </main>
    );
  }

  const applications = (data ?? []) as unknown as PublicApplication[];

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div>
          <p style={styles.eyebrow}>Studio agent · Daily</p>
          <h1 style={styles.title}>Candidatures publiques</h1>
          <p style={styles.subtitle}>
            Dossiers transmis depuis le lien public d’une formation et encore à contrôler par Selen avant rattachement définitif et convention.
          </p>
        </div>
        <Link href="/agent/daily/actions" style={{ textDecoration: "none" }}>
          <SelenButton variant="ghost">Retour aux actions</SelenButton>
        </Link>
      </header>

      <SelenCard>
        <SelenCardTitle>Candidatures à traiter</SelenCardTitle>
        <p style={styles.helpText}>
          Une session choisie par le prospect reste une préférence contrôlée. Elle ne vaut ni réservation définitive ni validation de la formation avant signature de la convention.
        </p>

        {applications.length === 0 ? (
          <p style={styles.empty}>Aucune candidature publique n’attend de traitement.</p>
        ) : (
          <div style={styles.list}>
            {applications.map((row) => (
              <article key={row.id} style={styles.item}>
                <div style={styles.itemHead}>
                  <div style={styles.badges}>
                    <SelenBadge variant="warn" dot>À contrôler</SelenBadge>
                    <SelenBadge variant="info">
                      {row.response_type === "company" ? "Entreprise" : "Apprenant"}
                    </SelenBadge>
                    {row.attached_session_id ? (
                      <SelenBadge variant="status">Session choisie</SelenBadge>
                    ) : (
                      <SelenBadge variant="warn">Session à proposer</SelenBadge>
                    )}
                    {row.adaptation_needed ? (
                      <SelenBadge variant="danger">Adaptation signalée</SelenBadge>
                    ) : null}
                  </div>
                  <span style={styles.date}>{formatDate(row.submitted_at)}</span>
                </div>

                <h2 style={styles.itemTitle}>{applicantName(row)}</h2>
                <p style={styles.itemText}>
                  {[row.daily_formations?.title ?? "Formation Daily", row.respondent_email]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <p style={styles.itemText}>
                  {row.attached_session_id
                    ? "Le prospect a sélectionné une session disponible. Selen doit contrôler le dossier avant de confirmer le rattachement."
                    : "Aucune session n’était sélectionnable : l’organisme devra proposer ou créer une session après contrôle du dossier."}
                </p>
              </article>
            ))}
          </div>
        )}
      </SelenCard>
    </main>
  );
}

const styles = {
  page: {
    maxWidth: 1180,
    margin: "0 auto",
    padding: "28px",
    color: "var(--selen-text)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 20,
    marginBottom: 22,
    flexWrap: "wrap" as const,
  },
  eyebrow: {
    margin: 0,
    fontFamily: "var(--font-display)",
    fontSize: 9,
    letterSpacing: "0.28em",
    textTransform: "uppercase" as const,
    color: "var(--selen-gold)",
  },
  title: {
    margin: "8px 0 0",
    fontFamily: "var(--font-display)",
    fontSize: 30,
    lineHeight: 1.15,
  },
  subtitle: {
    margin: "10px 0 0",
    maxWidth: 760,
    color: "var(--selen-text2)",
    fontSize: 14,
    lineHeight: 1.65,
  },
  helpText: {
    margin: "7px 0 14px",
    color: "var(--selen-text2)",
    fontSize: 12,
    lineHeight: 1.6,
  },
  empty: { margin: 0, color: "var(--selen-text3)", fontSize: 13 },
  list: { display: "grid", gap: 10 },
  item: {
    border: "1px solid var(--selen-border)",
    background: "var(--selen-bg3)",
    borderRadius: "var(--radius-md)",
    padding: 14,
    display: "grid",
    gap: 8,
  },
  itemHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    flexWrap: "wrap" as const,
  },
  badges: { display: "flex", flexWrap: "wrap" as const, gap: 7 },
  date: { color: "var(--selen-text3)", fontSize: 11 },
  itemTitle: { margin: 0, fontSize: 16, color: "var(--selen-text)" },
  itemText: { margin: 0, color: "var(--selen-text2)", fontSize: 12, lineHeight: 1.55 },
  error: {
    border: "1px solid var(--selen-danger)",
    borderRadius: "var(--radius-md)",
    padding: 14,
    color: "var(--selen-danger)",
  },
};
