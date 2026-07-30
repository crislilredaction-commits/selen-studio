"use client";

import { useState } from "react";

export default function CorrectionComposer({ onAdd, disabled = false }: { onAdd: (content: string) => void; disabled?: boolean }) {
  const [value, setValue] = useState("");
  return (
    <form
      className="forge-correction-form"
      onSubmit={(event) => {
        event.preventDefault();
        const content = value.trim();
        if (!content) return;
        onAdd(content);
        setValue("");
      }}
    >
      <label htmlFor="forge-correction">Demande de correction</label>
      <textarea
        id="forge-correction"
        rows={3}
        value={value}
        disabled={disabled}
        placeholder="Décrire précisément le point à reprendre…"
        onChange={(event) => setValue(event.target.value)}
      />
      <button className="forge-button forge-button--secondary" type="submit" disabled={disabled || !value.trim()}>
        Ajouter une correction
      </button>
    </form>
  );
}
