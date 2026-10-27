"use client";

import Link from "next/link";
import { useState } from "react";
import {
  DAILY_ADMIN_CATEGORIES,
  dailyAdministrationCategoryCounts,
  filterDailyAdministrationLinks,
  normalizeDailyAdminQuery,
} from "@/lib/daily/dailyAdministrationDirectory.mjs";

type AdminTool = { href: string; label: string; category: string; description: string };

/** Recherche et catégories appliquées uniquement aux liens filtrés par le serveur. */
export default function DailyAdministrationDirectory({ links }: { links: AdminTool[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Toutes");
  const visible = filterDailyAdministrationLinks(links, { query, category });
  const counts = dailyAdministrationCategoryCounts(links, query);

  return <section aria-label="Répertoire des outils Daily" style={s.directory}>
    <div style={s.toolbar}>
      <div style={s.searchWrap}>
        <label htmlFor="daily-admin-search" style={s.label}>Rechercher un outil</label>
        <input id="daily-admin-search" type="search" value={query} maxLength={80}
          placeholder="Ex. émargement, veille, satisfaction…"
          onChange={event => setQuery(normalizeDailyAdminQuery(event.target.value))}
          style={s.input} />
      </div>
      {(query || category !== "Toutes") && <button type="button" onClick={() => { setQuery(""); setCategory("Toutes"); }} style={s.reset}>
        Effacer les filtres
      </button>}
    </div>

    <div role="group" aria-label="Filtrer les outils par catégorie" style={s.filters}>
      {DAILY_ADMIN_CATEGORIES.map(item => <button key={item} type="button"
        aria-pressed={category === item} onClick={() => setCategory(item)}
        style={{ ...s.filter, ...(category === item ? s.activeFilter : {}) }}>
        {item} ({counts[item]})
      </button>)}
    </div>

    <p role="status" aria-live="polite" style={s.summary}>
      {visible.length} outil{visible.length > 1 ? "s" : ""} disponible{visible.length > 1 ? "s" : ""}
    </p>
    {visible.length === 0 ? <div style={s.empty}>
      <strong>Aucun outil ne correspond à votre recherche.</strong>
      <p>Essayez un autre mot-clé ou une autre catégorie.</p>
      <button type="button" onClick={() => { setQuery(""); setCategory("Toutes"); }} style={s.reset}>Afficher tous les outils</button>
    </div> : DAILY_ADMIN_CATEGORIES.slice(1).map(group => {
      const items = visible.filter(link => link.category === group);
      if (!items.length) return null;
      return <section key={group} aria-label={group} style={s.section}>
        <h2 style={s.sectionTitle}>{group} <span style={s.count}>({items.length})</span></h2>
        <div style={s.grid}>
          {items.map(link => <Link key={link.href} href={link.href} style={s.card}>
            <strong style={s.cardTitle}>{link.label}</strong>
            <span style={s.cardDescription}>{link.description}</span>
            <span aria-hidden="true" style={s.cardArrow}>Ouvrir →</span>
          </Link>)}
        </div>
      </section>;
    })}
  </section>;
}

const s: Record<string, import("react").CSSProperties> = {
  directory: { marginTop: 22 },
  toolbar: { display: "flex", flexWrap: "wrap", gap: 12, alignItems: "end" },
  searchWrap: { flex: "1 1 250px", maxWidth: 540 },
  label: { display: "block", fontSize: 13, fontWeight: 700, marginBottom: 7 },
  input: { width: "100%", padding: "11px 13px", border: "1px solid var(--selen-border)", borderRadius: 10, color: "var(--selen-text)", background: "var(--selen-bg2)", fontSize: 14 },
  reset: { padding: "10px 14px", border: "1px solid var(--selen-border)", borderRadius: 10, color: "var(--selen-gold2)", background: "var(--selen-bg2)", fontWeight: 700, cursor: "pointer" },
  filters: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 },
  filter: { padding: "9px 13px", borderRadius: 10, border: "1px solid var(--selen-border)", background: "var(--selen-bg2)", color: "var(--selen-text)", cursor: "pointer", fontWeight: 600 },
  activeFilter: { borderColor: "var(--selen-gold2)", color: "var(--selen-gold2)", boxShadow: "inset 0 0 0 1px var(--selen-gold2)" },
  summary: { fontSize: 12, color: "var(--selen-text2)", marginTop: 12 },
  section: { marginTop: 22 },
  sectionTitle: { fontFamily: "var(--font-display)", fontSize: 21, margin: "0 0 12px" },
  count: { fontFamily: "inherit", fontSize: 13, color: "var(--selen-text2)" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: 12 },
  card: { display: "flex", flexDirection: "column", gap: 8, padding: 18, minHeight: 130, border: "1px solid var(--selen-border)", borderRadius: 14, background: "var(--selen-bg2)", textDecoration: "none", color: "var(--selen-text)" },
  cardTitle: { fontSize: 15 },
  cardDescription: { fontSize: 12, lineHeight: 1.5, color: "var(--selen-text2)", flex: 1 },
  cardArrow: { color: "var(--selen-gold2)", fontWeight: 700, fontSize: 12 },
  empty: { border: "1px dashed var(--selen-border)", borderRadius: 14, padding: 24, marginTop: 16 },
};
