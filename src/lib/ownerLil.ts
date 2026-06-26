export const LIL_OWNER_EMAIL = "hello@selen-editions.fr";

export function isOwnerLil(email?: string | null) {
  return email?.trim().toLowerCase() === LIL_OWNER_EMAIL;
}
