import Link from "next/link";
import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import SelenButton from "@/components/ui/SelenButton";

const statusLabels: Record<string, string> = {
  todo: "À faire",
  in_progress: "En cours",
  to_review: "À vérifier",
  validated: "Validé",
  blocked: "Bloqué",
  not_applicable: "Non applicable",
};

type Props = { params: Promise<{ id: string }> };

function revalidateDossier(sessionId: string) {
  revalidatePath(`/agent/daily/session-dossiers/${sessionId}`);
  revalidatePath(`/agent/daily/session-dossiers/${sessionId}/closure`);
  revalidatePath("/agent/daily/session-dossiers");
  revalidatePath("/agent/daily");
}

async function closeDossier(formData: FormData) {
  "use server";
  const auth = await requireSupportAgent();
  if (!auth.ok) throw new Error(auth.error);
  const sessionId = String(formData.get("session_id") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!sessionId) throw new Error("Session invalide.");

  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("daily_close_session_dossier", {
    p_session_id: sessionId,
    p_note: note || null,
    p_validated_by: auth.userId,
  });
  if (error) throw new Error(error.message);
  revalidateDossier(sessionId);
}

async function archiveDossier(formData: FormData) {
  "use server";
  const auth = await requireSupportAgent();
  if (!auth.ok) throw new Error(auth.error);
  const sessionId = String(formData.get("session_id") ?? "");
  if (!sessionId) throw new Error("Session invalide.");

  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("daily_archive_session_dossier", { p_session_id: sessionId });
  if (error) throw new Error(error.message);
  revalidateDossier(sessionId);
}

async function reopenDossier(formData: FormData) {
  "use server";
  const auth = await requireSupportAgent();
  if (!auth.ok) throw new Error(auth.error);
  const sessionId = String(formData.get("session_id") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!sessionId) throw new Error("Session invalide.");

  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("daily_reopen_session_dossier", {
    p_session_id: sessionId,
    p_note: note || "Réouverture manuelle du dossier de session.",
  });
  if (error) throw new Error(error.message);
  revalidateDossier(sessionId);
}

export default async function SessionClosurePage({ params }: Props) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={{ padding: 28 }}>Accès refusé.</main>;

  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const [{ data: dossier }, { data: session }, { data: items }] = await Promise.all([
    admin.from("daily_session_dossiers").select("session_id,organisation_id,status,completed_at").eq("session_id", id).maybeSingle(),
    admin.from("daily_sessions").select("id,organisation_id,formation_id,internal_reference,start_date,end_date").eq("id", id).maybeSingle(),
    admin.from("daily_session_checklist_items").select("id,item_key,label,status,note,position").eq("session_id", id).order("position"),
  ]);

  if (!dossier || !session) return <main style={{ padding: 28 }}>Dossier introuvable.</main>;

  const [{ data: org }, { data: formation }] = await Promise.all([
    admin.from("organisations").select("name").eq("id", session.organisation_id).maybeSingle(),
    admin.from("daily_formations").select("title").eq("id", session.formation_id).maybeSingle(),
  ]);

  const closureItem = (items ?? []).find((item) => item.item_key === "selen_closure_review");
  const upstream = (items ?? []).filter((item) => item.item_key !== "selen_closure_review");
  const blockers = upstream.filter((item) => !["validated", "not_applicable"].includes(item.status));
  const parisToday = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date());
  const sessionEnded = Boolean(session.end_date && session.end_date < parisToday);
  const ready = blockers.length === 0 && sessionEnded;
  const completed = dossier.status === "completed";
  const archived = dossier.status === "archived";
  const closed = completed || archived;

  return (
    <main style={{ maxWidth: 920, margin: "0 auto", padding: 28 }}>
      <p style={{ marginBottom: 12 }}><Link href={`/agent/daily/session-dossiers/${id}`}>← Retour au dossier</Link></p>
      <h1 style={{ marginBottom: 4 }}>Revue de clôture Selen</h1>
      <p style={{ marginTop: 0, color: "var(--selen-text2)" }}>
        {formation?.title ?? "Session Daily"} · {org?.name ?? "OF"} · {session.internal_reference || "Sans référence"}
      </p>

      <SelenCard>
        <SelenCardTitle>{archived ? "Dossier archivé" : completed ? "Dossier clôturé" : ready ? "Dossier prêt à clôturer" : "Clôture impossible pour le moment"}</SelenCardTitle>
        {closed ? (
          <p style={{ fontSize: 13, color: "var(--selen-text2)" }}>
            La revue Selen est validée{dossier.completed_at ? ` depuis le ${new Date(dossier.completed_at).toLocaleString("fr-FR")}` : ""}. {archived ? "Le dossier est classé en archive logique." : "Il peut maintenant être classé en archive."} Toutes les données et pièces restent conservées et consultables.
          </p>
        ) : ready ? (
          <p style={{ fontSize: 13, color: "var(--selen-text2)" }}>
            La session est terminée et tous les contrôles amont sont validés. Les analyses de satisfaction et de performance ont notamment été revues par Selen. La clôture horodatera le dossier côté serveur et validera le contrôle interne final.
          </p>
        ) : !sessionEnded ? (
          <p style={{ fontSize: 13, color: "var(--selen-text2)" }}>
            La session doit être entièrement terminée avant de pouvoir être clôturée. La base applique également ce garde-fou, même en dehors de cet écran.
          </p>
        ) : (
          <p style={{ fontSize: 13, color: "var(--selen-text2)" }}>
            {blockers.length} point(s) doivent encore être traités avant la revue finale. La mise à jour des analyses de satisfaction et de performance fait partie des contrôles obligatoires Selen.
          </p>
        )}
      </SelenCard>

      <section style={{ marginTop: 18 }}>
        <h2>Contrôles de complétude</h2>
        <div style={{ display: "grid", gap: 8 }}>
          {upstream.map((item) => (
            <SelenCard key={item.id}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <strong>{item.label}</strong>
                <span style={{ fontSize: 13 }}>{statusLabels[item.status] ?? item.status}</span>
              </div>
              {item.note ? <p style={{ fontSize: 12, color: "var(--selen-text2)", marginBottom: 0 }}>{item.note}</p> : null}
            </SelenCard>
          ))}
        </div>
      </section>

      <section style={{ marginTop: 18 }}>
        <SelenCard>
          <SelenCardTitle>Contrôle interne final</SelenCardTitle>
          {closed ? (
            <>
              {closureItem?.note ? <p style={{ fontSize: 13 }}><strong>Note de clôture :</strong> {closureItem.note}</p> : null}
              {completed ? (
                <form action={archiveDossier} style={{ marginBottom: 14 }}>
                  <input type="hidden" name="session_id" value={id} />
                  <SelenButton type="submit">Archiver le dossier</SelenButton>
                </form>
              ) : null}
              <form action={reopenDossier} style={{ display: "grid", gap: 10 }}>
                <input type="hidden" name="session_id" value={id} />
                <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
                  Motif de réouverture
                  <input name="note" placeholder="Pourquoi le dossier doit-il être repris ?" />
                </label>
                <div><SelenButton type="submit">Réouvrir le dossier</SelenButton></div>
              </form>
            </>
          ) : (
            <form action={closeDossier} style={{ display: "grid", gap: 10 }}>
              <input type="hidden" name="session_id" value={id} />
              <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
                Note de clôture
                <textarea name="note" rows={4} placeholder="Synthèse du contrôle final, point de vigilance éventuel…" />
              </label>
              <div>
                <SelenButton type="submit" disabled={!ready}>Clôturer le dossier</SelenButton>
              </div>
            </form>
          )}
        </SelenCard>
      </section>
    </main>
  );
}
