import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const followupPage = readFileSync(new URL("../src/app/agent/daily/session-dossiers/[id]/followup/page.tsx", import.meta.url), "utf8");
const pdfRoute = readFileSync(new URL("../src/app/agent/daily/session-dossiers/[id]/followup/pdf/route.ts", import.meta.url), "utf8");

test("la fiche de suivi expose son téléchargement PDF", () => {
  assert.match(followupPage, /followup\/pdf/);
  assert.match(followupPage, /Télécharger la fiche PDF/);
});

test("le PDF reste protégé par l'authentification agent", () => {
  assert.match(pdfRoute, /requireSupportAgent\(\)/);
  assert.match(pdfRoute, /status: 403/);
});

test("le PDF réutilise les sources canoniques de session", () => {
  assert.match(pdfRoute, /\.from\("daily_sessions"\)/);
  assert.match(pdfRoute, /\.from\("daily_session_followup_entries"\)/);
  assert.match(pdfRoute, /\.from\("daily_session_enrolments"\)/);
  assert.doesNotMatch(pdfRoute, /daily_incidents/);
});

test("le téléchargement produit explicitement un PDF non mis en cache", () => {
  assert.match(pdfRoute, /new jsPDF/);
  assert.match(pdfRoute, /"Content-Type": "application\/pdf"/);
  assert.match(pdfRoute, /"Cache-Control": "private, no-store"/);
  assert.match(pdfRoute, /Content-Disposition/);
});
