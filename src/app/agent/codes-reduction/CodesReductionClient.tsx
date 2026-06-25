"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { CSSProperties } from "react";
import SelenButton from "@/components/ui/SelenButton";

export type DiscountCodeRow = {
  id: string;
  code: string;
  client_email: string;
  ticket_id: string | null;
  discount_type: string;
  percent_off: number | null;
  amount_off_cents: number | null;
  currency: string | null;
  status: string;
  expires_at: string | null;
  used_at: string | null;
  used_by_email: string | null;
  created_by_agent_email: string | null;
  created_at: string | null;
};

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatAmount(cents?: number | null, currency = "eur") {
  if (!cents) return "-";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

function discountValue(code: DiscountCodeRow) {
  if (code.discount_type === "percent") return `${code.percent_off ?? 0}%`;
  return formatAmount(code.amount_off_cents, code.currency ?? "eur");
}

function isExpired(code: DiscountCodeRow) {
  return Boolean(code.expires_at && new Date(code.expires_at).getTime() < Date.now());
}

export default function CodesReductionClient({
  codes,
}: {
  codes: DiscountCodeRow[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setNotice(`Code ${code} copie.`);
      setError("");
    } catch {
      setError("Copie impossible dans ce navigateur.");
    }
  }

  async function updateCode(codeId: string, action: string) {
    setBusyId(codeId);
    setNotice("");
    setError("");
    const response = await fetch("/agent/api/discount-codes/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codeId, action }),
    });
    const result = await response.json();
    setBusyId("");

    if (!response.ok) {
      setError(result.error ?? "Action impossible.");
      return;
    }

    setNotice("Code mis a jour.");
    router.refresh();
  }

  return (
    <>
      {notice ? <div style={s.notice}>{notice}</div> : null}
      {error ? <div style={s.error}>Erreur : {error}</div> : null}

      <section style={s.list}>
        {codes.map((code) => {
          const expired = isExpired(code);
          const canReactivate = !code.used_at && code.status !== "used" && !expired;
          return (
            <article key={code.id} style={s.card}>
              <div style={s.cardTop}>
                <div style={{ minWidth: 0 }}>
                  <div style={s.codeLine}>{code.code}</div>
                  <div style={s.metaLine}>{code.client_email}</div>
                </div>
                <span style={s.status}>{expired && code.status === "active" ? "expired" : code.status}</span>
              </div>

              <div style={s.grid}>
                <Info label="Type" value={code.discount_type === "percent" ? "Pourcentage" : "Montant fixe"} />
                <Info label="Valeur" value={discountValue(code)} />
                <Info label="Expiration" value={formatDate(code.expires_at)} />
                <Info label="Utilise le" value={formatDate(code.used_at)} />
                <Info label="Utilise par" value={code.used_by_email || "-"} />
                <Info label="Cree par" value={code.created_by_agent_email || "-"} />
                <Info label="Cree le" value={formatDate(code.created_at)} />
                <Info label="Ticket" value={code.ticket_id || "-"} />
              </div>

              <div style={s.actions}>
                <SelenButton
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => void copyCode(code.code)}
                >
                  Copier
                </SelenButton>
                {code.ticket_id ? (
                  <Link
                    href={`/agent/support/${code.ticket_id}`}
                    style={{ textDecoration: "none" }}
                  >
                    <SelenButton type="button" size="sm" variant="secondary">
                      Ouvrir le ticket
                    </SelenButton>
                  </Link>
                ) : null}
                {code.status === "active" && !expired ? (
                  <>
                    <SelenButton
                      type="button"
                      size="sm"
                      variant="danger"
                      disabled={busyId === code.id}
                      onClick={() => void updateCode(code.id, "cancel")}
                    >
                      Annuler
                    </SelenButton>
                    <SelenButton
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={busyId === code.id}
                      onClick={() => void updateCode(code.id, "mark_used")}
                    >
                      Marquer utilise
                    </SelenButton>
                  </>
                ) : null}
                {code.status !== "active" && canReactivate ? (
                  <SelenButton
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={busyId === code.id}
                    onClick={() => void updateCode(code.id, "reactivate")}
                  >
                    Reactiver
                  </SelenButton>
                ) : null}
              </div>
            </article>
          );
        })}
      </section>
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div style={s.info}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  list: { display: "grid", gap: 12 },
  card: {
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--selen-border)",
    background: "var(--selen-card-texture), var(--selen-card)",
    padding: 16,
  },
  cardTop: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 12,
  },
  codeLine: {
    fontFamily: "var(--font-display)",
    fontSize: 22,
    color: "var(--selen-text-oncard)",
  },
  metaLine: {
    color: "var(--selen-text2-oncard)",
    fontSize: 13,
    marginTop: 4,
    overflowWrap: "anywhere",
  },
  status: {
    borderRadius: 999,
    border: "1px solid var(--selen-border)",
    padding: "5px 10px",
    color: "var(--selen-gold2)",
    fontSize: 11,
    background: "rgba(201, 148, 58, 0.14)",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 8,
  },
  info: {
    display: "grid",
    gap: 4,
    padding: 10,
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--selen-border)",
    background: "rgba(247, 239, 224, 0.06)",
    color: "var(--selen-text3-oncard)",
    fontSize: 11,
  },
  actions: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: "flex-end",
    marginTop: 12,
  },
  notice: {
    marginBottom: 14,
    padding: 12,
    borderRadius: "var(--radius-sm)",
    border: "1px solid rgba(126, 201, 126, 0.32)",
    background: "var(--selen-success-bg)",
    color: "var(--selen-success)",
    fontSize: 13,
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
