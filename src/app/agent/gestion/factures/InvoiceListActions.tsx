"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import SelenButton from "@/components/ui/SelenButton";

export default function InvoiceListActions({
  invoiceId,
  invoiceType,
  status,
  updatedAt,
}: {
  invoiceId: string;
  invoiceType: string;
  status: string;
  updatedAt: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [paid, setPaid] = useState(status === "paid");

  useEffect(() => {
    setPaid(status === "paid");
  }, [status]);

  async function markDeposited() {
    const confirmed = window.confirm(
      "Marquer cette facture comme deposee sur la plateforme certificateur ? Les audits lies seront archives.",
    );
    if (!confirmed) return;

    setBusy(true);
    setError("");
    setNotice("");
    const response = await fetch("/agent/api/gestion/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "mark_deposited",
        id: invoiceId,
        invoiceType,
        expectedUpdatedAt: updatedAt,
      }),
    });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(result.error ?? "Action impossible.");
      return;
    }
    setNotice("Depot enregistre.");
    router.refresh();
  }

  async function markPaid() {
    if (paid || !["generated", "deposited"].includes(status)) return;
    const previous = paid;
    setPaid(true);
    setBusy(true);
    setError("");
    setNotice("Enregistrement...");
    const response = await fetch("/agent/api/gestion/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "mark_paid",
        id: invoiceId,
        invoiceType,
        expectedUpdatedAt: updatedAt,
      }),
    });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setPaid(previous);
      setNotice("");
      setError(result.error ?? "Action impossible.");
      return;
    }
    setNotice("Paiement enregistre.");
    router.refresh();
  }

  if (!["generated", "deposited", "paid"].includes(status)) return null;

  return (
    <span style={s.wrap}>
      {status === "generated" ? (
        <SelenButton
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => void markDeposited()}
        >
          {busy ? "Depot..." : "Deposee plateforme"}
        </SelenButton>
      ) : null}
      <label style={s.paidLabel}>
        <input
          type="checkbox"
          checked={paid}
          disabled={busy || paid}
          onChange={() => void markPaid()}
        />
        <span>Payee</span>
      </label>
      {notice ? <span style={s.notice}>{notice}</span> : null}
      {error ? <span style={s.error}>{error}</span> : null}
    </span>
  );
}

const s: Record<string, CSSProperties> = {
  wrap: { display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" },
  paidLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    minHeight: 32,
    padding: "0 8px",
    border: "1px solid var(--selen-border)",
    borderRadius: "var(--radius-sm)",
    color: "var(--selen-text)",
    fontSize: 12,
    fontWeight: 700,
  },
  notice: { color: "var(--selen-success)", fontSize: 11 },
  error: { color: "var(--selen-danger)", fontSize: 11 },
};
