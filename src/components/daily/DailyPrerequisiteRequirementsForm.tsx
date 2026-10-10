"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import DailyPrerequisiteRequirementsEditor from "@/components/daily/DailyPrerequisiteRequirementsEditor";
import { navigateWithStudioFeedback } from "@/lib/studioNavigation";

type Requirement = { id: string; label: string; description?: string; required?: boolean };
type Result = { error?: string; redirectTo?: string };

export default function DailyPrerequisiteRequirementsForm({
  formationId,
  updatedAt,
  initial,
  submit,
}: {
  formationId: string;
  updatedAt: string;
  initial: Requirement[];
  submit: (previous: Result, data: FormData) => Promise<Result>;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(submit, {});
  useEffect(() => {
    if (state.redirectTo) navigateWithStudioFeedback(router, state.redirectTo, { label: "les justificatifs", replace: true });
  }, [router, state.redirectTo]);
  return <form action={action} aria-busy={pending} style={{ display: "grid", gap: 12 }}>
    <input type="hidden" name="formation_id" value={formationId} />
    <input type="hidden" name="formation_updated_at" value={updatedAt} />
    <DailyPrerequisiteRequirementsEditor initial={initial} disabled={pending} />
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <button type="submit" disabled={pending} style={{ border: 0, borderRadius: 9, background: "var(--selen-gold2)", color: "var(--selen-bg)", padding: "11px 16px", fontWeight: 900, cursor: pending ? "progress" : "pointer" }}>
        {pending ? "Enregistrement…" : "Enregistrer les justificatifs"}
      </button>
    </div>
    {pending ? <p role="status" aria-live="polite">Enregistrement des justificatifs en cours…</p> : null}
    {state.error ? <p role="alert" style={{ color: "var(--selen-danger, #b42318)", padding: 12, border: "1px solid currentColor", borderRadius: 8 }}>{state.error}</p> : null}
  </form>;
}
