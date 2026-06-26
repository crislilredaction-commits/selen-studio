"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import SelenButton from "@/components/ui/SelenButton";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";

const OFFERS = [
  ["", "Toutes les offres"],
  ["preaudit", "Préaudit"],
  ["audit-blanc", "Audit blanc"],
  ["review", "Review"],
  ["nda", "NDA"],
];

export default function DiscountCodeCreateForm() {
  const router = useRouter();
  const [mode, setMode] = useState("newsletter_public");
  const [discountType, setDiscountType] = useState("percent");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode !== "newsletter_public") return;

    const form = new FormData(event.currentTarget);
    setSaving(true);
    setNotice("");
    setError("");
    const response = await fetch("/agent/api/discount-codes/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: mode,
        code: form.get("code"),
        discountType,
        percentOff: form.get("percentOff"),
        amountOff: form.get("amountOff"),
        expiresAt: form.get("expiresAt"),
        maxGlobalUses: form.get("maxGlobalUses") || null,
        maxUsesPerEmail: form.get("maxUsesPerEmail") || 1,
        offerSlug: form.get("offerSlug"),
        internalComment: form.get("internalComment"),
      }),
    });
    const result = await response.json().catch(() => ({}));
    setSaving(false);

    if (!response.ok) {
      setError(result.error ?? "Creation impossible.");
      return;
    }

    setNotice("Code newsletter cree.");
    router.refresh();
    event.currentTarget.reset();
  }

  return (
    <SelenCard>
      <SelenCardTitle>Créer un code promotionnel</SelenCardTitle>
      {notice ? <div style={s.notice}>{notice}</div> : null}
      {error ? <div style={s.error}>Erreur : {error}</div> : null}
      <form onSubmit={submit} style={s.form}>
        <label style={s.field}>
          <span>Type de code</span>
          <select value={mode} onChange={(event) => setMode(event.target.value)} style={s.input}>
            <option value="support_ticket">Ticket support</option>
            <option value="newsletter_public">Newsletter publique</option>
          </select>
        </label>

        {mode === "support_ticket" ? (
          <p style={s.help}>
            Les codes liés à un ticket support restent créés depuis la fiche ticket,
            afin de conserver le lien SAV.
          </p>
        ) : (
          <>
            <label style={s.field}>
              <span>Code</span>
              <input name="code" placeholder="NEWSLETTER20" style={s.input} required />
            </label>
            <label style={s.field}>
              <span>Réduction</span>
              <select
                value={discountType}
                onChange={(event) => setDiscountType(event.target.value)}
                style={s.input}
              >
                <option value="percent">Pourcentage</option>
                <option value="amount">Montant</option>
              </select>
            </label>
            {discountType === "percent" ? (
              <label style={s.field}>
                <span>Pourcentage</span>
                <input name="percentOff" type="number" min="1" max="100" placeholder="20" style={s.input} required />
              </label>
            ) : (
              <label style={s.field}>
                <span>Montant EUR</span>
                <input name="amountOff" inputMode="decimal" placeholder="30" style={s.input} required />
              </label>
            )}
            <label style={s.field}>
              <span>Date expiration</span>
              <input name="expiresAt" type="datetime-local" style={s.input} />
            </label>
            <label style={s.field}>
              <span>Max utilisations globales</span>
              <input name="maxGlobalUses" type="number" min="1" placeholder="Illimité" style={s.input} />
            </label>
            <label style={s.field}>
              <span>Max utilisations par email</span>
              <input name="maxUsesPerEmail" type="number" min="1" defaultValue="1" style={s.input} />
            </label>
            <label style={s.field}>
              <span>Offre concernée</span>
              <select name="offerSlug" defaultValue="" style={s.input}>
                {OFFERS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label style={s.fieldFull}>
              <span>Commentaire interne</span>
              <textarea name="internalComment" style={{ ...s.input, minHeight: 76, paddingTop: 10 }} />
            </label>
            <div style={s.actions}>
              <SelenButton type="submit" disabled={saving}>
                {saving ? "Création..." : "Créer le code"}
              </SelenButton>
            </div>
          </>
        )}
      </form>
    </SelenCard>
  );
}

const s: Record<string, CSSProperties> = {
  form: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
  },
  field: {
    display: "grid",
    gap: 6,
    color: "var(--selen-text2-oncard)",
    fontSize: 12,
  },
  fieldFull: {
    display: "grid",
    gap: 6,
    color: "var(--selen-text2-oncard)",
    fontSize: 12,
    gridColumn: "1 / -1",
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
  help: {
    gridColumn: "1 / -1",
    color: "var(--selen-text2-oncard)",
    fontSize: 13,
    lineHeight: 1.6,
    margin: 0,
  },
  actions: { gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end" },
  notice: {
    marginBottom: 12,
    padding: 12,
    borderRadius: "var(--radius-sm)",
    border: "1px solid rgba(126, 201, 126, 0.32)",
    background: "var(--selen-success-bg)",
    color: "var(--selen-success)",
    fontSize: 13,
  },
  error: {
    marginBottom: 12,
    padding: 12,
    borderRadius: "var(--radius-sm)",
    border: "1px solid rgba(176, 74, 74, 0.32)",
    background: "var(--selen-danger-bg)",
    color: "var(--selen-danger)",
    fontSize: 13,
  },
};
