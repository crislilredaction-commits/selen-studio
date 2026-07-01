export type LilInvoiceStatus = "draft" | "generated" | "deposited" | "paid" | "cancelled";
export type LilInvoiceType = "certifopac_single_audit" | "icpf_monthly" | "manual";

export type LilInvoiceLine = {
  label: string;
  details?: string;
  quantity: number;
  unitAmountCents: number;
  totalAmountCents: number;
};

export const INVOICE_TYPES: { value: LilInvoiceType; label: string }[] = [
  { value: "certifopac_single_audit", label: "Certifopac - 1 audit" },
  { value: "icpf_monthly", label: "ICPF - facture mensuelle" },
  { value: "manual", label: "Manuelle" },
];

export const CERTIFOPAC_AUDIT_AMOUNT_CENTS = 42000;

export function eurosToCents(value: string) {
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

export function centsToEuros(cents: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

export function invoiceTypeLabel(type: LilInvoiceType) {
  return INVOICE_TYPES.find((item) => item.value === type)?.label ?? type;
}
