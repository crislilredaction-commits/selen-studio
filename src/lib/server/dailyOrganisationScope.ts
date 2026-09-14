import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

/**
 * Source canonique du périmètre Studio Daily.
 *
 * Un client n'appartient à Daily que si son abonnement Daily est actif. Le
 * simple fait d'exister dans `organisations` (NDA, Prépa, Review, etc.) ne
 * donne jamais accès au pilotage Daily.
 */
export async function getActiveDailyUserIds() {
  const admin = createSupabaseAdminClient();

  const { data: subscriptions, error: subscriptionsError } = await admin
    .from("daily_subscriptions")
    .select("user_id")
    .eq("status", "active");

  if (subscriptionsError) {
    throw new Error(
      `Impossible de déterminer les clients Daily actifs. ${subscriptionsError.message}`,
    );
  }

  return Array.from(
    new Set(
      (subscriptions ?? [])
        .map((row) => row.user_id)
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

export async function getActiveDailyOrganisationIds() {
  const admin = createSupabaseAdminClient();
  const userIds = await getActiveDailyUserIds();

  if (userIds.length === 0) return [] as string[];

  const userResults = await Promise.all(
    userIds.map((userId) => admin.auth.admin.getUserById(userId)),
  );

  const emails = Array.from(
    new Set(
      userResults
        .map(({ data }) => data.user?.email?.trim().toLowerCase())
        .filter((value): value is string => Boolean(value)),
    ),
  );

  if (emails.length === 0) return [] as string[];

  const { data: organisations, error: organisationsError } = await admin
    .from("organisations")
    .select("id,email,status")
    .neq("status", "archived");

  if (organisationsError) {
    throw new Error(
      `Impossible de déterminer les organismes Daily actifs. ${organisationsError.message}`,
    );
  }

  const dailyEmails = new Set(emails);

  return (organisations ?? [])
    .filter((organisation) => {
      const email = organisation.email?.trim().toLowerCase();
      return Boolean(email && dailyEmails.has(email));
    })
    .map((organisation) => organisation.id as string);
}

/**
 * Périmètre métier d'un agent Studio.
 * - un admin actif voit tous les organismes Daily actifs ;
 * - un agent actif ne voit que les organismes qui lui sont affectés dans
 *   `daily_organisation_assignments` ;
 * - une affectation vers un organisme qui n'est plus Daily actif est ignorée.
 *
 * Le service-role reste volontairement cantonné au serveur : il ne doit jamais
 * transformer l'authentification Studio en accès global implicite.
 */
export async function getDailyOrganisationIdsForAgent(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return [] as string[];

  const admin = createSupabaseAdminClient();
  const activeOrganisationIds = await getActiveDailyOrganisationIds();
  if (activeOrganisationIds.length === 0) return [] as string[];

  const [{ data: adminUser, error: adminError }, { data: profile, error: profileError }] = await Promise.all([
    admin
      .from("selen_admin_users")
      .select("role,is_active")
      .eq("email", normalizedEmail)
      .eq("is_active", true)
      .maybeSingle(),
    admin
      .from("agent_profiles")
      .select("id,role,is_active")
      .eq("email", normalizedEmail)
      .eq("is_active", true)
      .maybeSingle(),
  ]);

  if (adminError) throw new Error(`Impossible de vérifier le rôle Studio. ${adminError.message}`);
  if (profileError) throw new Error(`Impossible de vérifier le profil agent. ${profileError.message}`);

  if (adminUser?.role === "admin" || profile?.role === "admin") {
    return activeOrganisationIds;
  }

  if (!profile?.id || profile.role !== "agent") return [] as string[];

  const { data: assignments, error: assignmentsError } = await admin
    .from("daily_organisation_assignments")
    .select("organisation_id")
    .eq("agent_profile_id", profile.id);

  if (assignmentsError) {
    throw new Error(
      `Impossible de déterminer le périmètre Daily de l’agent. ${assignmentsError.message}`,
    );
  }

  const activeSet = new Set(activeOrganisationIds);
  return Array.from(
    new Set(
      (assignments ?? [])
        .map((assignment) => assignment.organisation_id as string | null)
        .filter((organisationId): organisationId is string => Boolean(organisationId && activeSet.has(organisationId))),
    ),
  );
}

export async function isDailyOrganisationInAgentScope(email: string, organisationId: string) {
  if (!organisationId) return false;
  const organisationIds = await getDailyOrganisationIdsForAgent(email);
  return organisationIds.includes(organisationId);
}

export async function isActiveDailyOrganisation(organisationId: string) {
  if (!organisationId) return false;
  const ids = await getActiveDailyOrganisationIds();
  return ids.includes(organisationId);
}

export async function isActiveDailyUser(userId: string) {
  if (!userId) return false;
  const ids = await getActiveDailyUserIds();
  return ids.includes(userId);
}
