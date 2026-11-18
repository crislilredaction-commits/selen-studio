/** Shared validation for Selen Daily billing periods.
 * A billing period is a calendar month, distinct from invoice issue/payment dates.
 */
export type DailyBillingPeriod = { year: number; month: number };

export function parseDailyBillingMonth(value: string): DailyBillingPeriod | null {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  if (year < 2000 || year > 9999) return null;
  return { year, month: Number(match[2]) };
}

export function dailyBillingPeriodBounds(value: string): { start: string; endExclusive: string } {
  const period = parseDailyBillingMonth(value);
  if (!period) throw new Error("Mois de facturation invalide (AAAA-MM).");
  const start = `${period.year}-${String(period.month).padStart(2, "0")}-01`;
  const nextYear = period.month === 12 ? period.year + 1 : period.year;
  const nextMonth = period.month === 12 ? 1 : period.month + 1;
  const endExclusive = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
  return { start, endExclusive };
}

export function dailyInvoiceExternalKey(stripeInvoiceId: string): string {
  if (!/^in_[A-Za-z0-9]+$/.test(stripeInvoiceId)) {
    throw new Error("Identifiant de facture Stripe invalide.");
  }
  return `stripe:daily:${stripeInvoiceId}`;
}

export function dailyManualPeriodKey(subscriptionId: string, month: string): string {
  if (!/^[A-Za-z0-9_-]{6,}$/.test(subscriptionId)) {
    throw new Error("Identifiant d'abonnement invalide.");
  }
  if (!parseDailyBillingMonth(month)) throw new Error("Mois de facturation invalide.");
  return `daily:${subscriptionId}:${month}`;
}
