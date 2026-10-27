import Link from "next/link";
import type { CSSProperties } from "react";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { createClient } from "@/lib/supabase/server";
import { isOwnerLil } from "@/lib/ownerLil";
import { dailyStudioAdministrationLinks } from "@/lib/daily/dailyStudioNavigation.mjs";

const categories = ["Supervision", "Qualité", "Outils"] as const;

export default async function DailyAdministrationPage() {
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={s.page}><p role="alert">Accès refusé.</p></main>;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const links = dailyStudioAdministrationLinks(isOwnerLil(user?.email));

  return <main style={s.page}>
    <header style={s.header}>
      <div>
        <p style={s.eyebrow}>Selen Daily · Studio</p>
        <h1 style={s.title}>Administration</h1>
        <p style={s.subtitle}>Les outils de supervision et de qualité restent accessibles ici, sans encombrer les cinq rubriques principales. Chaque dossier conserve son écran de référence et ses droits propres.</p>
      </div>
      <Link href="/agent/daily" style={s.back}>← Tableau de bord</Link>
    </header>

    {categories.map(category => {
      const categoryLinks = links.filter(link => link.category === category);
      if (categoryLinks.length === 0) return null;
      return <section key={category} aria-label={category} style={s.section}>
        <h2 style={s.sectionTitle}>{category}</h2>
        <div style={s.grid}>
          {categoryLinks.map(link => <Link key={link.href} href={link.href} style={s.card}>
            <strong style={s.cardTitle}>{link.label}</strong>
            <span style={s.cardDescription}>{link.description}</span>
            <span aria-hidden="true" style={s.cardArrow}>Ouvrir →</span>
          </Link>)}
        </div>
      </section>;
    })}
  </main>;
}

const s: Record<string, CSSProperties> = {
  page: { maxWidth: 1180, margin: "0 auto", padding: "28px 28px 70px", color: "var(--selen-text)" },
  header: { display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 18, alignItems: "flex-start", marginBottom: 24 },
  eyebrow: { margin: 0, color: "var(--selen-gold2)", textTransform: "uppercase", letterSpacing: ".16em", fontSize: 10, fontWeight: 800 },
  title: { fontFamily: "var(--font-display)", fontSize: 30, margin: "6px 0 10px" },
  subtitle: { maxWidth: 750, margin: 0, fontSize: 13, lineHeight: 1.7, color: "var(--selen-text2)" },
  back: { fontSize: 12, fontWeight: 700, color: "var(--selen-gold2)", textDecoration: "none", paddingTop: 10 },
  section: { marginTop: 22 },
  sectionTitle: { fontFamily: "var(--font-display)", fontSize: 21, margin: "0 0 12px" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: 12 },
  card: { display: "flex", flexDirection: "column", gap: 8, padding: 18, minHeight: 130, border: "1px solid var(--selen-border)", borderRadius: 14, background: "var(--selen-bg2)", textDecoration: "none", color: "var(--selen-text)" },
  cardTitle: { fontSize: 15 },
  cardDescription: { fontSize: 12, lineHeight: 1.5, color: "var(--selen-text2)", flex: 1 },
  cardArrow: { color: "var(--selen-gold2)", fontWeight: 700, fontSize: 12 },
};
