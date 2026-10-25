import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { detectAttendanceSignatureFormat } from "../src/lib/daily/attendanceSignatureImage.mjs";

const route = await readFile(new URL("../src/app/agent/daily/session-dossiers/[id]/attendance/pdf/route.ts", import.meta.url), "utf8");
const page = await readFile(new URL("../src/app/agent/daily/session-dossiers/[id]/full/page.tsx", import.meta.url), "utf8");
const picker = await readFile(new URL("../src/components/agent/IndividualAttendanceDownload.tsx", import.meta.url), "utf8");

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

test("plusieurs relevés publiés ne bloquent pas les feuilles individuelles et les archives sont exclues", () => {
  // Un relevé collectif et des relevés individuels peuvent coexister sur la même session.
  // maybeSingle sans limit(1) renverrait PGRST116 au lieu d'une preuve de publication.
  assert.match(route, /\.eq\("document_type", "attendance_summary"\)[\s\S]*?\.is\("archived_at", null\)\.limit\(1\)\.maybeSingle\(\)/);
  assert.match(page, /\.eq\("document_type","attendance_summary"\)[\s\S]*?\.is\("archived_at",null\)\.limit\(1\)\.maybeSingle\(\)/);
  assert.match(route, /if \(requestedEnrolmentId && !publicationResult\.data\)/);
  assert.match(page, /publicationUnavailable=\{Boolean\(publishedAttendanceError\)\}/);
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

test("Studio permet de choisir explicitement l'apprenant avant de télécharger son PDF", () => {
  assert.match(page, /IndividualAttendanceDownload/);
  assert.match(page, /attendanceSettled\(statuses\)/);
  assert.match(picker, /Choisir l’apprenant concerné/);
  assert.match(picker, /Télécharger son PDF/);
  assert.match(picker, /signatures du\s+formateur correspondant aux mêmes créneaux/);
  assert.match(picker, /disabled=\{!canDownload\}/);
});

test("les signatures PNG et JPEG sont reconnues par leurs octets, pas par leur extension", () => {
  assert.equal(detectAttendanceSignatureFormat(Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0x00])), "PNG");
  assert.equal(detectAttendanceSignatureFormat(Uint8Array.from([0xff,0xd8,0xff,0xe0,0x00])), "JPEG");
});

test("les images vides, tronquées ou non prises en charge sont refusées sans inventer une signature", () => {
  assert.equal(detectAttendanceSignatureFormat(new Uint8Array()), null);
  assert.equal(detectAttendanceSignatureFormat(Uint8Array.from([0x89,0x50,0x4e,0x47])), null);
  assert.equal(detectAttendanceSignatureFormat(Uint8Array.from([0x52,0x49,0x46,0x46,0x00])), null);
  assert.equal(detectAttendanceSignatureFormat(Uint8Array.from([0xff,0xd8])), null);
});

test("le PDF garde une mention de preuve indisponible si une signature apprenant ou formateur est illisible", () => {
  assert.match(route, /detectAttendanceSignatureFormat\(bytes\)/);
  assert.match(route, /try \{\s*doc\.addImage/);
  assert.match(route, /catch \{[\s\S]*?return false/);
  assert.match(route, /if \(addSignaturePreview\(doc, bytes, left, y\)\)/);
  assert.match(route, /if \(addSignaturePreview\(doc, trainerBytes, left, y\)\)/);
  assert.match(route, /aperçu illisible ou format non pris en charge/);
});
