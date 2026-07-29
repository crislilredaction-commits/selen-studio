"use client";

import { useState } from "react";

export default function CorrectionComposer({ onAdd }: { onAdd: (content: string) => void }) {
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
        placeholder="Décrire précisément le point à reprendre…"
        onChange={(event) => setValue(event.target.value)}
      />
      <button className="forge-button forge-button--secondary" type="submit" disabled={!value.trim()}>
        Ajouter une correction
      </button>
    </form>
  );
}
