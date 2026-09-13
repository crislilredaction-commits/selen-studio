import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const helper = readFileSync(new URL("../src/lib/server/dailyDirectSessionPortalAccess.ts", import.meta.url), "utf8");
const authEntry = readFileSync(new URL("../src/lib/server/dailyPortalAuthEntry.ts", import.meta.url), "utf8");
const sessionPage = readFileSync(new URL("../src/app/agent/daily/sessions/[id]/page.tsx", import.meta.url), "utf8");

test("direct-session portal access only targets learner and enterprise", () => {
  assert.match(helper, /portal_type === "learner" \|\| definition\.portal_type === "enterprise"/);
  assert.doesNotMatch(helper, /portal_type:\s*"trainer"/);
});

test("direct-session portal access never sends to synthetic invalid addresses", () => {
  assert.match(helper, /endsWith\("\.invalid"\)/);
  assert.match(helper, /synthetic_invalid_email/);
});

test("direct-session portal access is idempotent for an already sent active token", () => {
  assert.match(helper, /isActiveAccess\(current\)/);
  assert.match(helper, /metadata\.email_sent === true/);
  assert.match(helper, /onConflict: "session_id,portal_type,entity_key"/);
});

test("portal auth entry only uses explicit password activation marker", () => {
  assert.match(authEntry, /selen_password_configured/);
  assert.doesNotMatch(authEntry, /user\?\.last_sign_in_at/);
});

test("existing unconfigured auth user still receives recovery activation", () => {
  assert.match(authEntry, /const linkType = user \? "recovery" as const : "invite" as const/);
  assert.match(authEntry, /\/client\/activation\?token_hash=/);
});

test("summary validation provisions direct-session learner and enterprise access", () => {
  assert.match(sessionPage, /provisionDirectSessionPortalAccesses/);
  assert.match(sessionPage, /summaryValidatedAction/);
  assert.match(sessionPage, /buildDirectSessionPortalDefinitions\(session\)/);
  assert.match(sessionPage, /registration_status: "summary_validated"/);
});

test("existing session page is preserved and only summary validation is overridden", () => {
  assert.match(sessionPage, /LegacyAgentDailySessionPage/);
  assert.match(sessionPage, /element\.props\.value === "summary_validated"/);
  assert.match(sessionPage, /formAction: summaryValidatedAction/);
});
