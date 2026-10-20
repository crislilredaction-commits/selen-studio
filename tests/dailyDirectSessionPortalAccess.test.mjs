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
  assert.match(sessionPage, /await buildCanonicalDirectSessionPortalDefinitions\(\{ supabase: admin, session \}\)/);
  assert.match(sessionPage, /registration_status: "summary_validated"/);
});

test("existing session page is preserved and only summary validation is overridden", () => {
  assert.match(sessionPage, /LegacyAgentDailySessionPage/);
  assert.match(sessionPage, /element\.props\.value === "summary_validated"/);
  assert.match(sessionPage, /formAction: summaryValidatedAction/);
});

test("manual learner access resend normalizes the canonical enrolment status before side effects", () => {
  const inactiveStatusBlock = helper.match(/const INACTIVE_LEARNER_ENROLMENT_STATUSES = new Set\(\[([\s\S]*?)\]\);/)?.[1] ?? "";
  const inactiveStatuses = [...inactiveStatusBlock.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  const isActive = (status) => !new Set(inactiveStatuses).has(String(status ?? "").trim().toLowerCase());

  for (const status of ["declined", "cancelled", "canceled", "abandoned", " CANCELLED ", "CaNcElEd"]) {
    assert.equal(isActive(status), false, `expected ${JSON.stringify(status)} to be inactive`);
  }
  for (const status of ["completed", "pending", null]) {
    assert.equal(isActive(status), true, `expected ${JSON.stringify(status)} to remain eligible`);
  }

  const resend = helper.slice(helper.indexOf("export async function resendExistingDailyPortalAccess"));
  const guardIndex = resend.indexOf("!isDailyLearnerEnrolmentActive(enrolment.status)");
  const communicationInsertIndex = resend.indexOf('.from("daily_communications").insert');
  const sendIndex = resend.indexOf("sendClientEmailWithSilence");

  assert.ok(guardIndex >= 0, "canonical status guard must be present");
  assert.ok(communicationInsertIndex > guardIndex, "status guard must run before communication creation");
  assert.ok(sendIndex > guardIndex, "status guard must run before email delivery");
});

test("automatic provisioning uses canonical active enrolments before token creation or email", () => {
  const canonicalBuilder = helper.slice(
    helper.indexOf("export async function buildCanonicalDirectSessionPortalDefinitions"),
    helper.indexOf("function isSyntheticEmail"),
  );
  const provisioner = helper.slice(
    helper.indexOf("export async function provisionDirectSessionPortalAccesses"),
    helper.indexOf("export async function resendExistingDailyPortalAccess"),
  );

  assert.match(canonicalBuilder, /\.from\("daily_session_enrolments"\)/);
  assert.match(canonicalBuilder, /\.filter\(\(enrolment\) => isDailyLearnerEnrolmentActive\(enrolment\.status\)\)/);
  assert.match(canonicalBuilder, /\.from\("daily_learners"\)/);
  assert.match(canonicalBuilder, /Identité canonique de l’apprenant introuvable ; aucun accès n’a été créé\./);
  assert.match(helper, /entity_key: `learner:\$\{learner\.learner_id\}`/);
  assert.doesNotMatch(
    helper.slice(helper.indexOf("export function buildDirectSessionPortalDefinitions"), helper.indexOf("function isSyntheticEmail")),
    /individual_beneficiaries|participants\(session\./,
  );

  const canonicalCall = sessionPage.indexOf("await buildCanonicalDirectSessionPortalDefinitions");
  const provisionCall = sessionPage.indexOf("await provisionDirectSessionPortalAccesses");
  const tokenWrite = provisioner.indexOf('.from("daily_portal_access_tokens")');
  const sendCall = provisioner.indexOf("sendClientEmailWithSilence");

  assert.ok(canonicalCall >= 0 && provisionCall > canonicalCall, "canonical enrolments must be loaded before provisioning");
  assert.ok(tokenWrite >= 0, "token persistence must remain inside the guarded provisioner");
  assert.ok(sendCall > tokenWrite, "email delivery must remain after token persistence");
});
