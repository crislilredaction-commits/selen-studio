import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/app/agent/daily/communications/page.tsx", import.meta.url), "utf8");

test("le journal sépare explicitement preuve email et état métier de signature", () => {
  assert.match(source, /Preuve d’envoi et état métier sont affichés séparément/);
  assert.match(source, /une ouverture ou un clic ne vaut jamais signature/);
  assert.match(source, /opened: "Ouvert \(signal technique, pas preuve de lecture\)"/);
  assert.match(source, /clicked: "Lien cliqué \(signal technique, pas preuve de lecture\)"/);
});

test("les signatures sont raccordées aux communications par signature_id et non par simple email", () => {
  assert.match(source, /signatureIdFromCommunication/);
  assert.match(source, /record\(communication\.metadata\)\.signature_id/);
  assert.match(source, /\.select\("id,convention_id,session_id,signatory_type,signatory_name,signatory_email,status,viewed_at,signed_at,expires_at,last_error/);
});

test("les états métier couvrent non envoyé, attente, consultation, signature, expiration, annulation et échec", () => {
  for (const label of ["Non envoyé", "Signature attendue", "Consulté · signature attendue", "Signé", "Expiré", "Refusé / annulé", "Échec"]) {
    assert.match(source, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(source, /signature\.signed_at/);
  assert.match(source, /signature\.signatory_name/);
});

test("la relance H+72 est affichée depuis client_reminders sans changer l’assignation", () => {
  assert.match(source, /\.from\("client_reminders"\)/);
  assert.match(source, /\.eq\("reminder_type", "daily_signature_pending_72h"\)/);
  assert.match(source, /Relance nécessaire/);
  assert.match(source, /Relance prévue à H\+72/);
  assert.doesNotMatch(source, /daily_organisation_assignments.*update|assigned_agent_profile_id.*update/s);
});

test("les parties prenantes sont distinguées sans confondre convention et ordre de mission", () => {
  assert.match(source, /Apprenant/);
  assert.match(source, /Entreprise \/ commanditaire/);
  assert.match(source, /Formateur/);
  assert.match(source, /Autre partie prenante/);
  assert.doesNotMatch(source, /mission_order.*convention|convention.*mission_order/i);
});
