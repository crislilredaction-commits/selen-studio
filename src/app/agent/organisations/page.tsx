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
    <main className="px-8 py-10" style={{ color: "var(--selen-text)" }}>
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.2em]" style={{ color: "var(--selen-gold)" }}>
              Studio agent
            </p>
            <h1 className="mt-2 text-3xl font-semibold">Organisations</h1>
            <p className="mt-2" style={{ color: "var(--selen-text2)" }}>
              Vue des organismes de formation enregistrés.
            </p>
          </div>

          <Link
            href="/agent/organisations/new"
            className="rounded-2xl px-5 py-3 text-sm font-semibold transition"
            style={{
              background:
                "linear-gradient(135deg, var(--selen-gold), var(--selen-copper))",
              color: "var(--selen-ink)",
              textDecoration: "none",
            }}
          >
            + Nouvelle organisation
          </Link>
        </div>

        <div
          className="overflow-hidden rounded-3xl shadow-2xl"
          style={{
            background: "var(--selen-card-texture), var(--selen-card)",
            border: "1px solid rgba(245, 208, 138, 0.18)",
            color: "var(--selen-text-oncard)",
          }}
        >
          <table className="min-w-full">
            <thead>
              <tr className="text-left text-sm" style={{ color: "var(--selen-text3-oncard)" }}>
                <th className="px-6 py-4">Nom</th>
                <th className="px-6 py-4">SIRET</th>
                <th className="px-6 py-4">Email</th>
                <th className="px-6 py-4">Téléphone</th>
                <th className="px-6 py-4">NDA</th>
              </tr>
            </thead>
            <tbody>
              {organisations.map((organisation) => (
                <tr key={organisation.id} style={{ borderTop: "1px solid rgba(245, 208, 138, 0.14)" }}>
                  <td className="px-6 py-4 font-medium" style={{ color: "var(--selen-text-oncard)" }}>
                    {organisation.name}
                  </td>
                  <td className="px-6 py-4" style={{ color: "var(--selen-text2-oncard)" }}>
                    {organisation.siret ?? "—"}
                  </td>
                  <td className="px-6 py-4" style={{ color: "var(--selen-text2-oncard)" }}>
                    {organisation.email ?? "—"}
                  </td>
                  <td className="px-6 py-4" style={{ color: "var(--selen-text2-oncard)" }}>
                    {organisation.phone ?? "—"}
                  </td>
                  <td className="px-6 py-4" style={{ color: "var(--selen-text2-oncard)" }}>
                    {organisation.nda_number ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {organisations.length === 0 ? (
            <div className="px-6 py-10" style={{ color: "var(--selen-text3-oncard)" }}>
              Aucune organisation pour le moment.
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
