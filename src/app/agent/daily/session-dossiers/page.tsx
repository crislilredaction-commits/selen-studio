import { redirect } from "next/navigation";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";

export default async function SessionDossiersPage() {
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={{ padding: 28 }}>Accès refusé.</main>;

  // Cette ancienne vue "Tâches agent" ne doit plus maintenir son propre moteur de tâches.
  // Le Pilotage Daily est la source canonique : assignation organisme, visibilité agent/admin,
  // partage d'une tâche précise après 72 h et compteurs y sont calculés ensemble.
  redirect("/agent/daily");
}
