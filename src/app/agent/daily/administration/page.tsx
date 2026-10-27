import Link from "next/link";
import type { CSSProperties } from "react";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { createClient } from "@/lib/supabase/server";
import { isOwnerLil } from "@/lib/ownerLil";
import { dailyStudioAdministrationLinks } from "@/lib/daily/dailyStudioNavigation.mjs";
import DailyAdministrationDirectory from "@/components/daily/DailyAdministrationDirectory";

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
        <p style={s.subtitle}>Retrouvez rapidement les outils de supervision, qualité et préparation. Les accès restent limités à votre rôle et chaque dossier conserve son écran de référence.</p>
      </div>
      <Link href="/agent/daily" style={s.back}>← Tableau de bord</Link>
    </header>
    <DailyAdministrationDirectory links={links} />
  </main>;
}

const s: Record<string, CSSProperties> = {
  page: { maxWidth: 1180, margin: "0 auto", padding: "28px 28px 70px", color: "var(--selen-text)" },
  header: { display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 18, alignItems: "flex-start", marginBottom: 24 },
  eyebrow: { margin: 0, color: "var(--selen-gold2)", textTransform: "uppercase", letterSpacing: ".16em", fontSize: 10, fontWeight: 800 },
  title: { fontFamily: "var(--font-display)", fontSize: 30, margin: "6px 0 10px" },
  subtitle: { maxWidth: 750, margin: 0, fontSize: 13, lineHeight: 1.7, color: "var(--selen-text2)" },
  back: { fontSize: 12, fontWeight: 700, color: "var(--selen-gold2)", textDecoration: "none", paddingTop: 10 },
};
