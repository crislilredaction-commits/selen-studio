import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type AgentRole = "agent" | "admin";

function isValidRole(value: unknown): value is AgentRole {
  return value === "agent" || value === "admin";
}

function normalizeEmail(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

export async function POST(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      return NextResponse.json(
        {
          error:
            "Configuration Supabase incomplète. Vérifiez NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY et SUPABASE_SERVICE_ROLE_KEY.",
        },
        { status: 500 },
      );
    }

    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "").trim();

    if (!token) {
      return NextResponse.json(
        { error: "Session admin introuvable." },
        { status: 401 },
      );
    }

    const body = await request.json();

    const email = normalizeEmail(body.email);
    const role = body.role;

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "Adresse email invalide." },
        { status: 400 },
      );
    }

    if (!isValidRole(role)) {
      return NextResponse.json(
        { error: "Rôle invalide. Choisissez agent ou admin." },
        { status: 400 },
      );
    }

    const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    const { data: userData, error: userError } =
      await supabaseUserClient.auth.getUser();

    if (userError || !userData.user?.email) {
      return NextResponse.json(
        { error: "Impossible de vérifier votre session." },
        { status: 401 },
      );
    }

    const currentAdminEmail = userData.user.email.toLowerCase();

    const { data: adminProfile, error: adminProfileError } =
      await supabaseUserClient
        .from("agent_profiles")
        .select("email, role, is_active")
        .eq("email", currentAdminEmail)
        .eq("is_active", true)
        .maybeSingle();

    if (adminProfileError) {
      return NextResponse.json(
        {
          error: `Impossible de vérifier vos droits admin : ${adminProfileError.message}`,
        },
        { status: 500 },
      );
    }

    if (!adminProfile || adminProfile.role !== "admin") {
      return NextResponse.json(
        { error: "Action réservée aux administrateurs Studio." },
        { status: 403 },
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const redirectTo =
      process.env.NEXT_PUBLIC_STUDIO_LOGIN_URL ||
      "https://studio.selen-editions.fr/login";

    const { error: inviteError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        redirectTo,
      });

    if (inviteError) {
      return NextResponse.json(
        {
          error: `Invitation impossible : ${inviteError.message}`,
        },
        { status: 500 },
      );
    }

    const { error: profileError } = await supabaseAdmin
      .from("agent_profiles")
      .upsert(
        {
          email,
          role,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "email" },
      );

    if (profileError) {
      return NextResponse.json(
        {
          error: `Invitation envoyée, mais profil agent non créé : ${profileError.message}`,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: `Invitation envoyée à ${email}.`,
    });
  } catch (error) {
    console.error("Erreur invitation agent :", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erreur inconnue lors de la création de l’agent.",
      },
      { status: 500 },
    );
  }
}
