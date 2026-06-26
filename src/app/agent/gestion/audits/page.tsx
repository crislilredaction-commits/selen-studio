import Link from "next/link";
import type { CSSProperties } from "react";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import SelenButton from "@/components/ui/SelenButton";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { isLilOwner } from "@/lib/server/studioAdmin";
import { auditStart, type ExternalAuditRow } from "@/lib/server/externalAudits";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "full",
  }).format(new Date(value));
}

export default async function ExternalAuditsPage() {
  const canAccessGestionLil = await isLilOwner();
  if (!canAccessGestionLil) {
    return (
      <main style={s.page}>
        <SelenCard>
          <SelenCardTitle>Acces reserve</SelenCardTitle>
          <p style={s.muted}>Cette page est reservee au compte proprietaire.</p>
        </SelenCard>
      </main>
    );
  }

  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("external_audits")
    .select("*")
    .order("audit_date", { ascending: true })
    .order("start_time", { ascending: true });

  const audits = (data ?? []) as ExternalAuditRow[];

  return (
    <main style={s.page}>
      <header style={s.header}>
        <div>
          <p style={s.eyebrow}>Gestion Lil</p>
          <h1 style={s.title}>Audits externes</h1>
        </div>
        <Link href="/agent/gestion/audits/new" style={{ textDecoration: "none" }}>
          <SelenButton type="button">Nouvel audit</SelenButton>
        </Link>
      </header>

      <section style={s.list}>
        {audits.length === 0 ? (
          <SelenCard>
            <SelenCardTitle>Aucun audit externe.</SelenCardTitle>
          </SelenCard>
        ) : (
          audits.map((audit) => (
            <Link
              key={audit.id}
              href={`/agent/gestion/audits/${audit.id}`}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <SelenCard>
                <div style={s.row}>
                  <div>
                    <SelenCardTitle>{audit.of_name}</SelenCardTitle>
                    <p style={s.muted}>
                      {audit.audit_type} - {audit.certifier || "Certificateur a confirmer"}
                    </p>
                    <p style={s.muted}>
                      {formatDate(auditStart(audit).toISOString())} a{" "}
                      {audit.start_time.slice(0, 5)}
                    </p>
                  </div>
                  <strong style={s.status}>{audit.status}</strong>
                </div>
              </SelenCard>
            </Link>
          ))
        )}
      </section>
    </main>
  );
}

const s: Record<string, CSSProperties> = {
  page: { maxWidth: 1180, margin: "0 auto", padding: "24px 28px 48px" },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 20,
  },
  eyebrow: {
    fontFamily: "var(--font-display)",
    fontSize: 9,
    letterSpacing: "0.3em",
    textTransform: "uppercase",
    color: "var(--selen-gold)",
  },
  title: {
    fontFamily: "var(--font-display)",
    fontSize: 32,
    margin: "8px 0",
    color: "var(--selen-text)",
  },
  list: { display: "grid", gap: 12 },
  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  status: { color: "var(--selen-gold2)", fontSize: 12 },
  muted: { color: "var(--selen-text2-oncard)", fontSize: 13, lineHeight: 1.6 },
};
