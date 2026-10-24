import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(new URL("../src/app/agent/daily/session-dossiers/[id]/attendance/pdf/route.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../src/app/agent/daily/session-dossiers/[id]/full/page.tsx", import.meta.url), "utf8");

test("le téléchargement des émargements exige un agent et le périmètre de l'organisme", () => {
  assert.match(route, /requireSupportAgent/);
  assert.match(route, /isDailyOrganisationInAgentScope/);
  assert.match(route, /eq\("organisation_id", session\.organisation_id\)/);
  assert.match(route, /eq\("session_id", id\)/);
});

test("le PDF contient les statuts canoniques, la preuve et les signatures disponibles", () => {
  for (const source of ["daily_attendance_slots", "daily_attendance_records", "daily_session_enrolments", "signature_storage_path", "proof_sha256"]) {
    assert.match(route, new RegExp(source));
  }
  assert.match(route, /status === "present"/);
  assert.match(route, /storage\.from\("documents"\)\.download/);
  assert.match(route, /doc\.addImage/);
  assert.match(route, /Les lignes « En attente » ne constituent pas une présence signée/);
});

test("le téléchargement est privé, borné et proposé depuis les présences", () => {
  assert.match(route, /runtime = "nodejs"/);
  assert.match(route, /dynamic = "force-dynamic"/);
  assert.match(route, /Content-Disposition/);
  assert.match(route, /Cache-Control": "private, no-store/);
  assert.match(route, /X-Content-Type-Options": "nosniff/);
  assert.match(page, /Télécharger les émargements \(PDF\)/);
  assert.match(page, /session-dossiers\/\$\{id\}\/attendance\/pdf/);
});

test("la feuille individuelle est bornée à une inscription active et à un relevé publié", () => {
  assert.match(route, /searchParams\.get\("enrolment"\)/);
  assert.match(route, /allEnrolments\.filter/);
  assert.match(route, /\["declined", "cancelled", "abandoned"\]/);
  assert.match(route, /isAfterSession\(session\.end_date\)/);
  assert.match(route, /document_type", "attendance_summary"/);
  assert.match(route, /\.in\("status", \["published", "signed"\]\)/);
  assert.match(route, /Toutes les présences de cet apprenant doivent être traitées/);
});

test("la feuille individuelle ajoute seulement les signatures apprenant et formateur du même créneau", () => {
  assert.match(route, /trainer_signature_evidence/);
  assert.match(route, /metadata\.slot_id/);
  assert.match(route, /Signature du formateur/);
  assert.match(route, /Signature de l’apprenant : non enregistrée/);
  assert.match(route, /Feuille d’émargement individuelle/);
  assert.match(route, /aucune métadonnée privée de revue n’est exposée/);
  assert.match(page, /Télécharger sa feuille individuelle \(PDF\)/);
  assert.match(page, /attendanceSettled/);
  assert.match(page, /publishedAttendance/);
});
