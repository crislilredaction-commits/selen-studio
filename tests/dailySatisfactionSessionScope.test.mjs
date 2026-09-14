import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../src/app/agent/daily/session-dossiers/[id]/satisfaction/page.tsx", import.meta.url),
  "utf8",
);

test("le détail satisfaction refuse une session hors périmètre Daily", () => {
  assert.match(source, /isDailyOrganisationInAgentScope/);
  assert.match(source, /from\("daily_sessions"\)/);
  assert.match(source, /if \(!session\?\.organisation_id\)/);
  assert.match(
    source,
    /isDailyOrganisationInAgentScope\(auth\.email,\s*session\.organisation_id\)/,
  );
  assert.match(source, /return <main style=\{\{ padding: 28 \}\}>Accès refusé\.<\/main>/);
});

test("le contrôle de périmètre précède les lectures de satisfaction", () => {
  const scopeGuard = source.indexOf("isDailyOrganisationInAgentScope(auth.email, session.organisation_id)");
  const stakeholderRead = source.indexOf('from("daily_stakeholder_satisfaction_responses")');
  const learnerRead = source.indexOf('from("daily_learner_feedback_responses")');

  assert.ok(scopeGuard >= 0, "garde de périmètre absente");
  assert.ok(stakeholderRead > scopeGuard, "les réponses parties prenantes sont lues avant le contrôle d'accès");
  assert.ok(learnerRead > scopeGuard, "les réponses apprenants sont lues avant le contrôle d'accès");
});
