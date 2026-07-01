"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import SelenButton from "@/components/ui/SelenButton";

export default function InvoiceListActions({
  invoiceId,
  invoiceType,
  status,
}: {
  invoiceId: string;
  invoiceType: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function markDeposited() {
    const confirmed = window.confirm(
      "Marquer cette facture comme deposee sur la plateforme certificateur ? Les audits lies seront archives.",
    );
    if (!confirmed) return;

    setBusy(true);
    setError("");
    const response = await fetch("/agent/api/gestion/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "mark_deposited",
        id: invoiceId,
        invoiceType,
      }),
    });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(result.error ?? "Action impossible.");
      return;
    }
    router.refresh();
  }

  if (status !== "generated") return null;

  return (
    <span style={s.wrap}>
      <SelenButton
        type="button"
        size="sm"
        variant="secondary"
        disabled={busy}
        onClick={() => void markDeposited()}
      >
        {busy ? "Depot..." : "Deposee plateforme"}
      </SelenButton>
      {error ? <span style={s.error}>{error}</span> : null}
    </span>
  );
}

const s: Record<string, CSSProperties> = {
  wrap: { display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" },
  error: { color: "var(--selen-danger)", fontSize: 11 },
};
