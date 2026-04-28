export const BILLING_INTERVALS = ["monthly", "quarterly", "yearly", "once", "unknown"] as const;

export type BillingInterval = (typeof BILLING_INTERVALS)[number];

export function normalizeBillingInterval(value: unknown): BillingInterval {
  const raw = String(value ?? "").toLowerCase();
  if (raw === "monatlich" || raw === "monthly" || raw === "month") return "monthly";
  if (raw === "quartalsweise" || raw === "quarterly" || raw === "quarter") return "quarterly";
  if (raw === "jährlich" || raw === "jaehrlich" || raw === "yearly" || raw === "annual") return "yearly";
  if (raw === "einmalig" || raw === "once" || raw === "one-time") return "once";
  return "unknown";
}

export function costToMonthly(amount: number, interval: string | null | undefined) {
  switch (normalizeBillingInterval(interval)) {
    case "monthly":
      return amount;
    case "quarterly":
      return amount / 3;
    case "yearly":
      return amount / 12;
    case "once":
    case "unknown":
      return 0;
  }
}

export function costToYearly(amount: number, interval: string | null | undefined) {
  switch (normalizeBillingInterval(interval)) {
    case "monthly":
      return amount * 12;
    case "quarterly":
      return amount * 4;
    case "yearly":
      return amount;
    case "once":
    case "unknown":
      return 0;
  }
}

export function parseAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const normalized = String(value)
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}
