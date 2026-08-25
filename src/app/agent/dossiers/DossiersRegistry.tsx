"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import SelenBadge from "@/components/ui/SelenBadge";
import SelenButton from "@/components/ui/SelenButton";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";

export type RegistryEntry = {
  key: string;
  title: string;
  organisationName: string;
  siret: string | null;
  prestation: string;
  prestationKey: string;
  status: string;
  statusLabel: string;
  createdAt: string;
  href: string | null;
  secondary: string | null;
};

const PRESTATION_VARIANTS: Record<string, "type" | "info" | "warn" | "success" | "danger" | "neutral"> = {
  nda: "type",
  preaudit: "info",
  audit_blanc: "info",
  daily: "success",
  prepa: "warn",
  non_conformite: "danger",
};

function normalise(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export default function DossiersRegistry({ entries }: { entries: RegistryEntry[] }) {
  const [search, setSearch] = useState("");
  const [prestation, setPrestation] = useState("all");
  const [hideArchived, setHideArchived] = useState(true);

  const prestations = useMemo(() => {
    const labels = new Map<string, string>();
    entries.forEach((entry) => labels.set(entry.prestationKey, entry.prestation));
    return [...labels.entries()].sort((a, b) => a[1].localeCompare(b[1], "fr"));
  }, [entries]);

  const archivedCount = useMemo(
    () => entries.filter((entry) => entry.status === "archived").length,
    [entries],
  );

  const filteredEntries = useMemo(() => {
    const q = normalise(search);
    return entries.filter((entry) => {
      if (hideArchived && entry.status === "archived") return false;

      const matchesPrestation = prestation === "all" || entry.prestationKey === prestation;
      if (!matchesPrestation) return false;
      if (!q) return true;

      const haystack = normalise(
        [entry.title, entry.organisationName, entry.siret, entry.prestation, entry.secondary]
          .filter(Boolean)
          .join(" "),
      );
      return haystack.includes(q);
    });
  }, [entries, hideArchived, prestation, search]);

  return (
    <>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(220px, 1fr) minmax(190px, 260px) auto",
          gap: 10,
          marginBottom: 16,
          alignItems: "center",
        }}
      >
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Rechercher par nom, SIRET ou prestation…"
          aria-label="Rechercher un dossier par nom, SIRET ou prestation"
          style={{
            width: "100%",
            minHeight: 42,
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--selen-border)",
            background: "var(--selen-bg3)",
            color: "var(--selen-text)",
            padding: "0 13px",
            fontSize: 13,
            outline: "none",
          }}
        />

        <select
          value={prestation}
          onChange={(event) => setPrestation(event.target.value)}
          aria-label="Filtrer par prestation"
          style={{
            width: "100%",
            minHeight: 42,
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--selen-border)",
            background: "var(--selen-bg3)",
            color: "var(--selen-text)",
            padding: "0 12px",
            fontSize: 13,
          }}
        >
          <option value="all">Toutes les prestations</option>
          {prestations.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>

        <label
          style={{
            minHeight: 42,
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "0 12px",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--selen-border)",
            background: "var(--selen-bg3)",
            color: "var(--selen-text2)",
            fontSize: 12,
            whiteSpace: "nowrap",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={hideArchived}
            onChange={(event) => setHideArchived(event.target.checked)}
          />
          Masquer les archivés{archivedCount > 0 ? ` (${archivedCount})` : ""}
        </label>
      </div>

      <SelenCard>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 14 }}>
          <SelenCardTitle>Tous les dossiers clients</SelenCardTitle>
          <span style={{ fontSize: 12, color: "var(--selen-text3)" }}>
            {filteredEntries.length} / {entries.length}
          </span>
        </div>

        {filteredEntries.length === 0 ? (
          <div style={{ padding: "8px 2px 2px", fontSize: 13, color: "var(--selen-text3)" }}>
            Aucun dossier ne correspond à cette recherche.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filteredEntries.map((entry) => {
              const content = (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(180px, 1.55fr) minmax(160px, 1.25fr) minmax(120px, .85fr) minmax(120px, .9fr) 84px",
                    gap: 12,
                    alignItems: "center",
                    padding: "14px 16px",
                    borderRadius: "var(--radius-md)",
                    background: "var(--selen-bg3)",
                    border: "1px solid var(--selen-border)",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--selen-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {entry.organisationName || entry.title}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 11, color: "var(--selen-text3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {entry.title !== entry.organisationName ? entry.title : entry.secondary || "Dossier client"}
                    </div>
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: "var(--selen-text2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      SIRET {entry.siret || "non renseigné"}
                    </div>
                    {entry.secondary ? (
                      <div style={{ marginTop: 4, fontSize: 11, color: "var(--selen-text3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {entry.secondary}
                      </div>
                    ) : null}
                  </div>

                  <div>
                    <SelenBadge variant={PRESTATION_VARIANTS[entry.prestationKey] ?? "neutral"} dot>
                      {entry.prestation}
                    </SelenBadge>
                  </div>

                  <div style={{ fontSize: 12, color: "var(--selen-text2)" }}>
                    {entry.statusLabel}
                  </div>

                  <div style={{ textAlign: "right" }}>
                    {entry.href ? (
                      <span style={{ fontSize: 12, color: "var(--selen-gold2)" }}>Ouvrir →</span>
                    ) : (
                      <span style={{ fontSize: 11, color: "var(--selen-text3)" }}>Référencé</span>
                    )}
                  </div>
                </div>
              );

              return entry.href ? (
                <Link key={entry.key} href={entry.href} style={{ textDecoration: "none", color: "inherit" }}>
                  {content}
                </Link>
              ) : (
                <div key={entry.key}>{content}</div>
              );
            })}
          </div>
        )}
      </SelenCard>

      <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Link href="/agent/dossiers/new" style={{ textDecoration: "none" }}>
          <SelenButton variant="secondary" size="sm">+ Nouveau dossier</SelenButton>
        </Link>
      </div>
    </>
  );
}
