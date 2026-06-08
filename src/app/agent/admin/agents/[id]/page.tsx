import Link from "next/link";
import type { CSSProperties } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import SelenBadge from "@/components/ui/SelenBadge";
import SelenButton from "@/components/ui/SelenButton";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

type AgentRole = "agent" | "admin";

type AgentProfile = {
  id: string;
  user_id: string | null;
  email: string;
  role: AgentRole;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  company_name: string | null;
  siret: string | null;
  vat_number: string | null;
  billing_email: string | null;
  billing_notes: string | null;
};

type DossierAssignment = {
  dossier_id: string | null;
};

type DossierRow = {
  id: string;
  title: string | null;
  type: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type AgentInvoice = {
  id: string;
  agent_email: string;
  invoice_number: string | null;
  invoice_period: string | null;
  amount_cents: number | null;
  currency: string | null;
  status: "submitted" | "approved" | "paid" | "rejected";
  public_url: string | null;
  submitted_at: string | null;
};

function getDisplayName(agent: AgentProfile) {
  return (
    [agent.first_name, agent.last_name].filter(Boolean).join(" ").trim() ||
    agent.email
  );
}

function formatDate(value?: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function formatPrice(amountCents?: number | null, currency?: string | null) {
  if (amountCents === null || amountCents === undefined) {
    return "Montant non renseigné";
  }

  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: currency || "EUR",
  }).format(amountCents / 100);
}

function getRoleLabel(role: AgentRole) {
  return role === "admin" ? "Admin" : "Agent";
}

function getStatusLabel(status?: string | null) {
  switch (status) {
    case "draft":
      return "Brouillon";
    case "waiting_client":
      return "En attente client";
    case "assignable":
      return "À assigner";
    case "assigned":
      return "Assigné";
    case "in_progress":
      return "En cours";
    case "generated":
      return "Généré";
    case "collecting_documents":
      return "Collecte documents";
    case "under_review":
      return "En vérification";
    case "to_complete":
      return "À compléter";
    case "compliant":
      return "Conforme";
    case "archived":
      return "Archivé";
    default:
      return status ?? "À vérifier";
  }
}

function getTypeLabel(type?: string | null) {
  switch (type) {
    case "nda":
      return "NDA";
    case "review":
      return "Review";
    case "prepa":
      return "Prépa";
    case "daily":
      return "Daily";
    case "non_conformite":
      return "Non-conformité";
    case "audit_blanc":
      return "Review";
    case "mise_en_conformite":
      return "Prépa";
    case "audit_reel":
      return "Prépa";
    default:
      return type ?? "Dossier";
  }
}

function getInvoiceStatusLabel(status: AgentInvoice["status"]) {
  switch (status) {
    case "submitted":
      return "Déposée";
    case "approved":
      return "Validée";
    case "paid":
      return "Payée";
    case "rejected":
      return "Refusée";
    default:
      return status;
  }
}

function getInvoiceBadgeVariant(status: AgentInvoice["status"]) {
  switch (status) {
    case "paid":
      return "success";
    case "approved":
      return "info";
    case "rejected":
      return "danger";
    case "submitted":
    default:
      return "warn";
  }
}

async function getCurrentAdmin() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return null;

  const { data: adminProfile } = await supabase
    .from("agent_profiles")
    .select("id, email, role, is_active")
    .eq("email", user.email.toLowerCase())
    .eq("is_active", true)
    .maybeSingle();

  if (!adminProfile || adminProfile.role !== "admin") return null;

  return adminProfile;
}

export default async function AgentAdminAgentDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const currentAdmin = await getCurrentAdmin();

  async function updateAgentRole(formData: FormData) {
    "use server";

    const agentId = formData.get("agent_id") as string;
    const nextRole = formData.get("role") as AgentRole;

    if (!["agent", "admin"].includes(nextRole)) {
      throw new Error("Rôle invalide.");
    }

    const currentAdmin = await getCurrentAdmin();

    if (!currentAdmin) {
      throw new Error("Action réservée aux administrateurs.");
    }

    const supabase = await createClient();

    const { error } = await supabase
      .from("agent_profiles")
      .update({
        role: nextRole,
        updated_at: new Date().toISOString(),
      })
      .eq("id", agentId);

    if (error) {
      console.error(error);
      throw new Error("Impossible de modifier le rôle de cet agent.");
    }

    redirect(`/agent/admin/agents/${agentId}`);
  }

  async function toggleAgentActive(formData: FormData) {
    "use server";

    const agentId = formData.get("agent_id") as string;
    const nextIsActive = formData.get("is_active") === "true";

    const currentAdmin = await getCurrentAdmin();

    if (!currentAdmin) {
      throw new Error("Action réservée aux administrateurs.");
    }

    if (currentAdmin.id === agentId && !nextIsActive) {
      throw new Error(
        "Vous ne pouvez pas désactiver votre propre accès admin.",
      );
    }

    const supabase = await createClient();

    const { error } = await supabase
      .from("agent_profiles")
      .update({
        is_active: nextIsActive,
        updated_at: new Date().toISOString(),
      })
      .eq("id", agentId);

    if (error) {
      console.error(error);
      throw new Error("Impossible de modifier l’état de cet accès.");
    }

    redirect(`/agent/admin/agents/${agentId}`);
  }

  if (!currentAdmin) {
    return (
      <main style={s.page}>
        <div style={s.container}>
          <SelenCard>
            <SelenCardTitle>Accès refusé</SelenCardTitle>

            <p style={s.muted}>
              Cette page est réservée aux administrateurs Studio.
            </p>

            <div style={{ marginTop: 16 }}>
              <Link href="/agent" style={{ textDecoration: "none" }}>
                <SelenButton variant="primary">Retour Studio</SelenButton>
              </Link>
            </div>
          </SelenCard>
        </div>
      </main>
    );
  }

  const { data: agentData, error: agentError } = await supabase
    .from("agent_profiles")
    .select(
      "id, user_id, email, role, is_active, created_at, updated_at, first_name, last_name, phone, address_line1, address_line2, postal_code, city, country, company_name, siret, vat_number, billing_email, billing_notes",
    )
    .eq("id", id)
    .maybeSingle();

  if (agentError) {
    return (
      <main style={s.page}>
        <div style={s.container}>
          <SelenCard>
            <SelenCardTitle>Erreur</SelenCardTitle>

            <pre style={s.errorBox}>{JSON.stringify(agentError, null, 2)}</pre>
          </SelenCard>
        </div>
      </main>
    );
  }

  if (!agentData) {
    return (
      <main style={s.page}>
        <div style={s.container}>
          <SelenCard>
            <SelenCardTitle>Profil introuvable</SelenCardTitle>

            <p style={s.muted}>Aucun agent ne correspond à cet identifiant.</p>

            <div style={{ marginTop: 16 }}>
              <Link
                href="/agent/admin/agents"
                style={{ textDecoration: "none" }}
              >
                <SelenButton variant="primary">
                  Retour aux accès agents
                </SelenButton>
              </Link>
            </div>
          </SelenCard>
        </div>
      </main>
    );
  }

  const agent = agentData as AgentProfile;
  const displayName = getDisplayName(agent);

  const { data: assignmentData } = await supabase
    .from("dossier_assignments")
    .select("dossier_id")
    .eq("agent_id", agent.id);

  const assignmentIds = ((assignmentData ?? []) as DossierAssignment[])
    .map((assignment) => assignment.dossier_id)
    .filter(Boolean) as string[];

  let dossiers: DossierRow[] = [];

  if (assignmentIds.length > 0) {
    const { data: dossierData } = await supabase
      .from("dossiers")
      .select("id, title, type, status, created_at, updated_at")
      .in("id", assignmentIds)
      .order("updated_at", { ascending: false });

    dossiers = (dossierData ?? []) as DossierRow[];
  }

  const { data: invoiceData } = await supabase
    .from("agent_invoices")
    .select(
      "id, agent_email, invoice_number, invoice_period, amount_cents, currency, status, public_url, submitted_at",
    )
    .eq("agent_email", agent.email)
    .order("submitted_at", { ascending: false });

  const invoices = (invoiceData ?? []) as AgentInvoice[];

  return (
    <main style={s.page}>
      <div style={s.container}>
        <div style={s.breadcrumb}>
          <Link href="/agent" style={s.breadcrumbLink}>
            Studio
          </Link>

          <span style={s.breadcrumbSep}>›</span>

          <Link href="/agent/admin/agents" style={s.breadcrumbLink}>
            Accès agents
          </Link>

          <span style={s.breadcrumbSep}>›</span>

          <span style={s.breadcrumbCurrent}>{displayName}</span>
        </div>

        <header style={s.header}>
          <div>
            <p style={s.eyebrow}>Selen Studio · Administration</p>

            <h1 style={s.title}>{displayName}</h1>

            <div style={s.badgeRow}>
              <SelenBadge
                variant={agent.role === "admin" ? "warn" : "success"}
                dot
              >
                {getRoleLabel(agent.role)}
              </SelenBadge>

              <SelenBadge variant={agent.is_active ? "success" : "neutral"} dot>
                {agent.is_active ? "Actif" : "Désactivé"}
              </SelenBadge>
            </div>

            <p style={s.subtitle}>
              Fiche interne de l’agent : coordonnées, facturation, factures
              déposées et dossiers attribués.
            </p>
          </div>

          <div style={s.headerActions}>
            <Link href="/agent/admin/agents" style={{ textDecoration: "none" }}>
              <SelenButton variant="ghost">← Accès agents</SelenButton>
            </Link>

            <Link href="/agent" style={{ textDecoration: "none" }}>
              <SelenButton variant="primary">Tableau de bord</SelenButton>
            </Link>
          </div>
        </header>

        <div style={s.grid}>
          <section style={s.mainColumn}>
            <SelenCard>
              <SelenCardTitle>Informations personnelles</SelenCardTitle>

              <div style={s.infoGrid}>
                <Info label="Email" value={agent.email} />
                <Info label="Téléphone" value={agent.phone} />
                <Info label="Prénom" value={agent.first_name} />
                <Info label="Nom" value={agent.last_name} />
                <Info label="Créé le" value={formatDate(agent.created_at)} />
                <Info
                  label="Mis à jour le"
                  value={formatDate(agent.updated_at)}
                />
              </div>
            </SelenCard>

            <SelenCard>
              <SelenCardTitle>Adresse</SelenCardTitle>

              <div style={s.infoGrid}>
                <Info label="Adresse ligne 1" value={agent.address_line1} />
                <Info label="Adresse ligne 2" value={agent.address_line2} />
                <Info label="Code postal" value={agent.postal_code} />
                <Info label="Ville" value={agent.city} />
                <Info label="Pays" value={agent.country} />
              </div>
            </SelenCard>

            <SelenCard>
              <SelenCardTitle>Facturation</SelenCardTitle>

              <div style={s.infoGrid}>
                <Info label="Société" value={agent.company_name} />
                <Info label="SIRET" value={agent.siret} />
                <Info label="TVA" value={agent.vat_number} />
                <Info
                  label="Email de facturation"
                  value={agent.billing_email}
                />
              </div>

              {agent.billing_notes ? (
                <div style={{ marginTop: 16 }}>
                  <Info
                    label="Notes de facturation"
                    value={agent.billing_notes}
                    multiline
                  />
                </div>
              ) : null}
            </SelenCard>

            <SelenCard>
              <SelenCardTitle>Factures déposées</SelenCardTitle>

              {invoices.length === 0 ? (
                <p style={s.muted}>Aucune facture déposée pour le moment.</p>
              ) : (
                <div style={s.list}>
                  {invoices.map((invoice) => (
                    <div key={invoice.id} style={s.listItem}>
                      <div>
                        <p style={s.itemTitle}>
                          {invoice.invoice_number || "Facture sans numéro"}
                        </p>

                        <p style={s.itemMeta}>
                          {invoice.invoice_period || "Période non renseignée"} ·{" "}
                          {formatPrice(invoice.amount_cents, invoice.currency)}{" "}
                          · déposée le {formatDate(invoice.submitted_at)}
                        </p>
                      </div>

                      <div style={s.itemActions}>
                        <SelenBadge
                          variant={getInvoiceBadgeVariant(invoice.status)}
                          dot
                        >
                          {getInvoiceStatusLabel(invoice.status)}
                        </SelenBadge>

                        {invoice.public_url ? (
                          <a
                            href={invoice.public_url}
                            target="_blank"
                            rel="noreferrer"
                            style={s.textLink}
                          >
                            Ouvrir →
                          </a>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SelenCard>
          </section>

          <aside style={s.sideColumn}>
            <SelenCard>
              <SelenCardTitle>Dossiers attribués</SelenCardTitle>

              {dossiers.length === 0 ? (
                <p style={s.muted}>Aucun dossier attribué.</p>
              ) : (
                <div style={s.list}>
                  {dossiers.map((dossier) => (
                    <Link
                      key={dossier.id}
                      href={`/agent/dossiers/${dossier.id}`}
                      style={{
                        textDecoration: "none",
                        color: "inherit",
                      }}
                    >
                      <div style={s.sideListItem}>
                        <p style={s.itemTitle}>
                          {dossier.title || `Dossier ${dossier.id.slice(0, 8)}`}
                        </p>

                        <p style={s.itemMeta}>
                          {getTypeLabel(dossier.type)} ·{" "}
                          {getStatusLabel(dossier.status)}
                        </p>

                        <p style={s.textLink}>Ouvrir →</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </SelenCard>

            <SelenCard>
              <SelenCardTitle>Actions admin</SelenCardTitle>

              <p style={s.muted}>
                Vous pouvez modifier le rôle de cet accès ou le désactiver. Un
                accès désactivé ne doit plus pouvoir utiliser Studio.
              </p>

              <div style={s.actionStack}>
                <form action={updateAgentRole} style={s.adminForm}>
                  <input type="hidden" name="agent_id" value={agent.id} />

                  <label style={s.formLabel}>
                    Rôle Studio
                    <select
                      name="role"
                      defaultValue={agent.role}
                      style={s.selectInput}
                    >
                      <option value="agent">Agent</option>
                      <option value="admin">Admin</option>
                    </select>
                  </label>

                  <SelenButton variant="ghost">Modifier le rôle</SelenButton>
                </form>

                <form action={toggleAgentActive} style={s.adminForm}>
                  <input type="hidden" name="agent_id" value={agent.id} />
                  <input
                    type="hidden"
                    name="is_active"
                    value={agent.is_active ? "false" : "true"}
                  />

                  <SelenButton variant={agent.is_active ? "ghost" : "primary"}>
                    {agent.is_active
                      ? "Désactiver l’accès"
                      : "Réactiver l’accès"}
                  </SelenButton>
                </form>

                <Link
                  href="/agent/admin/factures"
                  style={{ textDecoration: "none" }}
                >
                  <SelenButton variant="primary">
                    Voir toutes les factures
                  </SelenButton>
                </Link>
              </div>
            </SelenCard>
          </aside>
        </div>
      </div>
    </main>
  );
}

function Info({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value?: string | null;
  multiline?: boolean;
}) {
  return (
    <div>
      <div style={s.infoLabel}>{label}</div>

      <div
        style={{
          ...s.infoValue,
          whiteSpace: multiline ? "pre-wrap" : "normal",
        }}
      >
        {value || "—"}
      </div>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "var(--selen-bg)",
    color: "var(--selen-text)",
  },
  container: {
    maxWidth: 1180,
    margin: "0 auto",
    padding: "24px 28px 64px",
  },
  breadcrumb: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    color: "var(--selen-text3)",
    marginBottom: 18,
  },
  breadcrumbLink: {
    color: "var(--selen-gold2)",
    textDecoration: "none",
  },
  breadcrumbSep: {
    opacity: 0.45,
  },
  breadcrumbCurrent: {
    color: "var(--selen-text2)",
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 18,
    flexWrap: "wrap",
    marginBottom: 22,
  },
  headerActions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  eyebrow: {
    fontFamily: "var(--font-display)",
    fontSize: 9,
    letterSpacing: "0.3em",
    textTransform: "uppercase",
    color: "var(--selen-gold)",
    opacity: 0.82,
    marginBottom: 8,
  },
  title: {
    fontFamily: "var(--font-display)",
    fontSize: 30,
    fontWeight: 600,
    letterSpacing: "0.02em",
    color: "var(--selen-text)",
    lineHeight: 1.15,
    margin: 0,
  },
  subtitle: {
    marginTop: 12,
    maxWidth: 720,
    fontSize: 13,
    lineHeight: 1.65,
    color: "var(--selen-text2)",
  },
  badgeRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 12,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.45fr) minmax(300px, 0.85fr)",
    gap: 16,
    alignItems: "start",
  },
  mainColumn: {
    display: "grid",
    gap: 16,
  },
  sideColumn: {
    display: "grid",
    gap: 16,
    position: "sticky",
    top: 18,
  },
  infoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
    gap: 14,
  },
  infoLabel: {
    fontSize: 10,
    color: "var(--selen-text3)",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 13,
    color: "var(--selen-text)",
    lineHeight: 1.5,
    wordBreak: "break-word",
  },
  muted: {
    fontSize: 13,
    color: "var(--selen-text3)",
    lineHeight: 1.6,
    margin: 0,
  },
  errorBox: {
    color: "var(--selen-danger)",
    whiteSpace: "pre-wrap",
    fontSize: 12,
  },
  list: {
    display: "grid",
    gap: 10,
  },
  listItem: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    gap: 12,
    alignItems: "center",
    padding: "12px 14px",
    borderRadius: "var(--radius-md)",
    background: "var(--selen-bg3)",
    border: "1px solid var(--selen-border)",
  },
  sideListItem: {
    padding: "12px 14px",
    borderRadius: "var(--radius-md)",
    background: "var(--selen-bg3)",
    border: "1px solid var(--selen-border)",
  },
  itemTitle: {
    fontSize: 13,
    color: "var(--selen-text)",
    fontWeight: 700,
    margin: 0,
    lineHeight: 1.4,
  },
  itemMeta: {
    fontSize: 12,
    color: "var(--selen-text2)",
    marginTop: 4,
    lineHeight: 1.45,
  },
  itemActions: {
    display: "grid",
    gap: 8,
    justifyItems: "end",
  },
  textLink: {
    fontSize: 12,
    color: "var(--selen-gold2)",
    textDecoration: "none",
    fontWeight: 700,
    marginTop: 6,
  },
  actionStack: {
    display: "grid",
    gap: 10,
    marginTop: 14,
  },
  adminForm: {
    display: "grid",
    gap: 10,
  },
  formLabel: {
    display: "grid",
    gap: 6,
    fontSize: 11,
    color: "var(--selen-text3)",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
  },
  selectInput: {
    width: "100%",
    background: "var(--selen-bg3)",
    border: "1px solid var(--selen-border)",
    borderRadius: "var(--radius-sm)",
    padding: "9px 10px",
    color: "var(--selen-text)",
    fontSize: 13,
    fontFamily: "var(--font-body)",
    outline: "none",
    boxSizing: "border-box",
  },
};
