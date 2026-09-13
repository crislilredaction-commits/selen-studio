import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const login = readFileSync(new URL("../src/app/login/page.tsx", import.meta.url), "utf8");
const forgot = readFileSync(new URL("../src/app/mot-de-passe-oublie/page.tsx", import.meta.url), "utf8");
const confirm = readFileSync(new URL("../src/app/confirmer-recuperation/page.tsx", import.meta.url), "utf8");
const update = readFileSync(new URL("../src/app/nouveau-mot-de-passe/page.tsx", import.meta.url), "utf8");
const supabaseClient = readFileSync(new URL("../src/lib/supabase/client.ts", import.meta.url), "utf8");

test("Studio expose le parcours mot de passe oublié", () => {
  assert.match(login, /Mot de passe oublié \?/);
  assert.match(login, /href="\/mot-de-passe-oublie"/);
});

test("Studio demande le reset via Supabase sans révéler l'existence du compte", () => {
  assert.match(forgot, /resetPasswordForEmail\(normalizedEmail, \{ redirectTo \}\)/);
  assert.match(forgot, /\/confirmer-recuperation/);
  assert.match(forgot, /Si un compte Selen correspond à cette adresse/);
});

test("Studio vérifie le jeton seulement après une confirmation humaine", () => {
  assert.match(confirm, /searchParams\.get\("token_hash"\)/);
  assert.match(confirm, /recoveryType !== "recovery"/);
  assert.match(confirm, /window\.history\.replaceState/);
  assert.match(confirm, /async function handleConfirm\(\)/);
  assert.match(confirm, /verifyOtp\(\{/);
  assert.match(confirm, /token_hash: recoveryToken/);
  assert.match(confirm, /type: "recovery"/);
  assert.match(confirm, /onClick=\{handleConfirm\}/);
  assert.match(confirm, /router\.replace\("\/nouveau-mot-de-passe"\)/);
});

test("Studio change le mot de passe seulement depuis une session de récupération", () => {
  assert.match(update, /detectSessionInUrl: false/);
  assert.match(update, /isSingleton: false/);
  assert.match(update, /exchangeCodeForSession\(code\)/);
  assert.match(update, /setSession\(\{/);
  assert.match(update, /getSession\(\)/);
  assert.match(update, /PASSWORD_RECOVERY/);
  assert.match(update, /updateUser\(\{ password \}\)/);
  assert.match(update, /password\.length < 8/);
  assert.match(update, /password !== confirmation/);
});

test("Studio désactive l'échange PKCE automatique sur la page de récupération", () => {
  assert.match(supabaseClient, /detectSessionInUrl\?: boolean/);
  assert.match(supabaseClient, /isSingleton\?: boolean/);
});
