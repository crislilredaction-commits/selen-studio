import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const middleware = readFileSync(
  new URL("../src/middleware.ts", import.meta.url),
  "utf8",
);

test("le middleware borne l'appel Supabase sous la limite Vercel", () => {
  assert.match(middleware, /const AUTH_LOOKUP_TIMEOUT_MS = 5_000/);
  assert.match(middleware, /Promise\.race\(\[promise, timeout\]\)/);
  assert.match(
    middleware,
    /withTimeout\(\s*supabase\.auth\.getUser\(\),\s*AUTH_LOOKUP_TIMEOUT_MS/,
  );
  assert.match(middleware, /clearTimeout\(timeoutId\)/);
});

test("une panne réseau échoue fermée sans exposer la page agent", () => {
  const guardedLookup = middleware.indexOf("await withTimeout(");
  const unavailableResponse = middleware.indexOf("return authUnavailableResponse()");
  const normalResponse = middleware.lastIndexOf("return response;");

  assert.ok(guardedLookup >= 0);
  assert.ok(unavailableResponse > guardedLookup);
  assert.ok(normalResponse > unavailableResponse);
  assert.match(middleware, /status: 503/);
  assert.match(middleware, /"Cache-Control": "no-store"/);
  assert.match(middleware, /"Retry-After": "5"/);
});

test("l'absence de session continue de rediriger vers la connexion", () => {
  assert.match(middleware, /if \(isAgentPage && !user\)/);
  assert.match(middleware, /redirectUrl\.pathname = "\/login"/);
  assert.match(
    middleware,
    /redirectUrl\.searchParams\.set\("redirectedFrom", request\.nextUrl\.pathname\)/,
  );
});
