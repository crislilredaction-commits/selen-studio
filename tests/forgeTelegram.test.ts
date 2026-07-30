import assert from "node:assert/strict";
import test from "node:test";
import {
  processForgeTelegramQueue,
  sendForgeTelegramTest,
} from "../src/lib/server/forgeTelegram.ts";

function withTelegramEnvironment() {
  const previous = { ...process.env };
  process.env.FORGE_TELEGRAM_ENABLED = "true";
  process.env.FORGE_TELEGRAM_ALLOWED_ENV = "preview";
  process.env.FORGE_TELEGRAM_BOT_TOKEN = "fake-token";
  process.env.FORGE_TELEGRAM_LIL_CHAT_ID = "fake-chat";
  process.env.FORGE_STUDIO_PUBLIC_URL = "https://studio.invalid";
  process.env.VERCEL_ENV = "preview";
  return () => { process.env = previous; };
}

test("le message de test est explicite et utilise uniquement le transport mocké", async () => {
  const restoreEnvironment = withTelegramEnvironment();
  const previousFetch = global.fetch;
  let sentBody = "";
  global.fetch = async (_input, init) => {
    sentBody = String(init?.body);
    return new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    assert.equal(await sendForgeTelegramTest(), "42");
    assert.match(sentBody, /\[TEST\]/);
    assert.match(sentBody, /Lil,/);
  } finally {
    global.fetch = previousFetch;
    restoreEnvironment();
  }
});

test("la file est traitée une fois et finalisée avec un transport mocké", async () => {
  const restoreEnvironment = withTelegramEnvironment();
  const previousFetch = global.fetch;
  let transportCalls = 0;
  global.fetch = async () => {
    transportCalls += 1;
    return new Response(JSON.stringify({ ok: true, result: { message_id: 84 } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const rpcCalls: Array<{ name: string; values: unknown }> = [];
  const admin = {
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              return {
                single: async () => table === "forge_telegram_settings"
                  ? { data: { enabled: true }, error: null }
                  : {
                      data: {
                        title: "Mission prête",
                        message: "Lil, la mission est prête à reprendre.",
                        level: "important",
                        action_target: "/agent/forge/cody",
                      },
                      error: null,
                    },
              };
            },
          };
        },
      };
    },
    async rpc(name: string, values: unknown) {
      rpcCalls.push({ name, values });
      if (name === "forge_claim_telegram_deliveries") {
        return { data: [{ id: "delivery-1", alert_id: "alert-1" }], error: null };
      }
      return { data: null, error: null };
    },
  };
  try {
    const result = await processForgeTelegramQueue(admin as never, 1);
    assert.equal(result.sent, 1);
    assert.equal(transportCalls, 1);
    assert.deepEqual(rpcCalls.map((call) => call.name), [
      "forge_claim_telegram_deliveries",
      "forge_finish_telegram_delivery",
    ]);
  } finally {
    global.fetch = previousFetch;
    restoreEnvironment();
  }
});

test("un environnement non autorisé ne contacte jamais Telegram", async () => {
  const restoreEnvironment = withTelegramEnvironment();
  process.env.VERCEL_ENV = "production";
  const previousFetch = global.fetch;
  let called = false;
  global.fetch = async () => {
    called = true;
    throw new Error("unexpected network call");
  };
  try {
    const result = await processForgeTelegramQueue({} as never);
    assert.equal(result.skipped, true);
    assert.equal(called, false);
  } finally {
    global.fetch = previousFetch;
    restoreEnvironment();
  }
});
