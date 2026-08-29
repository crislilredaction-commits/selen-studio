import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(new URL("../src/app/agent/api/messages/read-agent/route.ts", import.meta.url), "utf8");
const drawer = await readFile(new URL("../src/components/AgentMessagingDrawer.tsx", import.meta.url), "utf8");

test("la lecture agent synchronise les deux marqueurs de lecture", () => {
  assert.match(route, /read_by_agent_at:\s*readAt/);
  assert.match(route, /read_at:\s*readAt/);
  assert.match(route, /\.eq\("sender_type",\s*"client"\)/);
  assert.match(route, /\.is\("read_by_agent_at",\s*null\)/);
});

test("le tiroir ne masque le non-lu qu'après une réponse serveur réussie", () => {
  assert.match(drawer, /if\s*\(!response\.ok\)\s*return/);
  assert.match(drawer, /setLocalHasUnread\(false\)/);
  assert.match(drawer, /setLocalUnreadCount\(0\)/);
  assert.match(drawer, /router\.refresh\(\)/);
  assert.match(drawer, /localUnreadCount\s*>\s*0/);
});
