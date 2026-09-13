import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const helper = readFileSync(new URL("../src/lib/server/dailyPortalAuthEntry.ts", import.meta.url), "utf8");

test("un compte portail n'est considéré activé qu'après création explicite du mot de passe", () => {
  assert.match(helper, /selen_password_configured/);
  assert.doesNotMatch(helper, /user\?\.last_sign_in_at/);
});

test("un compte existant non activé reçoit encore un parcours de création de mot de passe", () => {
  assert.match(helper, /const linkType = user \? "recovery" as const : "invite" as const/);
  assert.match(helper, /\/client\/activation\?token_hash=/);
});
