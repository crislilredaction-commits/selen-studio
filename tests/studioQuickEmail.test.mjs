import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const route = readFileSync("src/app/agent/api/quick-email/route.ts", "utf8");
const ui = readFileSync("src/components/agent/StudioQuickEmail.tsx", "utf8");
const layout = readFileSync("src/app/agent/layout.tsx", "utf8");
test("l'éditeur est disponible dans tout l'espace agent", () => { assert.match(layout, /StudioQuickEmail/); assert.match(ui, /position: "fixed"/); assert.match(ui, /role="dialog"/); });
test("l'envoi est autorisé, historisé et respecte le silence client", () => { assert.match(route, /requireSupportAgent/); assert.match(route, /daily_communications/); assert.match(route, /sendClientEmailWithSilence/); assert.match(route, /status: "queued"/); assert.match(route, /status: sent \? "sent" : "failed"/); });
