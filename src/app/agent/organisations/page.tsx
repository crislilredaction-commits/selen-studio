import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

type OrganisationRow = {
  id: string;
  name: string;
  siret: string | null;
  email: string | null;
  phone: string | null;
  nda_number: string | null;
  created_at: string;
};

export default async function AgentOrganisationsPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("organisations")
    .select("id, name, siret, email, phone, nda_number, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <main className="p-8 text-red-400">
        <p>Erreur : {error.message}</p>
      </main>
    );
  }

  const organisations = (data ?? []) as OrganisationRow[];

  return (
    <main className="px-8 py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-amber-300/80">
              Studio agent
            </p>
            <h1 className="mt-2 text-3xl font-semibold">Organisations</h1>
            <p className="mt-2 text-stone-400">
              Vue des organismes de formation enregistrés.
            </p>
          </div>

          <Link
            href="/agent/organisations/new"
            className="rounded-2xl bg-amber-400 px-5 py-3 text-sm font-semibold text-black transition hover:bg-amber-300"
          >
            + Nouvelle organisation
          </Link>
        </div>

        <div className="overflow-hidden rounded-3xl border border-stone-800 bg-stone-900 shadow-2xl">
          <table className="min-w-full divide-y divide-stone-800">
            <thead>
              <tr className="text-left text-sm text-stone-400">
                <th className="px-6 py-4">Nom</th>
                <th className="px-6 py-4">SIRET</th>
                <th className="px-6 py-4">Email</th>
                <th className="px-6 py-4">Téléphone</th>
                <th className="px-6 py-4">NDA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-800">
              {organisations.map((organisation) => (
                <tr key={organisation.id} className="hover:bg-stone-800/60">
                  <td className="px-6 py-4 font-medium text-stone-100">
                    {organisation.name}
                  </td>
                  <td className="px-6 py-4 text-stone-300">
                    {organisation.siret ?? "—"}
                  </td>
                  <td className="px-6 py-4 text-stone-300">
                    {organisation.email ?? "—"}
                  </td>
                  <td className="px-6 py-4 text-stone-300">
                    {organisation.phone ?? "—"}
                  </td>
                  <td className="px-6 py-4 text-stone-300">
                    {organisation.nda_number ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {organisations.length === 0 ? (
            <div className="px-6 py-10 text-stone-400">
              Aucune organisation pour le moment.
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
