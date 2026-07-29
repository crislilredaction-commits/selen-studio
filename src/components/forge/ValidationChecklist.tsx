"use client";

import { useState } from "react";
import type { CheckResult, ValidationItem } from "@/lib/forge/types";

function ValidationNote({
  item,
  onChange,
}: {
  item: ValidationItem;
  onChange: (id: string, patch: Partial<ValidationItem>) => void;
}) {
  const [value, setValue] = useState(item.note ?? "");

  return (
    <input
      type="text"
      value={value}
      placeholder="Note facultative"
      aria-label={`Note pour ${item.label}`}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => {
        if (value !== (item.note ?? "")) onChange(item.id, { note: value });
      }}
    />
  );
}

export default function ValidationChecklist({
  items,
  lastVerifiedAt,
  onChange,
}: {
  items: ValidationItem[];
  lastVerifiedAt?: string;
  onChange: (id: string, patch: Partial<ValidationItem>) => void;
}) {
  const verified = items.filter((item) => item.checked).length;
  return (
    <section>
      <div className="forge-check-summary">
        <strong>{verified}/{items.length} points vérifiés</strong>
        <span>{items.length - verified} restant{items.length - verified > 1 ? "s" : ""}</span>
        <span>
          Dernière vérification : {lastVerifiedAt ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(lastVerifiedAt)) : "aucune"}
        </span>
      </div>
      <div className="forge-checklist">
        {items.map((item) => (
          <div className="forge-check-item" key={item.id}>
            <label>
              <input
                type="checkbox"
                checked={item.checked}
                onChange={(event) =>
                  onChange(item.id, {
                    checked: event.target.checked,
                    result: event.target.checked ? item.result ?? "compliant" : null,
                  })
                }
              />
              <span>{item.label}</span>
            </label>
            <select
              aria-label={`Résultat pour ${item.label}`}
              value={item.result ?? ""}
              disabled={!item.checked}
              onChange={(event) => onChange(item.id, { result: (event.target.value || null) as CheckResult })}
            >
              <option value="">Résultat</option>
              <option value="compliant">Conforme</option>
              <option value="issue">Anomalie</option>
              <option value="not_applicable">Non applicable</option>
            </select>
            <ValidationNote
              key={`${item.id}:${item.updatedAt ?? ""}`}
              item={item}
              onChange={onChange}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
