import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function NewOrganisationPage() {
  async function createOrganisation(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const name = (formData.get("name") as string)?.trim();
    const siret = (formData.get("siret") as string)?.trim() || null;
    const email = (formData.get("email") as string)?.trim() || null;
    const phone = (formData.get("phone") as string)?.trim() || null;
    const address = (formData.get("address") as string)?.trim() || null;
    const nda_number = (formData.get("nda_number") as string)?.trim() || null;

    if (!name) {
      throw new Error("Le nom de l’organisation est obligatoire.");
    }

    const { error } = await supabase.from("organisations").insert({
      name,
      siret,
      email,
      phone,
      address,
      nda_number,
    });

    if (type === "nda") {
      const { error: ndaError } = await supabase.from("nda_variables").insert({
        dossier_id: dossier.id,
      });

      if (ndaError) {
        console.error("Erreur création variables NDA", ndaError);
      }
    }

    if (error) {
      console.error(error);
      throw new Error("Impossible de créer l’organisation.");
    }

    redirect("/agent/organisations");
  }

  return (
    <main className="px-8 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8">
          <p className="text-sm uppercase tracking-[0.2em] text-amber-300/80">
            Studio agent
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Nouvelle organisation</h1>
          <p className="mt-2 text-stone-400">
            Créer un nouvel organisme de formation dans Studio.
          </p>
        </div>

        <form
          action={createOrganisation}
          className="space-y-5 rounded-3xl border border-stone-800 bg-stone-900 p-6"
        >
          <div>
            <label className="text-sm text-stone-400">
              Nom de l’organisation *
            </label>
            <input
              name="name"
              className="mt-2 w-full rounded-xl bg-stone-800 px-4 py-3 text-stone-100 outline-none"
            />
          </div>

          <div>
            <label className="text-sm text-stone-400">SIRET</label>
            <input
              name="siret"
              className="mt-2 w-full rounded-xl bg-stone-800 px-4 py-3 text-stone-100 outline-none"
            />
          </div>

          <div>
            <label className="text-sm text-stone-400">Email</label>
            <input
              name="email"
              type="email"
              className="mt-2 w-full rounded-xl bg-stone-800 px-4 py-3 text-stone-100 outline-none"
            />
          </div>

          <div>
            <label className="text-sm text-stone-400">Téléphone</label>
            <input
              name="phone"
              className="mt-2 w-full rounded-xl bg-stone-800 px-4 py-3 text-stone-100 outline-none"
            />
          </div>

          <div>
            <label className="text-sm text-stone-400">Adresse</label>
            <textarea
              name="address"
              rows={4}
              className="mt-2 w-full rounded-xl bg-stone-800 px-4 py-3 text-stone-100 outline-none"
            />
          </div>

          <div>
            <label className="text-sm text-stone-400">N° NDA</label>
            <input
              name="nda_number"
              className="mt-2 w-full rounded-xl bg-stone-800 px-4 py-3 text-stone-100 outline-none"
            />
          </div>

          <button className="w-full rounded-2xl bg-amber-400 py-3 font-semibold text-black transition hover:bg-amber-300">
            Créer l’organisation
          </button>
        </form>
      </div>
    </main>
  );
}
