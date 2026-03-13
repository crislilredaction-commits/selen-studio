import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

type FormationRow = {
  id: string;
  title: string;
  description: string | null;
  duration_hours: number | null;
  modality: string | null;
  created_at: string;
  organisations:
    | {
        name: string;
      }
    | {
        name: string;
      }[]
    | null;
};

function getOrganisationName(
  organisation: FormationRow["organisations"],
): string {
  if (!organisation) return "—";
  if (Array.isArray(organisation)) {
    return organisation[0]?.name ?? "—";
  }
  return organisation.name ?? "—";
}

export default async function AgentFormationsPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("formations")
    .select(
      `
        id,
        title,
        description,
        duration_hours,
        modality,
        created_at,
        organisations (
          name
        )
      `,
    )
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <main className="p-8 text-red-400">
        <p>Erreur : {error.message}</p>
      </main>
    );
  }

  const formations = (data ?? []) as FormationRow[];

  return (
    <main className="px-8 py-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-amber-300/80">
              Studio agent
            </p>
            <h1 className="mt-2 text-3xl font-semibold">Formations</h1>
            <p className="mt-2 text-stone-400">
              Bibliothèque des formations modèles par organisme.
            </p>
          </div>

          <Link
            href="/agent/formations/new"
            className="rounded-2xl bg-amber-400 px-5 py-3 text-sm font-semibold text-black transition hover:bg-amber-300"
          >
            + Nouvelle formation
          </Link>
        </div>

        <div className="overflow-hidden rounded-3xl border border-stone-800 bg-stone-900 shadow-2xl">
          <table className="min-w-full divide-y divide-stone-800">
            <thead>
              <tr className="text-left text-sm text-stone-400">
                <th className="px-6 py-4">Titre</th>
                <th className="px-6 py-4">Organisation</th>
                <th className="px-6 py-4">Durée</th>
                <th className="px-6 py-4">Modalité</th>
                <th className="px-6 py-4">Créée le</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-800">
              {formations.map((formation) => (
                <tr key={formation.id} className="hover:bg-stone-800/60">
                  <td className="px-6 py-4 font-medium text-stone-100">
                    {formation.title}
                  </td>
                  <td className="px-6 py-4 text-stone-300">
                    {getOrganisationName(formation.organisations)}
                  </td>
                  <td className="px-6 py-4 text-stone-300">
                    {formation.duration_hours
                      ? `${formation.duration_hours} h`
                      : "—"}
                  </td>
                  <td className="px-6 py-4 text-stone-300">
                    {formation.modality ?? "—"}
                  </td>
                  <td className="px-6 py-4 text-stone-400">
                    {new Date(formation.created_at).toLocaleDateString("fr-FR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {formations.length === 0 ? (
            <div className="px-6 py-10 text-stone-400">
              Aucune formation pour le moment.
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
