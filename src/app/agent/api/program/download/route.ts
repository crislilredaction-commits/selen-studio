import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdminSupabase() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL manquante.");
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY manquante.");
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

function escapeHtml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function GET(req: Request) {
  try {
    const supabase = getAdminSupabase();
    const { searchParams } = new URL(req.url);

    const programVersionId = searchParams.get("programVersionId");
    const dossierId = searchParams.get("dossierId");

    if (!programVersionId || !dossierId) {
      return NextResponse.json(
        { error: "programVersionId ou dossierId manquant." },
        { status: 400 },
      );
    }

    const { data: version, error } = await supabase
      .from("dossier_program_versions")
      .select("*")
      .eq("id", programVersionId)
      .eq("dossier_id", dossierId)
      .maybeSingle();

    if (error || !version) {
      return NextResponse.json(
        { error: "Programme introuvable." },
        { status: 404 },
      );
    }

    const modules = Array.isArray(version.modules) ? version.modules : [];
    const vigilancePoints = Array.isArray(version.vigilance_points)
      ? version.vigilance_points
      : [];

    const modulesHtml = modules
      .map((module: any, index: number) => {
        const chaptersHtml = Array.isArray(module.chapters)
          ? module.chapters
              .map(
                (chapter: any) => `<li>${escapeHtml(chapter.title ?? "")}</li>`,
              )
              .join("")
          : "";

        return `
          <h2>Module ${index + 1} — ${escapeHtml(module.title ?? "")}</h2>
          <p><strong>Durée :</strong> ${escapeHtml(module.duration ?? "")}</p>
          <p><strong>Objectif :</strong> ${escapeHtml(module.objective ?? "")}</p>
          ${
            chaptersHtml
              ? `<p><strong>Chapitres :</strong></p><ul>${chaptersHtml}</ul>`
              : ""
          }
        `;
      })
      .join("");

    const vigilanceHtml = vigilancePoints.length
      ? `<h2>Points de vigilance</h2><ul>${vigilancePoints
          .map((point: string) => `<li>${escapeHtml(point)}</li>`)
          .join("")}</ul>`
      : "";

    const agentCommentHtml = version.agent_comment
      ? `
        <h2>Commentaire du conseiller</h2>
        <p>${escapeHtml(version.agent_comment)}</p>
      `
      : "";

    const html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office"
            xmlns:w="urn:schemas-microsoft-com:office:word"
            xmlns="http://www.w3.org/TR/REC-html40">
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(version.title ?? "Programme")}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              color: #222;
              line-height: 1.5;
              margin: 40px;
            }
            h1 {
              font-size: 22px;
              margin-bottom: 16px;
            }
            h2 {
              font-size: 16px;
              margin-top: 22px;
              margin-bottom: 8px;
            }
            p {
              margin: 6px 0;
            }
            ul {
              margin: 8px 0 8px 18px;
            }
          </style>
        </head>
        <body>
          <h1>${escapeHtml(version.title ?? "Programme de formation")}</h1>

          ${
            version.target_audience
              ? `<p><strong>Public visé :</strong> ${escapeHtml(version.target_audience)}</p>`
              : ""
          }

          ${
            version.overall_objective
              ? `<p><strong>Objectif global :</strong> ${escapeHtml(version.overall_objective)}</p>`
              : ""
          }

          ${
            version.recommended_positioning
              ? `<p><strong>Positionnement recommandé :</strong> ${escapeHtml(version.recommended_positioning)}</p>`
              : ""
          }

          ${
            version.justification
              ? `<p><strong>Justification :</strong> ${escapeHtml(version.justification)}</p>`
              : ""
          }

          ${modulesHtml}
          ${vigilanceHtml}
          ${agentCommentHtml}
        </body>
      </html>
    `;

    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "application/msword; charset=utf-8",
        "Content-Disposition": `attachment; filename="programme-${programVersionId}.doc"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erreur inconnue.",
      },
      { status: 500 },
    );
  }
}
