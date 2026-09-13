import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const login = readFileSync(new URL("../src/app/login/page.tsx", import.meta.url), "utf8");
const forgot = readFileSync(new URL("../src/app/mot-de-passe-oublie/page.tsx", import.meta.url), "utf8");
const update = readFileSync(new URL("../src/app/nouveau-mot-de-passe/page.tsx", import.meta.url), "utf8");

test("Studio expose le parcours mot de passe oublié", () => {
  assert.match(login, /Mot de passe oublié \?/);
  assert.match(login, /href="\/mot-de-passe-oublie"/);
});

test("Studio demande le reset via Supabase sans révéler l'existence du compte", () => {
  assert.match(forgot, /resetPasswordForEmail\(normalizedEmail, \{ redirectTo \}\)/);
  assert.match(forgot, /\/nouveau-mot-de-passe/);
  assert.match(forgot, /Si un compte Selen correspond à cette adresse/);
});

test("Studio change le mot de passe seulement depuis une session de récupération", () => {
  assert.match(update, /exchangeCodeForSession\(code\)/);
  assert.match(update, /setSession\(\{/);
  assert.match(update, /getSession\(\)/);
  assert.match(update, /PASSWORD_RECOVERY/);
  assert.match(update, /updateUser\(\{ password \}\)/);
  assert.match(update, /password\.length < 8/);
  assert.match(update, /password !== confirmation/);
});
