import Link from "next/link";
import type { CSSProperties } from "react";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import SelenButton from "@/components/ui/SelenButton";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import CodesReductionClient, {
  type DiscountCodeRow,
} from "@/app/agent/codes-reduction/CodesReductionClient";
import DiscountCodeCreateForm from "@/app/agent/codes-reduction/DiscountCodeCreateForm";

type PageProps = {
  searchParams?: Promise<{
    code?: string;
    email?: string;
    status?: string;
  }>;
};

const STATUS_FILTERS = [
  ["all", "Tous"],
  ["active", "Actifs"],
  ["used", "Utilises"],
  ["cancelled", "Annules"],
  ["expired", "Expires"],
];

function isExpired(code: DiscountCodeRow) {
  return Boolean(code.expires_at && new Date(code.expires_at).getTime() < Date.now());
}

function matchesStatus(code: DiscountCodeRow, status: string) {
  if (status === "all") return true;
  if (status === "expired") return isExpired(code) || code.status === "expired";
  if (status === "active") return code.status === "active" && !isExpired(code);
  return code.status === status;
}

export default async function AgentCodesReductionPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const codeQuery = String(params.code ?? "").trim().toLowerCase();
  const emailQuery = String(params.email ?? "").trim().toLowerCase();
  const statusFilter = String(params.status ?? "active");
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("discount_codes")
    .select("*")
    .order("created_at", { ascending: false });

  const codes = ((data ?? []) as DiscountCodeRow[]).filter((item) => {
    const codeMatches = !codeQuery || item.code.toLowerCase().includes(codeQuery);
    const emailMatches =
      !emailQuery || (item.client_email ?? "").toLowerCase().includes(emailQuery);
    return codeMatches && emailMatches && matchesStatus(item, statusFilter);
  });

  const activeCount = ((data ?? []) as DiscountCodeRow[]).filter(
    (item) => item.status === "active" && !isExpired(item),
  ).length;
  const usedCount = ((data ?? []) as DiscountCodeRow[]).filter(
    (item) => item.status === "used",
  ).length;
  const cancelledCount = ((data ?? []) as DiscountCodeRow[]).filter(
    (item) => item.status === "cancelled",
  ).length;
  const expiredCount = ((data ?? []) as DiscountCodeRow[]).filter((item) =>
    isExpired(item),
  ).length;

  return (
    <main style={s.page}>
      <header style={s.header}>
        <div>
          <p style={s.eyebrow}>Studio SAV</p>
          <h1 style={s.title}>Codes de reduction</h1>
          <p style={s.subtitle}>
            Retrouvez les codes crees depuis les tickets support, suivez leur
            utilisation et conservez l'historique sans suppression physique.
          </p>
        </div>
        <Link href="/agent/support" style={{ textDecoration: "none" }}>
          <SelenButton type="button" variant="ghost">
            Retour support
          </SelenButton>
        </Link>
      </header>

      <div style={s.stats}>
        <MiniStat label="Actifs" value={activeCount} />
        <MiniStat label="Utilises" value={usedCount} />
        <MiniStat label="Annules" value={cancelledCount} />
        <MiniStat label="Expires" value={expiredCount} />
      </div>

      {error ? <div style={s.error}>Erreur Supabase : {error.message}</div> : null}

      <div style={{ marginBottom: 14 }}>
        <DiscountCodeCreateForm />
      </div>

      <SelenCard>
        <form style={s.filters}>
          <label style={s.field}>
            <span>Code</span>
            <input
              name="code"
              defaultValue={codeQuery}
              placeholder="SELEN-..."
              style={s.input}
            />
          </label>
          <label style={s.field}>
            <span>Email client</span>
            <input
              name="email"
              defaultValue={emailQuery}
              placeholder="client@email.fr"
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
          <div style={s.filterActions}>
            <SelenButton type="submit" variant="primary">
              Filtrer
            </SelenButton>
            <Link href="/agent/codes-reduction" style={{ textDecoration: "none" }}>
              <SelenButton type="button" variant="ghost">
                Reinitialiser
              </SelenButton>
            </Link>
          </div>
        </form>
      </SelenCard>

      <div style={s.resultLine}>
        {codes.length} code{codes.length > 1 ? "s" : ""} affiche
        {codes.length > 1 ? "s" : ""}
      </div>

      {codes.length === 0 ? (
        <SelenCard>
          <SelenCardTitle>Aucun code trouve.</SelenCardTitle>
          <p style={s.emptyText}>Ajustez la recherche ou passez sur Tous.</p>
        </SelenCard>
      ) : (
        <CodesReductionClient codes={codes} />
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
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: 10,
    marginBottom: 14,
  },
  stat: {
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
    gridTemplateColumns: "minmax(180px, 0.7fr) minmax(220px, 1fr) minmax(160px, 0.45fr) auto",
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
    border: "1px solid rgba(120, 90, 50, 0.32)",
    background: "#f7ecd8",
    color: "#3b281b",
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
