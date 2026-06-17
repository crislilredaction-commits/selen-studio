"use client";

import { useFormStatus } from "react-dom";

export default function SubmitButton({
  label,
  pendingLabel,
}: {
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        background:
          "linear-gradient(135deg, var(--selen-gold), var(--selen-copper))",
        color: "var(--selen-ink)",
        border: "1px solid rgba(120, 90, 50, 0.24)",
        borderRadius: "var(--radius-sm)",
        padding: "8px 14px",
        fontSize: 13,
        fontWeight: 600,
        cursor: pending ? "default" : "pointer",
        opacity: pending ? 0.7 : 1,
        fontFamily: "var(--font-body)",
        boxShadow: "0 10px 24px rgba(201, 148, 58, 0.18)",
      }}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
