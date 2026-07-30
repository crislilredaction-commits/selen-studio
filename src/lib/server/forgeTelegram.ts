import type { SupabaseAdminClient } from "@/lib/server/supabaseAdmin";

type TelegramDelivery = {
  id: string;
  alert_id: string;
};

type ForgeAlert = {
  title: string;
  message: string;
  level: string;
  action_target: string;
};

export function telegramRuntimeStatus() {
  const enabled = process.env.FORGE_TELEGRAM_ENABLED === "true";
  const allowed = (process.env.FORGE_TELEGRAM_ALLOWED_ENV ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const environment = process.env.VERCEL_ENV ?? "development";
  const configured = Boolean(
    process.env.FORGE_TELEGRAM_BOT_TOKEN?.trim()
    && process.env.FORGE_TELEGRAM_LIL_CHAT_ID?.trim()
    && process.env.FORGE_STUDIO_PUBLIC_URL?.trim(),
  );
  return { enabled, allowed: allowed.includes(environment), configured, environment };
}

function messageFor(alert: ForgeAlert, test = false) {
  const base = process.env.FORGE_STUDIO_PUBLIC_URL!.replace(/\/$/, "");
  const target = alert.action_target.startsWith("/") ? alert.action_target : "/agent/forge/alerts";
  const prefix = test ? "[TEST] " : "";
  return [
    `${prefix}🤝 Cody · ${alert.title}`,
    "",
    alert.message,
    "",
    `Voir dans le Studio : ${base}${target}`,
  ].join("\n");
}

async function sendTelegram(text: string) {
  const response = await fetch(
    `https://api.telegram.org/bot${process.env.FORGE_TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: process.env.FORGE_TELEGRAM_LIL_CHAT_ID,
        text,
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(10_000),
    },
  );
  const body = await response.json().catch(() => null) as
    | { ok?: boolean; result?: { message_id?: number } }
    | null;
  if (!response.ok || !body?.ok || !body.result?.message_id) {
    throw new Error(`telegram_http_${response.status}`);
  }
  return String(body.result.message_id);
}

export async function processForgeTelegramQueue(
  admin: SupabaseAdminClient,
  limit = 10,
) {
  const runtime = telegramRuntimeStatus();
  if (!runtime.enabled || !runtime.allowed || !runtime.configured) {
    return { processed: 0, sent: 0, skipped: true, runtime };
  }

  const { data: setting, error: settingError } = await admin
    .from("forge_telegram_settings")
    .select("enabled")
    .eq("id", true)
    .single();
  if (settingError || !setting?.enabled) {
    return { processed: 0, sent: 0, skipped: true, runtime };
  }

  const { data, error } = await admin.rpc("forge_claim_telegram_deliveries", {
    p_limit: limit,
  });
  if (error) throw new Error("telegram_queue_claim_failed");

  let sent = 0;
  for (const delivery of (data ?? []) as TelegramDelivery[]) {
    const { data: alert } = await admin
      .from("forge_alerts")
      .select("title,message,level,action_target")
      .eq("id", delivery.alert_id)
      .single();
    try {
      if (!alert) throw new Error("telegram_alert_missing");
      const messageId = await sendTelegram(messageFor(alert as ForgeAlert));
      await admin.rpc("forge_finish_telegram_delivery", {
        p_delivery_id: delivery.id,
        p_sent: true,
        p_message_id: messageId,
        p_error: null,
      });
      sent += 1;
    } catch (deliveryError) {
      const safeError = deliveryError instanceof Error
        ? deliveryError.message.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100)
        : "telegram_delivery_failed";
      await admin.rpc("forge_finish_telegram_delivery", {
        p_delivery_id: delivery.id,
        p_sent: false,
        p_message_id: null,
        p_error: safeError,
      });
    }
  }
  return { processed: (data ?? []).length, sent, skipped: false, runtime };
}

export async function sendForgeTelegramTest() {
  return sendTelegram([
    "[TEST] 🤝 Cody",
    "",
    "Lil, la liaison Telegram avec La Forge est prête. Ce message confirme uniquement le canal technique.",
  ].join("\n"));
}

