import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-stone-100 text-stone-900">
      <div className="mx-auto max-w-5xl px-6 py-16">
        <div className="rounded-3xl border border-stone-200 bg-white p-8 shadow-sm">
          <p className="text-sm uppercase tracking-[0.2em] text-stone-500">
            Selen Studio
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            Base du projet prête
          </h1>
          <p className="mt-4 max-w-2xl text-stone-600">
            Première étape : afficher les dossiers agents depuis Supabase.
          </p>

          <div className="mt-8 flex gap-3">
            <Link
              href="/agent/dossiers"
              className="rounded-2xl bg-stone-900 px-5 py-3 text-sm font-medium text-white"
            >
              Ouvrir les dossiers agents
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
