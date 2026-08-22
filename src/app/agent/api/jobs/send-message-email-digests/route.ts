import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { requireLilOwner } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import {
  renderSelenEmailFromText,
  sendSelenEmail,
} from "@/lib/server/selenEmailLayout";

type PendingNotification = {
  id: string;
  dossier_id: string | null;
  dossier_title: string | null;
  organisation_name: string | null;
  link_path: string | null;
  target_user_id: string | null;
  title: string;
  content: string | null;
  created_at: string;
};

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

async function authorize(req: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authHeader = req.headers.get("authorization") ?? "";

  if (cronSecret && safeEqual(authHeader, `Bearer ${cronSecret}`)) {
    return { ok: true as const, caller: "cron-secret" };
  }

  const auth = await requireLilOwner();
  if (auth.ok) {
    return { ok: true as const, caller: auth.email };
  }

  return {
    ok: false as const,
    error: auth.error,
    status: auth.status,
  };
}

function groupKey(notification: PendingNotification) {
  return `${notification.target_user_id ?? "unassigned"}:${notification.dossier_id ?? "no-dossier"}`;
}

function buildAgentUrl(linkPath: string | null) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (!baseUrl) return undefined;
  return `${baseUrl}${linkPath ?? "/agent/dossiers"}`;
}

function messageDigestBody(notifications: PendingNotification[]) {
  const first = notifications[0];
  const organisation = first?.organisation_name ?? "Un client";
  const dossier = first?.dossier_title ?? "un dossier";
  const visible = notifications.slice(0, 5);
  const hiddenCount = Math.max(0, notifications.length - visible.length);

  const messageBlocks = visible.map((notification, index) => {
    const content = notification.content?.trim() || "Nouveau message sans aperçu.";
    return `Message ${index + 1} :\n${content}`;
  });

  return [
    "Bonjour,",
    `${organisation} vous a écrit dans ${dossier}.`,
    notifications.length === 1
      ? "Ce message n’a pas encore été lu dans Selen depuis plus de 10 minutes."
      : `${notifications.length} messages n’ont pas encore été lus dans Selen depuis plus de 10 minutes.`,
    ...messageBlocks,
    hiddenCount > 0
      ? `${hiddenCount} autre${hiddenCount > 1 ? "s" : ""} message${hiddenCount > 1 ? "s" : ""} vous attend${hiddenCount > 1 ? "ent" : ""} dans Selen.`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function GET(req: Request) {
  try {
    const auth = await authorize(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: "RESEND_API_KEY absente.",
      });
    }

    const admin = createSupabaseAdminClient();
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const { data, error } = await admin
      .from("notifications")
      .select(
        "id, dossier_id, dossier_title, organisation_name, link_path, target_user_id, title, content, created_at",
      )
      .eq("type", "client_message")
      .is("read_at", null)
      .is("dismissed_at", null)
      .is("email_sent_at", null)
      .lte("created_at", tenMinutesAgo)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const pending = (data ?? []) as PendingNotification[];
    const groups = new Map<string, PendingNotification[]>();

    for (const notification of pending) {
      if (!notification.target_user_id) continue;
      const key = groupKey(notification);
      const current = groups.get(key) ?? [];
      current.push(notification);
      groups.set(key, current);
    }

    const results: Array<{
      dossierId: string | null;
      targetUserId: string;
      count: number;
      status: "sent" | "skipped" | "failed";
      reason?: string;
    }> = [];

    for (const notifications of groups.values()) {
      const first = notifications[0];
      if (!first?.target_user_id) continue;

      const ids = notifications.map((notification) => notification.id);
      const { data: stillUnread, error: recheckError } = await admin
        .from("notifications")
        .select("id")
        .in("id", ids)
        .is("read_at", null)
        .is("dismissed_at", null)
        .is("email_sent_at", null);

      if (recheckError) {
        results.push({
          dossierId: first.dossier_id,
          targetUserId: first.target_user_id,
          count: notifications.length,
          status: "failed",
          reason: recheckError.message,
        });
        continue;
      }

      const unreadIds = new Set((stillUnread ?? []).map((row) => row.id as string));
      const unreadNotifications = notifications.filter((notification) =>
        unreadIds.has(notification.id),
      );

      if (unreadNotifications.length === 0) {
        results.push({
          dossierId: first.dossier_id,
          targetUserId: first.target_user_id,
          count: 0,
          status: "skipped",
          reason: "already_read_or_emailed",
        });
        continue;
      }

      const { data: agent, error: agentError } = await admin
        .from("agent_profiles")
        .select("email")
        .eq("id", first.target_user_id)
        .eq("is_active", true)
        .maybeSingle();

      if (agentError || !agent?.email) {
        results.push({
          dossierId: first.dossier_id,
          targetUserId: first.target_user_id,
          count: unreadNotifications.length,
          status: "skipped",
          reason: agentError?.message ?? "agent_email_missing",
        });
        continue;
      }

      const ctaUrl = buildAgentUrl(first.link_path);
      const rendered = renderSelenEmailFromText({
        title:
          unreadNotifications.length === 1
            ? "Un message client vous attend"
            : `${unreadNotifications.length} messages client vous attendent`,
        bodyText: messageDigestBody(unreadNotifications),
        ctaLabel: ctaUrl ? "Ouvrir le dossier" : undefined,
        ctaUrl,
      });

      const email = await sendSelenEmail({
        to: agent.email,
        subject:
          unreadNotifications.length === 1
            ? "Selen — message client non lu"
            : `Selen — ${unreadNotifications.length} messages client non lus`,
        html: rendered.html,
        text: rendered.text,
      });

      if (!email.sent) {
        results.push({
          dossierId: first.dossier_id,
          targetUserId: first.target_user_id,
          count: unreadNotifications.length,
          status: "failed",
          reason: email.error ?? "email_send_failed",
        });
        continue;
      }

      const emailedAt = new Date().toISOString();
      const { error: updateError } = await admin
        .from("notifications")
        .update({ email_sent_at: emailedAt })
        .in(
          "id",
          unreadNotifications.map((notification) => notification.id),
        )
        .is("read_at", null)
        .is("email_sent_at", null);

      results.push({
        dossierId: first.dossier_id,
        targetUserId: first.target_user_id,
        count: unreadNotifications.length,
        status: updateError ? "failed" : "sent",
        reason: updateError?.message,
      });
    }

    return NextResponse.json({
      success: true,
      caller: auth.caller,
      eligible: pending.length,
      groups: groups.size,
      sent: results.filter((result) => result.status === "sent").length,
      failed: results.filter((result) => result.status === "failed").length,
      skipped: results.filter((result) => result.status === "skipped").length,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erreur inconnue",
      },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  return GET(req);
}
