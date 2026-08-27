import Link from "next/link";

import LogoutButton from "@/components/agent/LogoutButton";
import SelenButton from "@/components/ui/SelenButton";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import { isOwnerLil } from "@/lib/ownerLil";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { createClient } from "@/lib/supabase/server";

type StaffRole = "agent" | "admin";
type StaffInfo = { id: string | null; user_id: string | null; email: string | null; role: StaffRole; first_name: string | null; last_name: string | null };
type DashboardItem = { id: string; title: string; subtitle: string; href: string; date?: string | null };
type DossierRow = { id: string; title: string | null; type: string | null; status: string | null; updated_at: string | null };
type AuditRow = { id: string; client_email: string; status: string | null; offer: string | null; updated_at: string | null; agent_id: string | null; agent_email: string | null; report_status: string | null };
type ReminderRow = { id: string; client_email: string | null; dossier_id: string | null; reminder_type: string | null; status: string | null; subject: string | null; due_at: string | null; metadata: Record<string, unknown> | null };
type TicketRow = { id: string; client_email: string | null; client_name: string | null; subject: string | null; category: string | null; priority: string | null; status: string | null; last_message_at: string | null; updated_at: string | null; created_at: string | null };
type DailySessionDossierRow = { session_id: string; status: string; assigned_agent_profile_id: string | null; updated_at: string | null };
type DailySessionRow = { id: string; formation_id: string; internal_reference: string | null; start_date: string | null; updated_at: string | null };
type DailyFormationRow = { id: string; title: string | null };

const inactiveStatuses = new Set(["completed", "cancelled", "archived", "done", "termine", "terminé"]);
const adminLinks = [
  { title: "Gestion Lil", description: "Piloter les audits externes, le CA Selen et les actions SAV admin.", href: "/agent/gestion", icon: "💼", internal: true },
  { title: "Créer un accès agent", description: "Inviter un nouvel agent ou auditeur à accéder à Selen Studio.", href: "/agent/admin/agents", icon: "🪪", internal: true },
  { title: "www.selen-editions.fr", description: "Ouvrir le site public et l’espace client Selen.", href: "https://www.selen-editions.fr", icon: "🌐", internal: false },
  { title: "selion.selen-editions.fr", description: "Ouvrir le robot de prospection et le suivi des prospects.", href: "https://selion.selen-editions.fr", icon: "🦁", internal: false },
];

function active(status?: string | null) { return !status || !inactiveStatuses.has(status); }
function formatDate(value?: string | null) { return value ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(value)) : "Date non renseignée"; }
function formatType(type?: string | null) { return type === "nda" ? "NDA" : type === "review" ? "Review" : type === "prepa" ? "Prépa" : type === "daily" ? "Daily" : type ?? "Dossier"; }
function formatStatus(status?: string | null) {
  const labels: Record<string, string> = { draft: "Brouillon", waiting_client: "En attente client", assignable: "À attribuer", assigned: "Attribué", in_progress: "En cours", collecting_documents: "Collecte documents", under_review: "Analyse en cours", to_complete: "À compléter", generated: "Généré", compliant: "Conforme", archived: "Archivé", paid: "Paiement validé", booking_pending: "RDV à planifier", partially_booked: "RDV partiel", booked: "RDV réservé", report_ready: "Rapport prêt", completed: "Terminé", cancelled: "Annulé" };
  return status ? labels[status] ?? status : "À vérifier";
}
function formatReminderType(type?: string | null) { return type === "preaudit_incomplete_15_days" ? "Préaudit" : type === "audit_blanc_booking_reminder_7_days" ? "Review" : type === "audit_blanc_48h_reminder" ? "Rappel Review" : type === "nda_inactive_9_days" ? "NDA" : "Relance"; }
function unique(items: DashboardItem[]) { const seen = new Set<string>(); return items.filter((item) => seen.has(item.id) ? false : (seen.add(item.id), true)); }
function dossierItem(row: DossierRow): DashboardItem { return { id: row.id, title: row.title || `Dossier ${row.id.slice(0, 8)}`, subtitle: `${formatType(row.type)} · ${formatStatus(row.status)}`, href: `/agent/dossiers/${row.id}`, date: row.updated_at }; }

async function currentStaff(): Promise<StaffInfo> {
  const supabase = await createClient();
  if (process.env.NODE_ENV === "development" && process.env.SELEN_DEV_ADMIN_BYPASS === "true") return { id: null, user_id: null, role: "admin", email: "local-dev-agent@selen.local", first_name: null, last_name: null };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { id: null, user_id: null, role: "agent", email: null, first_name: null, last_name: null };
  const { data: staffByUser } = await supabase.from("selen_admin_users").select("role,email,is_active").eq("user_id", user.id).eq("is_active", true).maybeSingle();
  const { data: staffByEmail } = staffByUser?.role ? { data: null } : await supabase.from("selen_admin_users").select("role,email,is_active").eq("email", user.email).eq("is_active", true).maybeSingle();
  const role = (staffByUser?.role ?? staffByEmail?.role ?? "agent") as StaffRole;
  const email = staffByUser?.email ?? staffByEmail?.email ?? user.email;
  const { data: profileByUser } = await supabase.from("agent_profiles").select("id,user_id,email,first_name,last_name,is_active").eq("user_id", user.id).eq("is_active", true).maybeSingle();
  const { data: profileByEmail } = profileByUser ? { data: null } : await supabase.from("agent_profiles").select("id,user_id,email,first_name,last_name,is_active").eq("email", email).eq("is_active", true).maybeSingle();
  const profile = profileByUser ?? profileByEmail;
  return { id: profile?.id ?? null, user_id: profile?.user_id ?? user.id, email: profile?.email ?? email, role, first_name: profile?.first_name ?? null, last_name: profile?.last_name ?? null };
}

async function dailySessionDossiers(admin: ReturnType<typeof createSupabaseAdminClient>, staff: StaffInfo): Promise<DashboardItem[]> {
  let query = admin.from("daily_session_dossiers").select("session_id,status,assigned_agent_profile_id,updated_at").eq("status", "active").order("updated_at", { ascending: false }).limit(20);
  if (staff.role !== "admin" && staff.id) query = query.eq("assigned_agent_profile_id", staff.id);
  const { data: dossiers } = await query;
  const rows = (dossiers ?? []) as DailySessionDossierRow[];
  if (rows.length === 0) return [];
  const sessionIds = rows.map((row) => row.session_id);
  const [{ data: sessions }, { data: checklist }] = await Promise.all([
    admin.from("daily_sessions").select("id,formation_id,internal_reference,start_date,updated_at").in("id", sessionIds),
    admin.from("daily_session_checklist_items").select("session_id,status").in("session_id", sessionIds),
  ]);
  const sessionRows = (sessions ?? []) as DailySessionRow[];
  const formationIds = [...new Set(sessionRows.map((row) => row.formation_id).filter(Boolean))];
  const { data: formations } = formationIds.length ? await admin.from("daily_formations").select("id,title").in("id", formationIds) : { data: [] };
  const formationMap = new Map(((formations ?? []) as DailyFormationRow[]).map((row) => [row.id, row.title]));
  const sessionMap = new Map(sessionRows.map((row) => [row.id, row]));
  const pendingCount = new Map<string, number>();
  for (const item of checklist ?? []) {
    if (["validated", "not_applicable"].includes(item.status)) continue;
    pendingCount.set(item.session_id, (pendingCount.get(item.session_id) ?? 0) + 1);
  }
  return rows.map((row) => {
    const session = sessionMap.get(row.session_id);
    const title = session ? formationMap.get(session.formation_id) || session.internal_reference || "Dossier de session Daily" : "Dossier de session Daily";
    const count = pendingCount.get(row.session_id) ?? 0;
    return { id: `daily-session-${row.session_id}`, title, subtitle: `Daily · dossier de session · ${count} tâche${count > 1 ? "s" : ""} à traiter`, href: `/agent/daily/session-dossiers/${row.session_id}`, date: row.updated_at ?? session?.updated_at };
  });
}

export default async function AgentHomeDashboard() {
  const staff = await currentStaff();
  const admin = createSupabaseAdminClient();
  const canAccessGestionLil = isOwnerLil(staff.email);
  const greeting = staff.first_name?.trim() || staff.email?.split("@")[0] || "agent";

  const sessionDossiers = await dailySessionDossiers(admin, staff);

  const assignedIds = new Set<string>();
  if (staff.id) {
    const { data } = await admin.from("dossier_assignments").select("dossier_id").eq("agent_id", staff.id);
    for (const row of data ?? []) if (row.dossier_id) assignedIds.add(row.dossier_id);
  }
  let assigned: DossierRow[] = [];
  if (assignedIds.size) {
    const { data } = await admin.from("dossiers").select("id,title,type,status,updated_at").in("id", [...assignedIds]).order("updated_at", { ascending: false });
    assigned = ((data ?? []) as DossierRow[]).filter((row) => active(row.status));
  }

  let unreadQuery = admin.from("messages").select("id,dossier_id,created_at").eq("sender_type", "client").is("read_by_agent_at", null).order("created_at", { ascending: false }).limit(50);
  if (staff.role !== "admin" && assignedIds.size) unreadQuery = unreadQuery.in("dossier_id", [...assignedIds]);
  const { data: unreadMessages } = await unreadQuery;
  const unreadDossierIds = [...new Set((unreadMessages ?? []).map((row) => row.dossier_id).filter(Boolean))] as string[];
  let unreadDossiers: DossierRow[] = [];
  if (unreadDossierIds.length) {
    const { data } = await admin.from("dossiers").select("id,title,type,status,updated_at").in("id", unreadDossierIds);
    unreadDossiers = ((data ?? []) as DossierRow[]).filter((row) => active(row.status));
  }
  const unreadItems = unreadDossiers.map((row) => ({ ...dossierItem(row), subtitle: `${formatType(row.type)} · message client non lu` }));

  const { data: reminderData } = await admin.from("client_reminders").select("id,client_email,dossier_id,reminder_type,status,subject,due_at,metadata").in("status", ["draft", "ready", "postponed"]).order("due_at", { ascending: true }).limit(12);
  const reminders = ((reminderData ?? []) as ReminderRow[]).map((row) => ({ id: row.id, title: row.client_email || "Client à relancer", subtitle: `${formatReminderType(row.reminder_type)} · ${typeof row.metadata?.reason === "string" ? row.metadata.reason : row.subject || "Relance client à traiter"}`, href: "/agent/relances", date: row.due_at }));

  const { data: ticketData } = await admin.from("support_tickets").select("id,client_email,client_name,subject,category,priority,status,last_message_at,updated_at,created_at").order("last_message_at", { ascending: false, nullsFirst: false }).limit(20);
  const tickets = ((ticketData ?? []) as TicketRow[]).filter((row) => !["closed", "resolved"].includes(String(row.status))).slice(0, 6).map((row) => ({ id: row.id, title: row.subject || "Ticket support", subtitle: [row.client_name || row.client_email || "Client", row.category || "support", row.priority || "normal"].join(" · "), href: `/agent/support/${row.id}`, date: row.last_message_at || row.updated_at || row.created_at }));

  let auditQuery = admin.from("audit_blanc_cases").select("id,client_email,status,offer,updated_at,agent_id,agent_email,report_status").order("updated_at", { ascending: false }).limit(20);
  if (staff.role !== "admin") {
    if (staff.id && staff.email) auditQuery = auditQuery.or(`agent_id.eq.${staff.id},agent_email.eq.${staff.email}`);
    else if (staff.id) auditQuery = auditQuery.eq("agent_id", staff.id);
    else if (staff.email) auditQuery = auditQuery.eq("agent_email", staff.email);
  }
  const { data: auditData } = await auditQuery;
  const audits = ((auditData ?? []) as AuditRow[]).filter((row) => active(row.status) && row.report_status !== "sent" && row.status !== "report_ready").slice(0, 8).map((row) => ({ id: row.id, title: row.client_email, subtitle: `Audit blanc · ${formatStatus(row.status)}`, href: `/agent/audits-blancs/${row.id}`, date: row.updated_at }));

  const { data: allAssignments } = await admin.from("dossier_assignments").select("dossier_id");
  const allAssigned = new Set((allAssignments ?? []).map((row) => row.dossier_id).filter(Boolean));
  const { data: candidateData } = await admin.from("dossiers").select("id,title,type,status,updated_at").order("updated_at", { ascending: false }).limit(50);
  const unassigned = ((candidateData ?? []) as DossierRow[]).filter((row) => active(row.status) && !allAssigned.has(row.id)).slice(0, 8).map((row) => ({ ...dossierItem(row), subtitle: `${formatType(row.type)} · sans attribution` }));

  const actionDossiers = unique([...sessionDossiers, ...unreadItems, ...reminders.filter((item) => !((reminderData ?? []) as ReminderRow[]).some((reminder) => reminder.id === item.id && reminder.reminder_type === "preaudit_incomplete_15_days"))]).slice(0, 12);
  const visibleAdminLinks = adminLinks.filter((item) => item.href === "/agent/gestion" ? canAccessGestionLil : staff.role === "admin");

  return <main style={{ padding: "24px 28px", maxWidth: 1180, margin: "0 auto", color: "var(--selen-text)" }}>
    <section style={{ display: "grid", gap: 18, marginBottom: 24 }}>
      <div><p style={eyebrow}>Selen Studio</p><h1 style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 600, marginTop: 8 }}>Bonjour {greeting} ✨</h1><p style={lead}>Voici ton tableau de bord du jour : les dossiers à suivre et les actions qui demandent réellement ton attention.</p>{staff.email ? <p style={small}>Connecté avec : {staff.email} · rôle : {staff.role}</p> : null}</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><Link href="/agent/dossiers/new" style={{ textDecoration: "none" }}><SelenButton variant="primary">Créer un dossier</SelenButton></Link><Link href="/agent/clients/new" style={{ textDecoration: "none" }}><SelenButton variant="ghost">Créer un client</SelenButton></Link><LogoutButton /></div>
    </section>

    <section style={grid}>
      <TaskCard icon="⚡" title="Dossiers à traiter" count={actionDossiers.length} emptyText="Aucune action immédiate détectée." items={actionDossiers} />
      <TaskCard icon="🧾" title="Audits blancs Review" count={audits.length} emptyText="Aucun audit blanc Review actif à suivre." items={audits} footerHref="/agent/audits-blancs" footerLabel="Ouvrir les audits blancs" />
      <TaskCard icon="📨" title="Clients à relancer" count={reminders.length} emptyText="Aucune relance client détectée." items={reminders} footerHref="/agent/relances" footerLabel="Ouvrir les relances" />
      <TaskCard icon="🛟" title="Support à traiter" count={tickets.length} emptyText="Aucun ticket support à traiter." items={tickets} footerHref="/agent/support" footerLabel="Ouvrir le support" />
    </section>

    {assigned.length ? <section style={{ marginBottom: 24 }}><TaskCard icon="📌" title="Mes dossiers attribués" count={assigned.length} emptyText="Aucun dossier attribué." items={assigned.map(dossierItem)} footerHref="/agent/dossiers" footerLabel="Voir les dossiers" /></section> : null}
    {unassigned.length ? <section style={{ marginBottom: 24 }}><TaskCard icon="🧭" title="Dossiers en attente d’un agent" count={unassigned.length} emptyText="Aucun dossier en attente d’attribution." items={unassigned} footerHref="/agent/dossiers" footerLabel="Voir les dossiers" /></section> : null}

    {visibleAdminLinks.length ? <section><SelenCard><SelenCardTitle>Accès admin</SelenCardTitle><p style={lead}>Ces raccourcis sont réservés aux comptes administrateurs.</p><div style={{ ...grid, marginBottom: 0 }}>{visibleAdminLinks.map((item) => item.internal ? <Link key={item.href} href={item.href} style={{ textDecoration: "none", color: "inherit" }}><AdminLink item={item} /></Link> : <a key={item.href} href={item.href} target="_blank" rel="noreferrer" style={{ textDecoration: "none", color: "inherit" }}><AdminLink item={item} /></a>)}</div></SelenCard></section> : null}
  </main>;
}

function TaskCard({ icon, title, count, emptyText, items, footerHref, footerLabel }: { icon: string; title: string; count: number; emptyText: string; items: DashboardItem[]; footerHref?: string; footerLabel?: string }) {
  return <SelenCard style={{ height: "100%" }}><div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 12 }}><div><p style={{ fontSize: 22, marginBottom: 8 }}>{icon}</p><SelenCardTitle>{title}</SelenCardTitle></div><div style={counter}>{count}</div></div>{items.length === 0 ? <p style={small}>{emptyText}</p> : <div style={{ display: "grid", gap: 8 }}>{items.slice(0, 4).map((item) => <Link key={item.id} href={item.href} style={itemStyle}><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{item.title}</div><div style={{ fontSize: 12, color: "var(--selen-text2)" }}>{item.subtitle}</div>{item.date ? <div style={small}>Dernière mise à jour : {formatDate(item.date)}</div> : null}</Link>)}{items.length > 4 ? <p style={small}>+ {items.length - 4} autre{items.length - 4 > 1 ? "s" : ""}</p> : null}</div>}{footerHref && footerLabel ? <div style={{ marginTop: 12 }}><Link href={footerHref} style={{ color: "var(--selen-gold2)", fontSize: 12, fontWeight: 700, textDecoration: "none" }}>{footerLabel} →</Link></div> : null}</SelenCard>;
}
function AdminLink({ item }: { item: (typeof adminLinks)[number] }) { return <div style={{ border: "1px solid var(--selen-border)", borderRadius: "var(--radius-md)", padding: 14, background: "var(--selen-bg3)", height: "100%" }}><div style={{ fontSize: 22, marginBottom: 8 }}>{item.icon}</div><div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{item.title}</div><p style={small}>{item.description}</p></div>; }

const eyebrow = { fontFamily: "var(--font-display)", fontSize: 9, letterSpacing: "0.3em", textTransform: "uppercase" as const, color: "var(--selen-gold)", opacity: 0.85 };
const lead = { marginTop: 10, maxWidth: 720, fontSize: 14, lineHeight: 1.65, color: "var(--selen-text2)" };
const small = { marginTop: 6, fontSize: 11, color: "var(--selen-text3)", lineHeight: 1.5 };
const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 14, marginBottom: 24 };
const counter = { minWidth: 38, height: 38, borderRadius: 999, display: "grid", placeItems: "center", padding: "0 10px", background: "var(--selen-bg3)", border: "1px solid var(--selen-border)", color: "var(--selen-gold2)", fontWeight: 800, fontSize: 15 };
const itemStyle = { display: "block", textDecoration: "none", color: "inherit", border: "1px solid var(--selen-border)", borderRadius: "var(--radius-sm)", padding: 10, background: "var(--selen-bg3)" };