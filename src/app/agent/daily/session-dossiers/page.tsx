import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";

const dossierStatusLabels: Record<string, string> = {
  active: "Actif",
  completed: "Clôturé",
  archived: "Archivé",
};

export default async function SessionDossiersPage() {
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={{ padding: 28 }}>Accès refusé.</main>;
  const admin = createSupabaseAdminClient();
  const { data: dossiers } = await admin.from("daily_session_dossiers").select("session_id,organisation_id,status,assigned_agent_profile_id,completed_at,updated_at").order("updated_at", { ascending: false });
  const sessionIds = (dossiers ?? []).map((d) => d.session_id);
  const orgIds = [...new Set((dossiers ?? []).map((d) => d.organisation_id))];
  const [{ data: sessions }, { data: organisations }, { data: items }, { data: agents }] = await Promise.all([
    sessionIds.length ? admin.from("daily_sessions").select("id,formation_id,internal_reference,start_date,end_date,status").in("id", sessionIds) : Promise.resolve({ data: [] }),
    orgIds.length ? admin.from("organisations").select("id,name").in("id", orgIds) : Promise.resolve({ data: [] }),
    sessionIds.length ? admin.from("daily_session_checklist_items").select("session_id,item_key,status").in("session_id", sessionIds) : Promise.resolve({ data: [] }),
    admin.from("agent_profiles").select("id,first_name,last_name,email").eq("is_active", true),
  ]);
  const formationIds = [...new Set((sessions ?? []).map((s) => s.formation_id).filter(Boolean))];
  const { data: formations } = formationIds.length ? await admin.from("daily_formations").select("id,title").in("id", formationIds) : { data: [] };
  const byId = <T extends { id: string }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]));
  const sessionMap = byId((sessions ?? []) as Array<{id:string;formation_id:string;internal_reference:string|null;start_date:string|null;end_date:string|null;status:string}>);
  const orgMap = byId((organisations ?? []) as Array<{id:string;name:string}>);
  const formationMap = byId((formations ?? []) as Array<{id:string;title:string}>);
  const agentMap = byId((agents ?? []) as Array<{id:string;first_name:string|null;last_name:string|null;email:string}>);

  return <main style={{ maxWidth: 1180, margin: "0 auto", padding: 28 }}>
    <h1 style={{ marginBottom: 4 }}>Dossiers de session</h1>
    <p style={{ color: "var(--selen-text2)", marginTop: 0 }}>Checklist opérationnelle avant, pendant et après chaque formation, jusqu’à la revue de clôture Selen.</p>
    <div style={{ display: "grid", gap: 12 }}>
      {(dossiers ?? []).map((d) => {
        const session = sessionMap.get(d.session_id);
        const org = orgMap.get(d.organisation_id);
        const formation = session ? formationMap.get(session.formation_id) : null;
        const agent = d.assigned_agent_profile_id ? agentMap.get(d.assigned_agent_profile_id) : null;
        const checklist = (items ?? []).filter((i) => i.session_id === d.session_id);
        const open = checklist.filter((i) => !["validated", "not_applicable"].includes(i.status)).length;
        const upstreamOpen = checklist.filter((i) => i.item_key !== "selen_closure_review" && !["validated", "not_applicable"].includes(i.status)).length;
        const readyForClosure = d.status === "active" && upstreamOpen === 0;

        return <SelenCard key={d.session_id}>
          <SelenCardTitle>{formation?.title ?? "Session Daily"}</SelenCardTitle>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}>
            <span>{org?.name ?? "OF"}</span>
            <span>{session?.internal_reference || "Sans référence"}</span>
            <span>{dossierStatusLabels[d.status] ?? d.status}</span>
            <span>{open} point(s) ouvert(s)</span>
            <span>Agent : {agent ? `${agent.first_name ?? ""} ${agent.last_name ?? ""}`.trim() || agent.email : "Non assigné"}</span>
            {d.completed_at ? <span>Clôturé le {new Date(d.completed_at).toLocaleDateString("fr-FR")}</span> : null}
          </div>
          <div style={{ marginTop: 12, display: "flex", gap: 14, flexWrap: "wrap" }}>
            <Link href={`/agent/daily/session-dossiers/${d.session_id}`}>Ouvrir le dossier →</Link>
            <Link href={`/agent/daily/session-dossiers/${d.session_id}/closure`}>{readyForClosure ? "Clôturer le dossier →" : d.status === "completed" || d.status === "archived" ? "Voir la clôture →" : "Préparer la clôture →"}</Link>
          </div>
        </SelenCard>;
      })}
      {(dossiers ?? []).length === 0 ? <SelenCard>Aucun dossier de session pour le moment.</SelenCard> : null}
    </div>
  </main>;
}
