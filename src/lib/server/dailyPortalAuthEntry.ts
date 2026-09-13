import { createClient } from "@supabase/supabase-js";

type PortalType = "learner" | "enterprise" | "trainer";

type BuildDailyPortalAuthEntryInput = {
  email: string;
  portalType: PortalType;
  token: string;
};

function publicBaseUrl() {
  return String(
    process.env.NEXT_PUBLIC_VITRINE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://selen-editions.fr",
  )
    .trim()
    .replace(/\/$/, "");
}

function portalPath(type: PortalType, token: string) {
  const role = type === "learner" ? "apprenant" : type === "trainer" ? "formateur" : "entreprise";
  return `/daily/portail/${role}/${token}`;
}

function authAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Configuration Supabase Auth serveur incomplète.");
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function findAuthUserByEmail(email: string) {
  const admin = authAdmin();
  const normalizedEmail = email.trim().toLowerCase();

  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Vérification du compte Auth impossible : ${error.message}`);

    const existing = data.users.find(
      (user) => user.email?.trim().toLowerCase() === normalizedEmail,
    );
    if (existing) return { admin, user: existing };
    if (data.users.length < 1000) return { admin, user: null };
  }

  throw new Error("Vérification du compte Auth interrompue : trop de pages utilisateurs.");
}

export async function buildDailyPortalAuthEntryUrl(input: BuildDailyPortalAuthEntryInput) {
  const email = input.email.trim().toLowerCase();
  const base = publicBaseUrl();
  const nextPath = portalPath(input.portalType, input.token);
  const { admin, user } = await findAuthUserByEmail(email);

  if (user?.last_sign_in_at) {
    return `${base}/client/login?next=${encodeURIComponent(nextPath)}`;
  }

  const linkType = user ? "recovery" as const : "invite" as const;
  const { data, error } = await admin.auth.admin.generateLink({
    type: linkType,
    email,
  });
  if (error) {
    throw new Error(`Création du lien Auth impossible : ${error.message}`);
  }

  const tokenHash = data.properties?.hashed_token;
  if (!tokenHash) {
    throw new Error("Création du lien Auth impossible : token de vérification absent.");
  }

  return `${base}/client/activation?token_hash=${encodeURIComponent(tokenHash)}&type=${linkType}&next=${encodeURIComponent(nextPath)}`;
}
