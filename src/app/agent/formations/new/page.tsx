import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function NewFormationPage() {
  const supabase = await createClient();

  const { data: organisations, error } = await supabase
    .from("organisations")
    .select("id, name")
    .order("name");

  if (error) {
    return (
      <main className="p-8 text-red-400">
        <p>Erreur : {error.message}</p>
      </main>
    );
  }

  async function createFormation(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const organisation_id = formData.get("organisation_id") as string;
    const title = (formData.get("title") as string)?.trim();
    const description = (formData.get("description") as string)?.trim() || null;
    const duration_hours_raw = (
      formData.get("duration_hours") as string
    )?.trim();
    const modality = (formData.get("modality") as string)?.trim() || null;

    if (!organisation_id) {
      throw new Error("L’organisation est obligatoire.");
    }

    if (!title) {
      throw new Error("Le titre de la formation est obligatoire.");
    }

    const duration_hours = duration_hours_raw
      ? Number(duration_hours_raw)
      : null;

    const { error } = await supabase.from("formations").insert({
      organisation_id,
      title,
      description,
      duration_hours,
      modality,
    });

    if (error) {
      console.error(error);
      throw new Error("Impossible de créer la formation.");
    }

    redirect("/agent/formations");
  }

  return (
    <main className="px-8 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8">
          <p className="text-sm uppercase tracking-[0.2em] text-amber-300/80">
            Studio agent
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Nouvelle formation</h1>
          <p className="mt-2 text-stone-400">
            Créer une formation modèle rattachée à un organisme.
          </p>
        </div>

        <form
          action={createFormation}
          className="space-y-5 rounded-3xl border border-stone-800 bg-stone-900 p-6"
        >
          <div>
            <label className="text-sm text-stone-400">Organisation *</label>
            <select
              name="organisation_id"
              className="mt-2 w-full rounded-xl bg-stone-800 px-4 py-3 text-stone-100 outline-none"
              defaultValue=""
            >
              <option value="" disabled>
                Sélectionner une organisation
              </option>
              {organisations?.map((organisation) => (
                <option key={organisation.id} value={organisation.id}>
                  {organisation.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm text-stone-400">Titre *</label>
            <input
              name="title"
              className="mt-2 w-full rounded-xl bg-stone-800 px-4 py-3 text-stone-100 outline-none"
            />
          </div>

          <div>
            <label className="text-sm text-stone-400">Description</label>
            <textarea
              name="description"
              rows={5}
              className="mt-2 w-full rounded-xl bg-stone-800 px-4 py-3 text-stone-100 outline-none"
            />
          </div>

          <div>
            <label className="text-sm text-stone-400">Durée (heures)</label>
            <input
              name="duration_hours"
              type="number"
              step="0.5"
              min="0"
              className="mt-2 w-full rounded-xl bg-stone-800 px-4 py-3 text-stone-100 outline-none"
            />
          </div>

          <div>
            <label className="text-sm text-stone-400">Modalité</label>
            <input
              name="modality"
              placeholder="Présentiel, distanciel, blended..."
              className="mt-2 w-full rounded-xl bg-stone-800 px-4 py-3 text-stone-100 outline-none"
            />
          </div>

          <button className="w-full rounded-2xl bg-amber-400 py-3 font-semibold text-black transition hover:bg-amber-300">
            Créer la formation
          </button>
        </form>
      </div>
    </main>
  );
}
