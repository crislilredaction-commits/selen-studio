"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import SelenButton from "@/components/ui/SelenButton";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import { centsToEuros } from "@/lib/lilInvoiceShared";

type PreviewAudit = {
  id: string;
  ofName: string;
  auditDate: string;
  reference: string;
  amountCents: number;
  travelExpenseCents: number;
};

type Preview = {
  auditCount: number;
  audits: PreviewAudit[];
  totalCents: number;
};

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(
    new Date(`${value}T12:00:00`),
  );
}

export default function IcpfMonthlyInvoiceCard() {
  const router = useRouter();
  const [month, setMonth] = useState(currentMonth());
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadPreview() {
    setBusy("preview");
    setError("");
    setNotice("");
    const response = await fetch(`/agent/api/gestion/invoices/icpf-monthly?month=${month}`);
    const result = await response.json().catch(() => ({}));
    setBusy("");
    if (!response.ok) {
      setError(result.error ?? "Apercu impossible.");
      setPreview(null);
      return;
    }
    setPreview(result as Preview);
    setNotice(
      result.auditCount > 0
        ? `${result.auditCount} audit(s) ICPF pret(s) a facturer.`
        : "Aucun audit ICPF eligible pour ce mois.",
    );
  }

  async function createDraft() {
    setBusy("create");
    setError("");
    setNotice("");
    const response = await fetch("/agent/api/gestion/invoices/icpf-monthly", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month }),
    });
    const result = await response.json().catch(() => ({}));
    setBusy("");
    if (!response.ok) {
      setError(result.error ?? "Creation impossible.");
      return;
    }
    router.push(`/agent/gestion/factures/${result.invoice.id}`);
  }

  return (
    <SelenCard style={{ marginBottom: 14 }}>
      <div style={s.header}>
        <div>
          <SelenCardTitle>Creer facture ICPF mensuelle</SelenCardTitle>
          <p style={s.muted}>
            Audits ICPF du mois en statut A facturer, non archives et non deja lies a une facture.
          </p>
        </div>
        <div style={s.controls}>
          <input
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            style={s.input}
          />
          <SelenButton
            type="button"
            variant="ghost"
            disabled={Boolean(busy)}
            onClick={() => void loadPreview()}
          >
            {busy === "preview" ? "Chargement..." : "Apercu"}
          </SelenButton>
          <SelenButton
            type="button"
            disabled={Boolean(busy) || preview?.auditCount === 0}
            onClick={() => void createDraft()}
          >
            {busy === "create" ? "Creation..." : "Creer brouillon"}
          </SelenButton>
        </div>
      </div>
      {notice ? <div style={s.notice}>{notice}</div> : null}
      {error ? <div style={s.error}>Erreur : {error}</div> : null}
      {preview ? (
        <div style={s.preview}>
          <strong>Total previsionnel : {centsToEuros(preview.totalCents)}</strong>
          {preview.audits.map((audit) => (
            <div key={audit.id} style={s.auditRow}>
              <span>
                {formatDate(audit.auditDate)} - Ref. {audit.reference} - {audit.ofName}
              </span>
              <span>
                {centsToEuros(audit.amountCents)}
                {audit.travelExpenseCents > 0
                  ? ` + ${centsToEuros(audit.travelExpenseCents)} frais`
                  : ""}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </SelenCard>
  );
}

const s: Record<string, CSSProperties> = {
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  controls: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
  input: {
    minHeight: 40,
    borderRadius: "var(--radius-sm)",
    border: "1px solid rgba(120, 90, 50, 0.32)",
    background: "#f7ecd8",
    color: "#3b281b",
    padding: "0 12px",
    fontSize: 13,
  },
  muted: { color: "var(--selen-text2)", fontSize: 13, lineHeight: 1.5, margin: "6px 0 0" },
  preview: { display: "grid", gap: 8, marginTop: 12, color: "var(--selen-text2)", fontSize: 13 },
  auditRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    padding: "8px 0",
    borderTop: "1px solid var(--selen-border)",
  },
  notice: {
    marginTop: 12,
    padding: 10,
    borderRadius: "var(--radius-sm)",
    border: "1px solid rgba(126, 201, 126, 0.32)",
    background: "var(--selen-success-bg)",
    color: "var(--selen-success)",
    fontSize: 13,
  },
  error: {
    marginTop: 12,
    padding: 10,
    borderRadius: "var(--radius-sm)",
    border: "1px solid rgba(176, 74, 74, 0.32)",
    background: "var(--selen-danger-bg)",
    color: "var(--selen-danger)",
    fontSize: 13,
  },
};
