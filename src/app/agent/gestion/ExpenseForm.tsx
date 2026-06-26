"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import SelenButton from "@/components/ui/SelenButton";

const initialState = {
  label: "",
  category: "",
  amount: "",
  expenseDate: new Date().toISOString().slice(0, 10),
  recurrence: "one_shot",
  notes: "",
};

export default function ExpenseForm() {
  const router = useRouter();
  const [form, setForm] = useState(initialState);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function update(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    const response = await fetch("/agent/api/gestion/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
    };

    if (!response.ok) {
      setError(payload.error ?? "Impossible d'ajouter la charge.");
      setSaving(false);
      return;
    }

    setForm({ ...initialState, expenseDate: new Date().toISOString().slice(0, 10) });
    setMessage("Charge ajoutee.");
    setSaving(false);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} style={s.form}>
      <div style={s.fields}>
        <input
          value={form.label}
          onChange={(event) => update("label", event.target.value)}
          placeholder="Libelle"
          style={s.input}
          required
        />
        <input
          value={form.category}
          onChange={(event) => update("category", event.target.value)}
          placeholder="Categorie"
          style={s.input}
        />
        <input
          value={form.amount}
          onChange={(event) => update("amount", event.target.value)}
          placeholder="Montant TTC"
          inputMode="decimal"
          style={s.input}
          required
        />
        <input
          value={form.expenseDate}
          onChange={(event) => update("expenseDate", event.target.value)}
          type="date"
          style={s.input}
          required
        />
        <select
          value={form.recurrence}
          onChange={(event) => update("recurrence", event.target.value)}
          style={s.input}
        >
          <option value="one_shot">Ponctuelle</option>
          <option value="monthly">Mensuelle</option>
          <option value="yearly">Annuelle</option>
        </select>
      </div>
      <textarea
        value={form.notes}
        onChange={(event) => update("notes", event.target.value)}
        placeholder="Notes internes"
        style={{ ...s.input, ...s.textarea }}
      />
      <div style={s.footer}>
        <SelenButton type="submit" disabled={saving}>
          {saving ? "Ajout..." : "Ajouter une charge"}
        </SelenButton>
        {message ? <span style={s.success}>{message}</span> : null}
        {error ? <span style={s.error}>{error}</span> : null}
      </div>
    </form>
  );
}

const s: Record<string, CSSProperties> = {
  form: { display: "grid", gap: 10 },
  fields: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 8,
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
  textarea: {
    minHeight: 74,
    padding: 12,
    resize: "vertical",
  },
  footer: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  success: { color: "var(--selen-success)", fontSize: 13 },
  error: { color: "var(--selen-danger)", fontSize: 13 },
};
