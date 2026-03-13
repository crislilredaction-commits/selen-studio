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
        background: "var(--selen-gold)",
        color: "#0f0c08",
        border: "none",
        borderRadius: "var(--radius-sm)",
        padding: "8px 14px",
        fontSize: 13,
        fontWeight: 600,
        cursor: pending ? "default" : "pointer",
        opacity: pending ? 0.7 : 1,
        fontFamily: "var(--font-body)",
      }}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
