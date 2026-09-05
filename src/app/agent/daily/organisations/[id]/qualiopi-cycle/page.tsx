import Link from "next/link";
import type { CSSProperties } from "react";

import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import SelenBadge from "@/components/ui/SelenBadge";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

type PageProps = {
  params: Promise<{ id: string }>;
};

type Reminder = {
  reminder_type: string;
  status: string | null;
  due_at: string | null;
  stage_label: string | null;
  expected_action: string | null;
};

const reminderTypes = [
  "qualiopi_surveillance_window_open",
  "qualiopi_renewal_4_months",
  "qualiopi_certificate_expiry",
] as const;

function displayDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("fr-FR");
}

function displayReminderDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("fr-FR");
}

function reminderVariant(status: string | null) {
  if (status === "sent") return "success" as const;
  if (status === "ready" || status === "postponed") return "info" as const;
  if (status === "ignored" || status === "cancelled") return "neutral" as const;
  return "warn" as const;
}

export default async function DailyQualiopiCyclePage({ params }: PageProps) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={styles.page}><p style={styles.error}>{auth.error}</p></main>;

  const { id: organisationId } = await params;
  const admin = createSupabaseAdminClient();
  const [organisationRes, remindersRes] = await Promise.all([
    admin
      .from("organisations")
      .select("id,name,legal_name,qualiopi_status,qualiopi_valid_from,qualiopi_valid_until,qualiopi_surveillance_window_start,qualiopi_surveillance_window_end,qualiopi_surveillance_audit_date,qualiopi_renewal_reminder_on")
      .eq("id", organisationId)
      .maybeSingle(),
    admin
      .from("client_reminders")
      .select("reminder_type,status,due_at,stage_label,expected_action")
      .eq("prestation_type", "daily_qualiopi")
      .eq("prestation_id", organisationId)
      .in("reminder_type", [...reminderTypes])
      .order("due_at", { ascending: true }),
  ]);

  if (organisationRes.error || !organisationRes.data) {
    return <main style={styles.page}><p style={styles.error}>Organisme introuvable.</p></main>;
  }
  if (remindersRes.error) {
    return <main style={styles.page}><p style={styles.error}>{remindersRes.error.message}</p></main>;
  }

  const organisation = organisationRes.data;
  const reminders = (remindersRes.data ?? []) as Reminder[];
  const reminderByType = new Map(reminders.map((reminder) => [reminder.reminder_type, reminder]));
  const certified = organisation.qualiopi_status === "certified";

  return (
    <main style={styles.page}>
      <Link href={`/agent/daily/organisations/${organisationId}?tab=info`} style={styles.back}>
        ← Informations de l’organisme
      </Link>

      <header style={styles.header}>
        <div>
          <p style={styles.eyebrow}>Daily · Consultation agent</p>
          <h1 style={styles.title}>Cycle Qualiopi</h1>
          <p style={styles.subtitle}>{organisation.legal_name || organisation.name || "Organisme Daily"}</p>
        </div>
        <SelenBadge variant={certified ? "success" : "neutral"}>
          {certified ? "Certifié" : organisation.qualiopi_status || "Statut non renseigné"}
        </SelenBadge>
      </header>

      <SelenCard>
        <p style={styles.notice}>
          Cette vue reprend les dates canoniques de l’organisme et l’état du moteur de rappels Qualiopi déjà utilisé par Daily. Elle ne crée aucun rappel parallèle.
        </p>
      </SelenCard>

      <section style={styles.grid}>
        <CycleCard
          title="Certification"
          rows={[
            ["Début du cycle", displayDate(organisation.qualiopi_valid_from)],
            ["Échéance du certificat", displayDate(organisation.qualiopi_valid_until)],
          ]}
        />
        <CycleCard
          title="Audit de surveillance"
          rows={[
            ["Ouverture M+16", displayDate(organisation.qualiopi_surveillance_window_start)],
            ["Fin de fenêtre M+20", displayDate(organisation.qualiopi_surveillance_window_end)],
            ["Date d’audit saisie", displayDate(organisation.qualiopi_surveillance_audit_date)],
          ]}
        />
        <CycleCard
          title="Renouvellement"
          rows={[["Rappel M-4", displayDate(organisation.qualiopi_renewal_reminder_on)]]}
        />
      </section>

      <section style={styles.reminderSection}>
        <h2 style={styles.sectionTitle}>Rappels Daily</h2>
        <p style={styles.notice}>Contrôle opérationnel des trois rappels issus du cycle Qualiopi.</p>
        <div style={styles.grid}>
          <ReminderCard
            title="Surveillance M+16"
            reminder={reminderByType.get("qualiopi_surveillance_window_open")}
            expectedDate={organisation.qualiopi_surveillance_window_start}
          />
          <ReminderCard
            title="Renouvellement M-4"
            reminder={reminderByType.get("qualiopi_renewal_4_months")}
            expectedDate={organisation.qualiopi_renewal_reminder_on}
          />
          <ReminderCard
            title="Échéance du certificat"
            reminder={reminderByType.get("qualiopi_certificate_expiry")}
            expectedDate={organisation.qualiopi_valid_until}
          />
        </div>
      </section>
    </main>
  );
}

function CycleCard({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return (
    <SelenCard>
      <SelenCardTitle>{title}</SelenCardTitle>
      <div style={styles.rows}>
        {rows.map(([label, value]) => (
          <div key={label} style={styles.row}>
            <span style={styles.label}>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </SelenCard>
  );
}

function ReminderCard({ title, reminder, expectedDate }: { title: string; reminder?: Reminder; expectedDate: string | null }) {
  const expected = displayDate(expectedDate);
  const due = reminder ? displayReminderDate(reminder.due_at) : expected;
  return (
    <SelenCard>
      <div style={styles.reminderHead}>
        <SelenCardTitle>{title}</SelenCardTitle>
        <SelenBadge variant={reminderVariant(reminder?.status ?? null)}>
          {reminder?.status || (expectedDate ? "À synchroniser" : "Non planifié")}
        </SelenBadge>
      </div>
      <div style={styles.rows}>
        <div style={styles.row}>
          <span style={styles.label}>Échéance attendue</span>
          <strong>{expected}</strong>
        </div>
        <div style={styles.row}>
          <span style={styles.label}>Échéance moteur</span>
          <strong>{due}</strong>
        </div>
      </div>
      {reminder?.expected_action ? <p style={styles.action}>{reminder.expected_action}</p> : null}
    </SelenCard>
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
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 14, marginTop: 14 },
  reminderSection: { marginTop: 24 },
  sectionTitle: { margin: 0, fontSize: 20 },
  reminderHead: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" },
  rows: { display: "grid", gap: 10, marginTop: 12 },
  row: { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "baseline", borderTop: "1px solid var(--selen-border)", paddingTop: 10 },
  label: { color: "var(--selen-text3)", fontSize: 13 },
  action: { margin: "12px 0 0", color: "var(--selen-text2)", fontSize: 13, lineHeight: 1.5 },
  error: { padding: 16, color: "var(--selen-danger)" },
};
