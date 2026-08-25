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
