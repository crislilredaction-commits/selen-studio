import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(
  new URL("../src/app/agent/daily/organisations/[id]/page.tsx", import.meta.url),
  "utf8",
);

test("le dossier OF scope les profils clients via les adhésions réelles", () => {
  assert.match(page, /from\("organisation_memberships"\).*eq\("organisation_id", id\)/);
  assert.match(page, /const memberUserIds = \[\.\.\.new Set\(memberships/);
  assert.match(
    page,
    /from\("selen_client_profiles"\)\.select\("user_id,email,full_name"\)\.in\("user_id", memberUserIds\)/,
  );
});

test("aucune requête ne suppose une colonne organisation_id sur selen_client_profiles", () => {
  assert.doesNotMatch(
    page,
    /from\("selen_client_profiles"\)[\s\S]{0,180}organisation_id/,
  );
});
