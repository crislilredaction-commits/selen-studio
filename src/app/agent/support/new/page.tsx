"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import SelenButton from "@/components/ui/SelenButton";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";

const CATEGORIES = [
  ["question", "Question"],
  ["reclamation", "Réclamation"],
  ["daily", "Daily"],
  ["nda", "NDA"],
  ["audit", "Audit blanc"],
  ["paiement", "Paiement"],
  ["acces", "Accès"],
  ["bug", "Bug"],
  ["autre", "Autre"],
] as const;

const PRIORITIES = [
  ["low", "Basse"],
  ["normal", "Normale"],
  ["high", "Haute"],
  ["urgent", "Urgente"],
] as const;

export default function NewSupportTicketPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/agent/api/support/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: form.get("clientName"),
          clientEmail: form.get("clientEmail"),
          subject: form.get("subject"),
          category: form.get("category"),
          priority: form.get("priority"),
          message: form.get("message"),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Création impossible.");
      router.push(`/agent/support/${payload.ticketId}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Création impossible.");
      setSaving(false);
    }
  }

  return (
    <main style={s.page}>
      <div style={s.topline}>
        <div>
          <p style={s.eyebrow}>Studio agent</p>
          <h1 style={s.title}>Ouvrir un ticket manuellement</h1>
          <p style={s.subtitle}>
            Pour enregistrer une demande reçue par téléphone, email ou tout autre canal sans perdre l'historique support.
          </p>
        </div>
        <Link href="/agent/support" style={{ textDecoration: "none" }}>
          <SelenButton type="button" variant="secondary">Retour au support</SelenButton>
        </Link>
      </div>

      <SelenCard>
        <SelenCardTitle>Demande du client</SelenCardTitle>
        <form onSubmit={submit} style={s.form}>
          <div style={s.twoCols}>
            <label style={s.field}>
              <span>Nom du client</span>
              <input name="clientName" autoComplete="name" style={s.input} />
            </label>
            <label style={s.field}>
              <span>Email du client *</span>
              <input name="clientEmail" type="email" required autoComplete="email" style={s.input} />
            </label>
          </div>

          <label style={s.field}>
            <span>Sujet *</span>
            <input name="subject" required maxLength={180} style={s.input} />
          </label>

          <div style={s.twoCols}>
            <label style={s.field}>
              <span>Catégorie</span>
              <select name="category" defaultValue="question" style={s.input}>
                {CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label style={s.field}>
              <span>Priorité</span>
              <select name="priority" defaultValue="normal" style={s.input}>
                {PRIORITIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </div>

          <label style={s.field}>
            <span>Demande initiale *</span>
            <textarea
              name="message"
              required
              rows={8}
              style={s.textarea}
              placeholder="Saisissez fidèlement la demande reçue du client."
            />
          </label>

          {error ? <div style={s.error}>{error}</div> : null}

          <div style={s.actions}>
            <SelenButton type="submit" variant="primary" disabled={saving}>
              {saving ? "Création…" : "Créer le ticket"}
            </SelenButton>
            <Link href="/agent/support" style={{ textDecoration: "none" }}>
              <SelenButton type="button" variant="ghost">Annuler</SelenButton>
            </Link>
          </div>
        </form>
      </SelenCard>
    </main>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 900, margin: "0 auto", padding: "24px 28px 60px", color: "var(--selen-text)" },
  topline: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 18, flexWrap: "wrap", marginBottom: 18 },
  eyebrow: { margin: 0, fontFamily: "var(--font-display)", fontSize: 9, letterSpacing: ".3em", textTransform: "uppercase", color: "var(--selen-gold)" },
  title: { margin: "7px 0", fontFamily: "var(--font-display)", fontSize: 30 },
  subtitle: { margin: 0, maxWidth: 680, color: "var(--selen-text2)", lineHeight: 1.6, fontSize: 13 },
  form: { display: "grid", gap: 16, marginTop: 18 },
  twoCols: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 },
  field: { display: "grid", gap: 7, color: "var(--selen-text2-oncard)", fontSize: 12, fontWeight: 700 },
  input: { width: "100%", minHeight: 42, boxSizing: "border-box", borderRadius: "var(--radius-sm)", border: "1px solid rgba(120,90,50,.34)", background: "#f7ecd8", color: "#3b281b", padding: "0 12px", fontSize: 14 },
  textarea: { width: "100%", boxSizing: "border-box", borderRadius: "var(--radius-sm)", border: "2px solid rgba(120,90,50,.42)", background: "#fff8ea", color: "#3b281b", padding: 12, fontSize: 14, lineHeight: 1.5, resize: "vertical" },
  actions: { display: "flex", gap: 9, flexWrap: "wrap" },
  error: { border: "1px solid rgba(176,74,74,.32)", background: "var(--selen-danger-bg)", color: "var(--selen-danger)", padding: 11, borderRadius: "var(--radius-sm)" },
};
