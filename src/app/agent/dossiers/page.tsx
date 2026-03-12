import { createClient } from "@/lib/supabase/server";

type DossierRow = {
  id: string;
  title: string;
  type: string;
  status: string;
  created_at: string;
  organisations: {
    name: string;
  } | null;
};

export default async function AgentDossiersPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("dossiers")
    .select(
      `
        id,
        title,
        type,
        status,
        created_at,
        organisations (
          name
        )
      `,
    )
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <main className="min-h-screen bg-stone-950 p-8 text-stone-100">
        <div className="mx-auto max-w-6xl rounded-3xl border border-red-900 bg-stone-900 p-6">
          <h1 className="text-2xl font-semibold">Dossiers</h1>
          <p className="mt-4 text-red-300">Erreur : {error.message}</p>
        </div>
      </main>
    );
  }

  const dossiers = (data ?? []) as DossierRow[];

  return (
    <main className="min-h-screen bg-stone-950 text-stone-100">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8">
          <p className="text-sm uppercase tracking-[0.2em] text-amber-300/80">
            Studio agent
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Dossiers</h1>
          <p className="mt-2 text-stone-400">
            Première vue de pilotage des dossiers clients.
          </p>
        </div>

        <div className="overflow-hidden rounded-3xl border border-stone-800 bg-stone-900 shadow-2xl">
          <table className="min-w-full divide-y divide-stone-800">
            <thead className="bg-stone-900/80">
              <tr className="text-left text-sm text-stone-400">
                <th className="px-6 py-4">Titre</th>
                <th className="px-6 py-4">Organisation</th>
                <th className="px-6 py-4">Type</th>
                <th className="px-6 py-4">Statut</th>
                <th className="px-6 py-4">Créé le</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-800">
              {dossiers.map((dossier) => (
                <tr key={dossier.id} className="hover:bg-stone-800/60">
                  <td className="px-6 py-4 font-medium text-stone-100">
                    {dossier.title}
                  </td>
                  <td className="px-6 py-4 text-stone-300">
                    {dossier.organisations?.name ?? "—"}
                  </td>
                  <td className="px-6 py-4 text-stone-300">{dossier.type}</td>
                  <td className="px-6 py-4 text-stone-300">{dossier.status}</td>
                  <td className="px-6 py-4 text-stone-400">
                    {new Date(dossier.created_at).toLocaleDateString("fr-FR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {dossiers.length === 0 ? (
            <div className="px-6 py-10 text-stone-400">
              Aucun dossier pour le moment.
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
