import Link from "next/link";
import type { CSSProperties } from "react";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import SelenBadge from "@/components/ui/SelenBadge";
import SelenButton from "@/components/ui/SelenButton";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

type SupportTicket = {
  id: string;
  client_email: string;
  client_name: string | null;
  subject: string;
  category: string;
  status: string;
  priority: string;
  resolution_type: string | null;
  assigned_agent_email: string | null;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
};

type PageProps = {
  searchParams?: Promise<{
    q?: string;
    status?: string;
    category?: string;
  }>;
};

const STATUS_FILTERS = [
  ["active", "A traiter"],
  ["waiting_client", "En attente client"],
  ["closed", "Resolus / clotures"],
  ["all", "Tous"],
];

const CATEGORY_FILTERS = [
  ["all", "Toutes categories"],
  ["question", "Question"],
  ["reclamation", "Reclamation"],
  ["paiement", "Paiement"],
  ["acces", "Acces"],
  ["bug", "Bug"],
  ["audit", "Audit"],
  ["nda", "NDA"],
  ["autre", "Autre"],
];

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusLabel(status: string) {
  if (status === "open") return "Ouvert";
  if (status === "waiting_agent") return "A traiter";
  if (status === "waiting_client") return "En attente client";
  if (status === "resolved") return "Resolu";
  if (status === "closed") return "Cloture";
  return status;
}

function statusVariant(
  status: string,
): "info" | "warn" | "success" | "neutral" {
  if (status === "resolved" || status === "closed") return "success";
  if (status === "waiting_client") return "info";
  if (status === "waiting_agent" || status === "open") return "warn";
  return "neutral";
}

function categoryLabel(category: string) {
  if (category === "question") return "Question";
  if (category === "reclamation") return "Reclamation";
  if (category === "paiement") return "Paiement";
  if (category === "acces") return "Acces";
  if (category === "bug") return "Bug";
  if (category === "audit") return "Audit blanc";
  if (category === "nda") return "NDA";
  return "Autre";
}

function priorityLabel(priority: string) {
  if (priority === "urgent") return "Urgent";
  if (priority === "high") return "Haute";
  if (priority === "low") return "Basse";
  return "Normale";
}

function priorityRank(priority: string) {
  if (priority === "urgent") return 0;
  if (priority === "high") return 1;
  if (priority === "normal") return 2;
  if (priority === "low") return 3;
  return 4;
}

function activityTime(ticket: SupportTicket) {
  return new Date(ticket.last_message_at || ticket.updated_at || 0).getTime();
}

function matchesStatus(ticket: SupportTicket, filter: string) {
  if (filter === "all") return true;
  if (filter === "waiting_client") return ticket.status === "waiting_client";
  if (filter === "closed")
    return ["resolved", "closed"].includes(ticket.status);
  return ["open", "waiting_agent"].includes(ticket.status);
}

function matchesSearch(ticket: SupportTicket, query: string) {
  if (!query) return true;
  const haystack = [
    ticket.client_name,
    ticket.client_email,
    ticket.subject,
    ticket.category,
    ticket.assigned_agent_email,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

export default async function AgentSupportPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const query = String(params.q ?? "").trim();
  const statusFilter = String(params.status ?? "active");
  const categoryFilter = String(params.category ?? "all");
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("support_tickets")
    .select("*")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false });

  const tickets = (data ?? []) as SupportTicket[];
  const activeTickets = tickets.filter((ticket) =>
    ["open", "waiting_agent"].includes(ticket.status),
  );
  const waitingClient = tickets.filter(
    (ticket) => ticket.status === "waiting_client",
  );
  const closedTickets = tickets.filter((ticket) =>
    ["resolved", "closed"].includes(ticket.status),
  );

  const visibleTickets = tickets
    .filter((ticket) => {
      const categoryMatches =
        categoryFilter === "all" || ticket.category === categoryFilter;
      return (
        matchesStatus(ticket, statusFilter) &&
        categoryMatches &&
        matchesSearch(ticket, query)
      );
    })
    .sort((a, b) => {
      const priorityDelta = priorityRank(a.priority) - priorityRank(b.priority);
      if (priorityDelta !== 0) return priorityDelta;
      return activityTime(b) - activityTime(a);
    });

  return (
    <main style={s.page}>
      <header style={s.header}>
        <div>
          <p style={s.eyebrow}>Studio agent</p>
          <h1 style={s.title}>Support client</h1>
          <p style={s.subtitle}>
            Historique complet des demandes support, avec recherche par client,
            email, sujet ou categorie.
          </p>
        </div>

        <div style={s.stats}>
          <MiniStat label="A traiter" value={activeTickets.length} />
          <MiniStat label="En attente client" value={waitingClient.length} />
          <MiniStat label="Clotures" value={closedTickets.length} />
        </div>
      </header>

      {error ? (
        <div style={s.error}>Erreur Supabase : {error.message}</div>
      ) : null}

      <SelenCard>
        <form style={s.filters}>
          <label style={s.field}>
            <span>Recherche</span>
            <input
              name="q"
              defaultValue={query}
              placeholder="Nom, email, sujet, categorie..."
              style={s.input}
            />
          </label>
          <label style={s.field}>
            <span>Statut</span>
            <select name="status" defaultValue={statusFilter} style={s.input}>
              {STATUS_FILTERS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label style={s.field}>
            <span>Categorie</span>
            <select
              name="category"
              defaultValue={categoryFilter}
              style={s.input}
            >
              {CATEGORY_FILTERS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div style={s.filterActions}>
            <SelenButton type="submit" variant="primary">
              Filtrer
            </SelenButton>
            <Link href="/agent/support" style={{ textDecoration: "none" }}>
              <SelenButton type="button" variant="ghost">
                Reinitialiser
              </SelenButton>
            </Link>
          </div>
        </form>
      </SelenCard>

      <div style={s.resultLine}>
        {visibleTickets.length} ticket{visibleTickets.length > 1 ? "s" : ""}{" "}
        affiche
        {visibleTickets.length > 1 ? "s" : ""}
      </div>

      {visibleTickets.length === 0 ? (
        <SelenCard>
          <SelenCardTitle>Aucun ticket support trouve.</SelenCardTitle>
          <p style={s.emptyText}>
            Ajustez la recherche ou passez le filtre statut sur Tous pour
            consulter tout les tickets.
          </p>
        </SelenCard>
      ) : (
        <section style={s.list}>
          {visibleTickets.map((ticket) => (
            <SelenCard key={ticket.id}>
              <div style={s.ticketHeader}>
                <div style={{ minWidth: 0 }}>
                  <div style={s.badges}>
                    <SelenBadge variant="type" dot>
                      {categoryLabel(ticket.category)}
                    </SelenBadge>
                    <SelenBadge variant={statusVariant(ticket.status)} dot>
                      {statusLabel(ticket.status)}
                    </SelenBadge>
                    <SelenBadge variant="neutral" dot>
                      {priorityLabel(ticket.priority)}
                    </SelenBadge>
                  </div>

                  <h2 style={s.ticketTitle}>{ticket.subject}</h2>

                  <p style={s.clientLine}>
                    {ticket.client_name || "Client"} - {ticket.client_email}
                  </p>

                  <div style={s.metaGrid}>
                    <span>
                      Derniere activite :{" "}
                      {formatDate(ticket.last_message_at || ticket.updated_at)}
                    </span>
                    <span>
                      Agent traitant :{" "}
                      {ticket.assigned_agent_email || "Non attribue"}
                    </span>
                  </div>
                </div>

                <Link
                  href={`/agent/support/${ticket.id}`}
                  style={{ textDecoration: "none", flexShrink: 0 }}
                >
                  <SelenButton type="button" variant="primary">
                    Ouvrir le ticket
                  </SelenButton>
                </Link>
              </div>
            </SelenCard>
          ))}
        </section>
      )}
    </main>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div style={s.stat}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  page: {
    maxWidth: 1220,
    margin: "0 auto",
    padding: "24px 28px 48px",
    color: "var(--selen-text)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 18,
    alignItems: "flex-start",
    flexWrap: "wrap",
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
    fontSize: 30,
    lineHeight: 1.15,
    margin: "8px 0",
  },
  subtitle: {
    color: "var(--selen-text2)",
    fontSize: 13,
    margin: 0,
    maxWidth: 720,
    lineHeight: 1.6,
  },
  stats: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(130px, 1fr))",
    gap: 10,
  },
  stat: {
    minWidth: 130,
    padding: 12,
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--selen-border)",
    background: "var(--selen-card-texture), var(--selen-card)",
    display: "grid",
    gap: 4,
    color: "var(--selen-text2-oncard)",
    fontSize: 12,
  },
  filters: {
    display: "grid",
    gridTemplateColumns:
      "minmax(220px, 1fr) minmax(170px, 0.45fr) minmax(170px, 0.45fr) auto",
    gap: 12,
    alignItems: "end",
  },
  field: {
    display: "grid",
    gap: 6,
    color: "var(--selen-text2-oncard)",
    fontSize: 12,
  },
  input: {
    width: "100%",
    minHeight: 40,
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--selen-border)",
    background: "var(--selen-bg2)",
    color: "var(--selen-text)",
    padding: "0 12px",
    fontSize: 13,
    boxSizing: "border-box",
  },
  filterActions: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  resultLine: {
    color: "var(--selen-text2)",
    fontSize: 12,
    margin: "14px 0 10px",
  },
  list: { display: "grid", gap: 12 },
  ticketHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
  },
  badges: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 },
  ticketTitle: {
    margin: 0,
    color: "var(--selen-text-oncard)",
    fontFamily: "var(--font-display)",
    fontSize: 22,
    lineHeight: 1.2,
  },
  clientLine: {
    color: "var(--selen-text2-oncard)",
    marginTop: 8,
    fontSize: 13,
  },
  metaGrid: {
    display: "grid",
    gap: 5,
    color: "var(--selen-text3-oncard)",
    fontSize: 12,
    marginTop: 6,
  },
  emptyText: { color: "var(--selen-text2-oncard)", lineHeight: 1.6 },
  error: {
    marginBottom: 14,
    padding: 12,
    borderRadius: "var(--radius-sm)",
    border: "1px solid rgba(176, 74, 74, 0.32)",
    background: "var(--selen-danger-bg)",
    color: "var(--selen-danger)",
    fontSize: 13,
  },
};
