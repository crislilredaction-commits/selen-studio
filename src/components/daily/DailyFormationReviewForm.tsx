"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { navigateWithStudioFeedback } from "@/lib/studioNavigation";
type Intent = "save" | "validate" | "questionnaires";
const UploadContext = createContext<(kind: string, pending: boolean) => void>(() => {});
export function useDailyReviewUploadPending() { return useContext(UploadContext); }

export default function DailyFormationReviewForm({ children, submit, defaultIntent }: {
  children: ReactNode; defaultIntent: Intent;
  submit: (data: FormData, intent: Intent) => Promise<{ error?: string; redirectTo?: string } | undefined>;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [activeIntent, setActiveIntent] = useState<Intent | null>(null);
  const [pendingUploads, setPendingUploads] = useState<Record<string, boolean>>({});
  const [pending, startTransition] = useTransition();
  const saving = useRef(false);
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current) return;
    if (Object.values(pendingUploads).some(Boolean)) { setError("Termine l’import des documents ou annule le remplacement avant d’enregistrer."); return; }
    const data = new FormData(event.currentTarget);
    const button = (event.nativeEvent as SubmitEvent).submitter;
    const intentValue = button instanceof HTMLButtonElement ? button.dataset.reviewIntent : undefined;
    const intent = intentValue && ["save", "validate", "questionnaires"].includes(intentValue) ? intentValue as Intent : defaultIntent;
    saving.current = true; setError(""); setActiveIntent(intent);
    startTransition(async () => {
      try {
        const result = await submit(data, intent);
        if (result?.error) setError(result.error);
        else if (result?.redirectTo) navigateWithStudioFeedback(router, result.redirectTo, { label: "le dossier formation", replace: true });
        else setError("Le serveur n’a pas confirmé l’enregistrement. Vérifie le dossier avant de recommencer.");
      }
      catch { setError("L’enregistrement n’a pas pu être confirmé. Recharge le dossier avant de réessayer."); }
      finally { saving.current = false; setActiveIntent(null); }
    });
  }
  return <UploadContext value={(kind, value) => setPendingUploads(current => ({ ...current, [kind]: value }))}>
    <form onSubmit={onSubmit} aria-busy={pending} data-review-saving={activeIntent ?? undefined} style={{ display: "grid", gap: 12 }}>
      {children}
      {activeIntent ? <p role="status" aria-live="polite">{activeIntent === "validate" ? "Validation en cours…" : "Enregistrement en cours…"}</p> : null}
      {error ? <p role="alert" style={{ color: "var(--selen-danger, #b42318)", padding: 12, border: "1px solid currentColor", borderRadius: 8 }}>{error}</p> : null}
    </form>
  </UploadContext>;
}
