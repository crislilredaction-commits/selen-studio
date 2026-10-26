"use client";

import { createDailySatisfactionCsv } from "@/lib/daily/dailySatisfactionCsv.mjs";

export type DailySatisfactionExportRow = {
  formation: string;
  organisation: string;
  reference: string;
  startDate: string;
  endDate: string;
  expectedLearners: number;
  learnerDone: number;
  missingLearners: number;
  companyDone: number;
  trainerDone: number;
  clientDone: number;
};

export default function DailySatisfactionCsvExport({ rows }: { rows: DailySatisfactionExportRow[] }) {
  function download() {
    if (rows.length === 0) return;
    const csv = createDailySatisfactionCsv(rows);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `selen-satisfaction-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <button
      type="button"
      onClick={download}
      disabled={rows.length === 0}
      aria-label={`Exporter les ${rows.length} sessions affichées au format CSV`}
      style={{
        minHeight: 40, padding: "8px 14px", borderRadius: 9,
        border: "1px solid var(--selen-border2)", background: "var(--selen-bg2)",
        color: "var(--selen-text)", fontSize: 12, fontWeight: 800,
        cursor: rows.length ? "pointer" : "not-allowed",
      }}
    >
      Exporter les {rows.length} sessions (CSV)
    </button>
  );
}
