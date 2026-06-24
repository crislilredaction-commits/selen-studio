"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { createClient } from "@/lib/supabase/client";
import SelenBadge from "@/components/ui/SelenBadge";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";

type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;
type JsonObject = { [key: string]: JsonValue };
type SurveyRow = Record<string, JsonValue> & { id: string };

function text(value: JsonValue | undefined) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function first(row: SurveyRow, keys: string[]) {
  for (const key of keys) {
    const value = text(row[key]);
    if (value) return value;
  }
  return "";
}

function objectValue(row: SurveyRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value && typeof value === "object") return value;
  }
  return null;
}

function formatDate(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function surveyType(row: SurveyRow) {
  const raw = first(row, ["survey_type", "type", "context"]).toLowerCase();
  if (raw.includes("review") || raw.includes("audit")) return "Review";
  if (raw.includes("preaudit") || raw.includes("préaudit")) return "Préaudit";
  return raw || "Non renseigné";
}

export default function AgentSatisfactionPage() {
  const supabase = useMemo(() => createClient(), []);
  const [surveys, setSurveys] = useState<SurveyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  useEffect(() => {
    async function loadSurveys() {
      setLoading(true);
      const { data, error: loadError } = await supabase
        .from("satisfaction_surveys")
        .select("*")
        .order("created_at", { ascending: false });

      if (loadError) {
        setError(loadError.message);
        setLoading(false);
        return;
      }

      setSurveys(((data ?? []) as SurveyRow[]).filter((row) => row.id));
      setLoading(false);
    }

    void loadSurveys();
  }, [supabase]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return surveys.filter((row) => {
      const type = surveyType(row).toLowerCase();
      const haystack = [
        first(row, ["client_id"]),
        first(row, ["dossier_id"]),
        first(row, ["audit_blanc_case_id"]),
        first(row, ["email", "client_email"]),
        first(row, ["first_name", "last_name", "name"]),
        row.id,
      ]
        .join(" ")
        .toLowerCase();

      return (
        (!q || haystack.includes(q)) &&
        (typeFilter === "all" || type === typeFilter)
      );
    });
  }, [search, surveys, typeFilter]);

  return (
    <main style={s.page}>
      <header style={s.header}>
        <div>
          <p style={s.eyebrow}>Studio agent</p>
          <h1 style={s.title}>Satisfaction</h1>
          <p style={s.subtitle}>
            Retours clients collectés par la Vitrine, consultables en suivi agent.
          </p>
        </div>
      </header>

      {error ? <div style={s.error}>Erreur Supabase : {error}</div> : null}

      <SelenCard>
        <SelenCardTitle>Filtres</SelenCardTitle>
        <div style={s.toolbar}>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher client, dossier, email..."
            style={s.input}
            type="search"
          />
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            style={s.input}
          >
            <option value="all">Tous les types</option>
            <option value="préaudit">Préaudit</option>
            <option value="review">Review</option>
          </select>
        </div>
      </SelenCard>

      <section style={s.list}>
        {loading ? (
          <SelenCard>Chargement des réponses...</SelenCard>
        ) : filtered.length === 0 ? (
          <SelenCard>Aucune réponse satisfaction ne correspond aux filtres.</SelenCard>
        ) : (
          filtered.map((row) => {
            const detailedAnswers = objectValue(row, [
              "answers",
              "responses",
              "detailed_answers",
              "details",
            ]);

            return (
              <SelenCard key={row.id}>
                <div style={s.rowHeader}>
                  <div style={s.badges}>
                    <SelenBadge variant="type" dot>
                      {surveyType(row)}
                    </SelenBadge>
                    <SelenBadge variant="success" dot>
                      Note {first(row, ["overall_rating", "global_rating", "rating", "score"]) || "—"}
                    </SelenBadge>
                  </div>
                  <span style={s.date}>
                    {formatDate(first(row, ["submitted_at", "responded_at", "created_at"]))}
                  </span>
                </div>

                <div style={s.grid}>
                  <Info label="Client" value={first(row, ["client_id"])} mono />
                  <Info label="Dossier" value={first(row, ["dossier_id"])} mono />
                  <Info
                    label="Audit blanc"
                    value={first(row, ["audit_blanc_case_id"])}
                    mono
                  />
                  <Info label="Email" value={first(row, ["email", "client_email"])} />
                  <Info
                    label="Autorisation témoignage"
                    value={first(row, ["testimonial_authorized", "testimonial_consent", "can_publish_testimonial"])}
                  />
                </div>

                {first(row, ["comment", "free_comment", "message"]) ? (
                  <div style={s.comment}>
                    <strong>Commentaire libre</strong>
                    <p>{first(row, ["comment", "free_comment", "message"])}</p>
                  </div>
                ) : null}

                {detailedAnswers ? (
                  <details style={s.details} open>
                    <summary style={s.summary}>Réponses détaillées</summary>
                    <pre style={s.pre}>{JSON.stringify(detailedAnswers, null, 2)}</pre>
                  </details>
                ) : null}
              </SelenCard>
            );
          })
        )}
      </section>
    </main>
  );
}

function Info({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div style={s.info}>
      <span style={s.infoLabel}>{label}</span>
      <span style={{ ...s.infoValue, fontFamily: mono ? "monospace" : undefined }}>
        {value || "—"}
      </span>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  page: {
    maxWidth: 1180,
    margin: "0 auto",
    padding: "24px 28px 48px",
    color: "var(--selen-text)",
  },
  header: { marginBottom: 20 },
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
  subtitle: { color: "var(--selen-text2)", fontSize: 13, margin: 0 },
  toolbar: {
    display: "grid",
    gridTemplateColumns: "minmax(220px, 1fr) minmax(160px, 240px)",
    gap: 10,
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
  },
  list: { display: "grid", gap: 12, marginTop: 14 },
  rowHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    alignItems: "center",
  },
  badges: { display: "flex", gap: 8, flexWrap: "wrap" },
  date: { color: "var(--selen-text3-oncard)", fontSize: 12 },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 10,
    marginTop: 16,
  },
  info: {
    padding: 10,
    borderRadius: "var(--radius-sm)",
    background: "rgba(247, 239, 224, 0.06)",
    border: "1px solid var(--selen-border)",
    minWidth: 0,
  },
  infoLabel: {
    display: "block",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    color: "var(--selen-text3-oncard)",
    marginBottom: 5,
  },
  infoValue: {
    display: "block",
    fontSize: 13,
    color: "var(--selen-text-oncard)",
    overflowWrap: "anywhere",
  },
  comment: {
    marginTop: 14,
    padding: 12,
    borderRadius: "var(--radius-sm)",
    background: "rgba(201, 148, 58, 0.08)",
    color: "var(--selen-text2-oncard)",
    fontSize: 13,
    lineHeight: 1.5,
  },
  details: { marginTop: 12 },
  summary: { cursor: "pointer", color: "var(--selen-gold2)", fontSize: 13 },
  pre: {
    marginTop: 10,
    padding: 12,
    borderRadius: "var(--radius-sm)",
    background: "rgba(10, 8, 6, 0.32)",
    color: "var(--selen-text2-oncard)",
    overflowX: "auto",
    fontSize: 12,
    lineHeight: 1.55,
  },
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
